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
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-orb'

// ─────────────────────────────────────────────────────────────
// 必须用硬 inject。这不是风格选择，是实测打脸后的结论：
//
//   第一版为了「避免 fiber 卡住」全用了 `ctx.get('webServer')`，
//   结果在这个宿主里它返回 undefined —— 明明服务存在、别的插件用得好好的。
//   症状是插件每次都静默退出、球永远不出现，终端里只有一行不显眼的 warn。
//   写进 inject 就正常。
//
// 代价要说清楚：inject 的服务若不存在，这个 fiber 会一直 waiting，
// 而宿主的启动检查会把「enabled 但 remains inactive」的条目判为失败 ——
// 也就是说 inject 写错了会连累宿主起不来。
//
// 所以这里只 inject 三个**已经用 `dsh --dump-config` 核实过确实在组合树里**的服务：
//   @deepseek-ai/dsh-host-webserver   (webserver)
//   @deepseek-ai/dsh-session          (session)
//   @deepseek-ai/dsh-subprocess-local (subprocess)
// ─────────────────────────────────────────────────────────────
export const inject = ['webServer', 'sessions', 'subprocess', 'jobs', 'tools']

const ROUTE = '/dsh-orb/status'
const TOKEN = randomBytes(24).toString('hex')

/** 这三种 turn/end 才算失败。aborted（你自己按停）和 interrupted（崩溃后补记）都不算。 */
const FAILED_KINDS = new Set(['error', 'blocked', 'max-tokens'])

/** 举手默认挂多久（毫秒）。 */
const HAND_TTL_MS = 10 * 60 * 1000

/**
 * 关于「要不要自动检测（同一个工具连续失败 N 次就自动举手）」：
 * **决定不做。** 正常迭代里「改一次跑一次」本来就会连续失败几次，
 * 自动判定会频繁误报 —— 而误报会直接毁掉红灯的可信度，
 * 那比没有这个功能更糟。所以举手一律由模型显式调用工具发起。
 */

const HERE = dirname(fileURLToPath(import.meta.url))

// ─────────────────────────────── 启动追踪 ───────────────────────────────
//
// 为什么要有这个文件：
// 这个插件的**每一条失败路径都只记日志、不抛异常**（为了绝不让宿主的启动失败）。
// 代价是「球没起来」的唯一线索只在终端里，而终端不一定看得到 —— 已经因此瞎猜过一轮。
//
// 所以 apply() 每一步都落一行盘。每次启动覆盖重写，不会无限增长。
// 位置：%USERPROFILE%\.dsh\dsh-orb\startup.log

const TRACE_DIR = join(homedir(), '.dsh', 'dsh-orb')
const TRACE_FILE = join(TRACE_DIR, 'startup.log')

let traceStarted = false

function trace(line) {
  try {
    if (!traceStarted) {
      mkdirSync(TRACE_DIR, { recursive: true })
      writeFileSync(TRACE_FILE, '', 'utf8')     // 每次启动重新开始
      traceStarted = true
    }
    appendFileSync(TRACE_FILE, `${new Date().toISOString()}  ${line}\n`, 'utf8')
  } catch { /* 记日志本身绝不能抛 */ }
}

function traceError(label, error) {
  const stack = error && error.stack ? String(error.stack).split('\n').slice(0, 4).join(' | ') : String(error)
  trace(`${label}: ${stack}`)
}

// 模块级就写一行。这样三种情况能彻底分开：
//   完全没有日志   → 模块根本没被加载（解析/挂载问题）
//   只有这一行     → 加载了，但 apply() 没被调用
//   有多行         → apply() 跑过，卡在哪一步一目了然
trace('模块已加载（顶层）')

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

/** 中途举手：模型调用工具发起的，带 TTL。 */
const alerts = new Map()   // sessionId -> { reason, until }

function raiseHand(sessionId, reason, ttlMs) {
  alerts.set(String(sessionId), { reason: String(reason), until: Date.now() + ttlMs })
  return true
}

function clearHand(sessionId) {
  return alerts.delete(String(sessionId))
}

/** 还没过期的举手。顺手清掉过期的。 */
function activeAlerts() {
  const now = Date.now()
  const out = []
  for (const [sessionId, a] of alerts) {
    if (a.until <= now) alerts.delete(sessionId)
    else out.push({ sessionId, reason: a.reason })
  }
  return out
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
  const jobsService = ctx.jobs

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
  let alertReason = null

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

  // 中途举手：只有模型显式调工具才会亮，不做任何自动推断。
  const hands = activeAlerts()
  if (hands.length > 0) alertReason = hands[0].reason

  return {
    ok: true,
    generatedAt: Date.now(),
    running,
    success,
    failure,
    decision,
    alert: alertReason !== null,
    alertReason,
    jobCount: runningJobOwners.size,
  }
}

