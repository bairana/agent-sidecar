// 本文件由 AI 生成（DeepSeek Harness 里的 agent 编写），人负责需求与验收。
/**
 * dsh-orb —— 把 DSH 的运行状态喂给桌面悬浮球。
 *
 * 它做两件事：
 *   1. 在 DSH 自己的 web server 上挂一条 loopback 路由 GET /dsh-orb/status
 *   2. 用 ctx.subprocess 把 DshOrb.exe 起起来，并停止时收掉它
 *
 * ─────────────────────────────────────────────────────────────
 * 这个文件里所有的防御都不是洁癖，是有代价的教训：
 * dsh-app-boot 在启动扫尾时会检查加载器树，
 *
 *     const failed = entries.filter(e => e.fiber === undefined && !e.disabled)
 *     if (failed.length > 0) throw new Error('plugin(s) failed to load; Cordis startup failed')
 *
 * 也就是说「一个插件挂了」会变成「DSH 起不来」。所以：
 *
 *   1. 零依赖        只 import node 内置模块。任何第三方 import 都是一个解析失败点，
 *                    而模块解析失败发生在 apply() 之前 —— 那时候写多少 try/catch 都没用。
 *   2. 绝不外抛      apply() 全程包住。出任何事就 warn 一行然后安静返回：
 *                    「装了但什么都不做」远好于「启动失败」。
 *   3. 不用 inject   硬依赖不满足时 fiber 会一直 waiting，而 boot 也拒绝
 *                    「enabled 但 remains inactive」的条目。改用 ctx.get() + 判空。
 *   4. 起球隔离      pwsh/exe 找不到、spawn 抛异常，全都只影响球，不影响 DSH。
 *   5. 能一键停掉    见 cordis.patch.yml。
 */

import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-orb'

const ROUTE = '/dsh-orb/status'
const TOKEN = randomBytes(24).toString('hex')

/** 这三种 turn/end 才算失败。aborted（你自己按停）和 interrupted（崩溃后补记）都不算。 */
const FAILED_KINDS = new Set(['error', 'blocked', 'max-tokens'])

const HERE = dirname(fileURLToPath(import.meta.url))

// ─────────────────────────────── 小工具 ───────────────────────────────

/** 安全地拿 logger：拿不到就退回 console，再不行就吞掉 —— 记日志本身绝不能抛。 */
function warn(ctx, message) {
  try {
    const logger = ctx?.logger
    if (logger && typeof logger.warn === 'function') {
      logger.warn('dsh-orb: %s', message)
      return
    }
  } catch { /* 忽略 */ }
  try { console.warn('[dsh-orb] ' + message) } catch { /* 忽略 */ }
}

/** 包一层，任何异常都变成 undefined —— 一个坏掉的会话不该让整张快照拿不到。 */
function safe(fn, fallback) {
  try { return fn() } catch { return fallback }
}

function isLoopback(req) {
  const ip = req?.socket?.remoteAddress ?? ''
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}

function authorized(req) {
  try {
    const header = req.headers?.authorization
    if (header === `Bearer ${TOKEN}`) return true
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    return url.searchParams.get('token') === TOKEN
  } catch { return false }
}

/** 子会话（subagent）不单独计数 —— 它的工作在父会话里已经体现了。 */
function isChild(session) {
  const h = session?.header
  return h?.parentSession !== undefined || h?.origin === 'subagent'
}

// ─────────────────────────────── 状态 ───────────────────────────────

/** 会话事件流折叠结果的缓存。用 seq 做失效判断，避免每秒重折一遍全部会话。 */
const foldCache = new Map()