// ─────────────────────────────── 模型工具 ───────────────────────────────

/**
 * raise_hand —— 让模型能主动点亮红灯。
 *
 * 为什么手写这个对象、而不是 `import { defineTool } from '@deepseek-ai/dsh-tools'`：
 * 本插件的真实路径在仓库里（D:\code\...），而 `@deepseek-ai/*` 在 profile 的
 * node_modules 里 —— 两者不在同一棵目录树上，**ESM 解析不到**（实测 ERR_MODULE_NOT_FOUND，
 * 而且 ESM 不认 NODE_PATH）。硬 import 的后果是模块加载失败，而那是**宿主启动失败**。
 *
 * 好在读了 defineTool 的实现：它主要就是把 DSH 自己的 schema DSL 转成 JSON Schema
 * 再包一层参数校验。所以这里直接手写 JSON Schema，形状完全一致，只是省掉那层转换 ——
 * 参数校验在 execute 里自己做。
 */
const RAISE_HAND_TOOL = {
  name: 'raise_hand',
  description:
    '主动举起警示灯。当你判断自己正在往错误方向前进、或反复撞同一面墙时调用它，'
    + '让用户桌面上的状态球变红，从而引起注意。它**不阻塞**：调用后你继续工作，'
    + '用户看到后可能会插手指引。用户看到（在会话里说话）之后灯会自动熄灭。'
    + '只在确实需要人看一眼时使用 —— 滥用会让这个信号失去意义。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      reason: {
        type: 'string',
        description: '一句话说明你为什么举手，会显示给用户看。例如「同一处编译错误改了 3 次都没过，方向可能不对」。',
      },
      hold_seconds: {
        type: 'number',
        description: '警示灯挂多久（秒）。默认 600，范围 30~3600。',
      },
    },
    required: ['reason'],
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean' },
        held_seconds: { type: 'number' },
      },
      required: ['ok'],
    },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
  },
  async execute(args, exec) {
    const sessionId = exec?.agent !== undefined ? String(exec.agent.id) : 'unknown'
    const reason = typeof args?.reason === 'string' && args.reason.trim() !== ''
      ? args.reason.trim().slice(0, 200)
      : '需要你看一眼'
    const raw = Number(args?.hold_seconds)
    const seconds = Number.isFinite(raw) ? Math.min(3600, Math.max(30, raw)) : HAND_TTL_MS / 1000

    raiseHand(sessionId, reason, seconds * 1000)
    trace(`raise_hand 被调用: session=${sessionId} 挂 ${seconds}s 理由=${reason}`)
    return { ok: true, held_seconds: seconds }
  },
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
  trace('=== apply 进入 ===')
  // 第 2 条防线：整个函数包住，绝不向外抛。
  try {
    trace(`ctx: logger=${typeof ctx?.logger} effect=${typeof ctx?.effect} on=${typeof ctx?.on}`)

    // inject 已经保证这三个存在（不存在的话 apply 根本不会被调用）。
    const webServer = ctx.webServer
    const sessions = ctx.sessions
    const subprocess = ctx.subprocess
    trace(`webServer: port=${webServer?.port}  sessions.list=${typeof sessions?.list}  subprocess.spawn=${typeof subprocess?.spawn}`)

    // 兜底：万一 inject 的语义在未来版本变了，也不要抛。
    if (!webServer || typeof webServer.register !== 'function') {
      warn(ctx, 'webServer 不可用，插件跳过（DSH 不受影响）')
      trace('中止：webServer 不可用')
      return
    }
    if (!sessions || typeof sessions.list !== 'function') {
      warn(ctx, 'sessions 不可用，插件跳过（DSH 不受影响）')
      trace('中止：sessions 不可用')
      return
    }

    const origin = `http://${webServer.host}:${String(webServer.port)}`
    trace(`origin: ${origin}`)

    // ---- 路由 ----
    try {
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
      trace(`路由已注册: ${ROUTE}`)
    } catch (error) {
      traceError('路由注册失败', error)
      warn(ctx, '路由注册失败：' + String(error))
    }

    // ---- 模型工具：raise_hand ----
    try {
      if (ctx.tools && typeof ctx.tools.register === 'function') {
        ctx.effect(() => ctx.tools.register(RAISE_HAND_TOOL), 'dsh-orb: raise_hand')
        trace('raise_hand 已注册 —— 模型现在可以主动举手了')
      } else {
        trace('跳过工具注册：ctx.tools 不可用')
        warn(ctx, 'ctx.tools 不可用，模型无法主动举手（状态接口照常）')
      }
    } catch (error) {
      traceError('工具注册失败', error)
      warn(ctx, '工具注册失败：' + String(error))
    }

    // ---- 观察提问（只旁观，不抢答）----
    // 注意：这里绝不替用户回答。调 next() 让真正的答题方照常工作，
    // 我们只在它 settle 之前把「有待决策」这件事记下来。
    try {
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
      trace('提问观察者已挂')
    } catch (error) {
      traceError('提问观察者挂载失败', error)
    }

    // ---- 「你看过了」的两个触发点（其余按 dsh-notch 的规则，v1 先只做这两个）----
    try {
      ctx.effect(() => ctx.on('session/event', (session, event) => {
      try {
        const type = String(event?.type)
        if (type === 'turn/start') {
          seenAt.set(session.id, Date.now())
        } else if (type === 'user/message') {
          // 注意：这里**不要**再去看 event.data.source。
          // 类型定义里 MessageSourceMap.user = { kind: 'user' } —— 是个对象，
          // 拿它跟字符串 'user' 比永远是 false，红灯就永远不灭（已经踩过一次）。
          // 而 `user/message` 这个事件类型本身就够了：工具结果走的是 tool/result。
          seenAt.set(session.id, Date.now())
          clearHand(session.id)
          trace(`收到用户消息 → 熄灭红灯: ${session.id}`)
        }
      } catch { /* 忽略 */ }
    }), 'dsh-orb: seen tracking')
      trace('已读追踪已挂')
    } catch (error) {
      traceError('已读追踪挂载失败', error)
    }

    // ---- 起球 ----
    let handle
    const exe = locateOrb()
    trace(`DshOrb.exe: ${exe ?? '找不到'}`)
    if (exe === undefined) {
      warn(ctx, `找不到 DshOrb.exe（设 DSH_ORB_EXE 环境变量可以指定）。状态接口照常提供，但没有球。`)
    } else {
      if (!subprocess || typeof subprocess.spawn !== 'function') {
        warn(ctx, 'subprocess 服务不可用，无法起球。状态接口照常提供。')
        trace('跳过起球：subprocess 不可用')
      } else {
        try {
          // 第 4 条防线：起球失败完全隔离。
          // 用 ctx.subprocess 而不是 node:child_process，是为了拿到 kill-on-close 的 Job：
          // DSH 被强杀时由内核连带杀掉球，不需要球自己盯着父进程。
          trace(`准备 spawn: cwd=${dirname(exe)}`)
          handle = subprocess.spawn({
            argv: [exe, '--origin', origin, '--token', TOKEN],
            cwd: dirname(exe),
            stdio: { stdin: 'ignore', stdout: 'inherit', stderr: 'inherit' },
            graceMs: 3000,
          })
          trace(`spawn 返回: ${typeof handle} done=${typeof handle?.done} terminate=${typeof handle?.terminate}`)
          // done 可能 reject，挂一个空 catch 免得变成未处理的 rejection
          safe(() => { handle?.done?.catch?.(() => {}) })
          warn(ctx, `已启动悬浮球：${exe}`)
        } catch (error) {
          handle = undefined
          traceError('spawn 抛异常', error)
          warn(ctx, '起球失败（DSH 不受影响）：' + String(error))
        }
      }
    }

    // ---- 收球 ----
    // 服务销毁时 subprocess 会终止所有托管进程，这里再显式收一次，
    // 保证插件被单独卸载时球也会跟着走。
    try {
      ctx.effect(() => () => {
        trace('收到卸载信号，收球')
        try { handle?.terminate?.() } catch { /* 已经退了 */ }
      }, 'dsh-orb: ball teardown')
    } catch (error) {
      traceError('收球钩子挂载失败', error)
    }

    trace(`=== apply 结束（球: ${handle === undefined ? '未启动' : '已启动'}） ===`)
    warn(ctx, `就绪，状态接口 ${ROUTE}`)
  } catch (error) {
    // 第 2 条防线的兜底：走到这里说明初始化彻底失败，但 DSH 必须照常启动。
    traceError('apply 顶层异常', error)
    warn(ctx, '初始化失败，插件已跳过（DSH 不受影响）：' + String(error))
  }
}