function fold(session) {
  const seq = safe(() => session.seq, undefined)
  const hit = foldCache.get(session.id)
  if (hit && seq !== undefined && hit.seq === seq) return hit.folded

  let busy = false
  let lastTurn
  const events = safe(() => session.snapshotEvents(), []) ?? []
  for (const ev of events) {
    if (ev?.type === 'turn/start') {
      busy = true
      lastTurn = undefined
    } else if (ev?.type === 'turn/end') {
      busy = false
      const kind = ev.data?.reason?.kind ?? 'unknown'
      lastTurn = { at: ev.time ?? 0, kind, failed: FAILED_KINDS.has(kind) }
    }
  }
  const folded = { busy, lastTurn }
  if (seq !== undefined) foldCache.set(session.id, { seq, folded })
  return folded
}

/** 每个会话的最后一次「你看过」时间。 */
const seenAt = new Map()

/** 待决策：正在等待回答的 AskUserQuestion。 */
const pendingAsks = new Map()

function bumpAsk(sessionId, delta) {
  const n = (pendingAsks.get(sessionId) ?? 0) + delta
  if (n > 0) pendingAsks.set(sessionId, n)
  else pendingAsks.delete(sessionId)
}

// ─────────────────────────────── 快照 ───────────────────────────────

function buildSnapshot(ctx, sessions) {
  const jobsService = safe(() => ctx.get('jobs'), undefined)

  // 正在跑的后台任务 / 子代理 —— 光看 turn 是不够的：
  // 后台编译放出去以后这一轮就结束了，但活还在干
  const runningJobOwners = new Set()
  const jobs = safe(() => jobsService?.list?.(), []) ?? []
  for (const job of jobs) {
    if (job?.status === 'running' && job.ownerSession !== undefined) {
      runningJobOwners.add(String(job.ownerSession))
    }
  }

  let running = 0
  let success = 0
  let failure = 0

  const list = safe(() => sessions.list(), []) ?? []
  for (const session of list) {
    if (isChild(session)) continue
    const folded = fold(session)
    const busy = folded.busy || runningJobOwners.has(String(session.id))
    if (busy) running++

    if (folded.lastTurn) {
      const seen = seenAt.get(session.id)
      if (seen === undefined || folded.lastTurn.at > seen) {
        if (folded.lastTurn.failed) failure++
        else success++
      }
    }
  }

  let decision = 0
  for (const n of pendingAsks.values()) decision += n

  return {
    ok: true,
    generatedAt: Date.now(),
    running,
    success,
    failure,
    decision,
    alert: false,          // v2：模型主动举手要另注册一个工具，这轮不做
    jobCount: runningJobOwners.size,
  }
}

// ─────────────────────────────── 球的位置 ───────────────────────────────

function locateOrb() {
  const fromEnv = process.env.DSH_ORB_EXE
  if (fromEnv && existsSync(fromEnv)) return fromEnv

  // packages/dsh-orb/lib -> packages/dsh-orb -> packages -> dsh-plugins
  const root = resolve(HERE, '..', '..', '..')
  const candidates = [
    join(root, 'desktop', 'dsh-orb', 'bin', 'Release', 'net10.0-windows', 'DshOrb.exe'),
    join(root, 'desktop', 'dsh-orb', 'bin', 'Debug', 'net10.0-windows', 'DshOrb.exe'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return undefined
}

// ─────────────────────────────── 入口 ───────────────────────────────

export function apply(ctx) {
  // 第 2 条防线：整个函数包住，绝不向外抛。
  try {
    // 第 3 条防线：不用 inject，用 ctx.get() + 判空。
    const webServer = safe(() => ctx.get('webServer'), undefined)
    if (!webServer || typeof webServer.register !== 'function') {
      warn(ctx, '拿不到 webServer，插件不启用（DSH 不受影响）')
      return
    }
    const sessions = safe(() => ctx.get('sessions'), undefined)
    if (!sessions || typeof sessions.list !== 'function') {
      warn(ctx, '拿不到 sessions，插件不启用（DSH 不受影响）')
      return
    }

    const origin = `http://${webServer.host}:${String(webServer.port)}`

    // ---- 路由 ----
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: ROUTE,
      handler: (req, res) => {
        try {
          if (!isLoopback(req) || !authorized(req)) {
            res.writeHead(403, { 'content-type': 'application/json' })
            res.end('{"ok":false}')
            return
          }
          const body = JSON.stringify(buildSnapshot(ctx, sessions))
          res.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          })
          res.end(body)
        } catch (error) {
          // 一条路由失败绝不能让 DSH 受影响
          try {
            res.writeHead(500, { 'content-type': 'application/json' })
            res.end('{"ok":false}')
          } catch { /* 响应可能已经发出去 */ }
          warn(ctx, '快照失败：' + String(error))
        }
      },
    }), 'dsh-orb: status route')

    // ---- 观察提问（只旁观，不抢答）----
    // 注意：这里绝不替用户回答。调 next() 让真正的答题方照常工作，
    // 我们只在它 settle 之前把「有待决策」这件事记下来。
    ctx.effect(() => ctx.on('user-questions/request', (request, next) => {
      let sessionId
      try { sessionId = request?.agent ? String(request.agent.id) : undefined } catch { /* 忽略 */ }
      if (sessionId) bumpAsk(sessionId, 1)

      let result
      try {
        result = next()
      } catch (error) {
        if (sessionId) bumpAsk(sessionId, -1)
        throw error            // 原样抛回，不改行为
      }
      return Promise.resolve(result).finally(() => {
        if (sessionId) bumpAsk(sessionId, -1)
      })
    }, { prepend: true }), 'dsh-orb: ask observer')

    // ---- 「你看过了」的两个触发点（其余按 dsh-notch 的规则，v1 先只做这两个）----
    ctx.effect(() => ctx.on('session/event', (session, event) => {
      try {
        const type = String(event?.type)
        if (type === 'turn/start') {
          seenAt.set(session.id, Date.now())
        } else if (type === 'user/message' && event?.data?.source === 'user') {
          seenAt.set(session.id, Date.now())
        }
      } catch { /* 忽略 */ }
    }), 'dsh-orb: seen tracking')

    // ---- 起球 ----
    let handle
    const exe = locateOrb()
    if (exe === undefined) {
      warn(ctx, `找不到 DshOrb.exe（设 DSH_ORB_EXE 环境变量可以指定）。状态接口照常提供，但没有球。`)
    } else {
      const subprocess = safe(() => ctx.get('subprocess'), undefined)
      if (!subprocess || typeof subprocess.spawn !== 'function') {
        warn(ctx, '拿不到 subprocess 服务，无法起球。状态接口照常提供。')
      } else {
        try {
          // 第 4 条防线：起球失败完全隔离。
          // 用 ctx.subprocess 而不是 node:child_process，是为了拿到 kill-on-close 的 Job：
          // DSH 被强杀时由内核连带杀掉球，不需要球自己盯着父进程。
          handle = subprocess.spawn({
            argv: [exe, '--origin', origin, '--token', TOKEN],
            cwd: dirname(exe),
            stdio: { stdin: 'ignore', stdout: 'inherit', stderr: 'inherit' },
            graceMs: 3000,
          })
          // done 可能 reject，挂一个空 catch 免得变成未处理的 rejection
          safe(() => { handle?.done?.catch?.(() => {}) })
          warn(ctx, `已启动悬浮球：${exe}`)
        } catch (error) {
          handle = undefined
          warn(ctx, '起球失败（DSH 不受影响）：' + String(error))
        }
      }
    }

    // ---- 收球 ----
    // 服务销毁时 subprocess 会终止所有托管进程，这里再显式收一次，
    // 保证插件被单独卸载时球也会跟着走。
    ctx.effect(() => () => {
      try { handle?.terminate?.() } catch { /* 已经退了 */ }
    }, 'dsh-orb: ball teardown')

    warn(ctx, `就绪，状态接口 ${ROUTE}`)
  } catch (error) {
    // 第 2 条防线的兜底：走到这里说明初始化彻底失败，但 DSH 必须照常启动。
    warn(ctx, '初始化失败，插件已跳过（DSH 不受影响）：' + String(error))
  }
}
