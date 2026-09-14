// 本文件由 AI 生成（DeepSeek Harness 里的 agent 编写），人负责需求与验收。
/**
 * dsh-balance-files — Host half.
 *
 * Registers JSON routes on the shared `webServer` for the DeepSeek account
 * balance and the Files API (list / upload / retrieve / delete). All DeepSeek
 * calls go through the global `fetch` with the credential resolved per
 * operation through `ctx.credentials` (never cached across calls).
 */
export const name = 'dsh-balance-files'

export const inject = ['credentials', 'webServer']

/** DeepSeek API base URL (chat-completions family: balance + files live here). */
const DEFAULT_BASE_URL = 'https://api.deepseek.com'

/** Credential reference backing every request. */
const API_KEY_REF = 'DEEPSEEK_API_KEY'

/** Browser-facing prefix of this plugin's API. */
const API_PREFIX = '/api/ds'

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** Read a full request body as text (small JSON payloads only). */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 8 * 1024 * 1024) {
        reject(new Error('request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

/** Pathname of an incoming request URL. */
function pathnameOf(req) {
  const raw = req.url ?? '/'
  const q = raw.indexOf('?')
  return q < 0 ? raw : raw.slice(0, q)
}

export function apply(ctx) {
  /** Resolve the API key for one operation. */
  async function apiKey() {
    const hit = await ctx.credentials.resolve(API_KEY_REF)
    if (hit === undefined || !hit.value) {
      throw new Error('DEEPSEEK_API_KEY is not configured')
    }
    return hit.value
  }

  /** One DeepSeek API call with the key resolved per operation. */
  async function dsFetch(path, init) {
    const key = await apiKey()
    const base = process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
    const text = await response.text()
    let body
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = { raw: text }
    }
    if (!response.ok) {
      throw new Error(`DeepSeek API ${response.status}: ${text.slice(0, 300)}`)
    }
    return body
  }

  /** GET /api/ds/balance — account balance. */
  ctx.webServer.register({
    kind: 'exact',
    path: `${API_PREFIX}/balance`,
    handler: async (req, res) => {
      if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method-not-allowed' })
      try {
        const body = await dsFetch('/user/balance')
        json(res, 200, { ok: true, ...body })
      } catch (error) {
        json(res, 502, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

  /** GET /api/ds/files — list files. */
  /** POST /api/ds/files — upload one file ({ filename, contentBase64 }). */
  ctx.webServer.register({
    kind: 'exact',
    path: `${API_PREFIX}/files`,
    handler: async (req, res) => {
      try {
        if (req.method === 'GET') {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const limit = url.searchParams.get('limit') ?? '50'
          const after = url.searchParams.get('after')
          const order = url.searchParams.get('order') ?? 'desc'
          const query = `limit=${encodeURIComponent(limit)}&order=${encodeURIComponent(order)}${after ? `&after=${encodeURIComponent(after)}` : ''}`
          const body = await dsFetch(`/files?${query}`)
          json(res, 200, { ok: true, ...body })
          return
        }
        if (req.method === 'POST') {
          const raw = await readBody(req)
          const input = JSON.parse(raw)
          if (!input.filename || !input.contentBase64) {
            return json(res, 400, { ok: false, error: 'filename and contentBase64 are required' })
          }
          const key = await apiKey()
          const base = process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL
          const bytes = Buffer.from(input.contentBase64, 'base64')
          const form = new FormData()
          form.append('file', new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }), input.filename)
          form.append('purpose', 'user_data')
          // Optional expiry: { anchor: 'created_at', seconds: 3600..2592000 }; absent = permanent.
          const expiresAfter = input.expiresAfter
          if (expiresAfter && Number.isInteger(expiresAfter.seconds)) {
            const seconds = expiresAfter.seconds
            if (seconds < 3600 || seconds > 2592000) {
              return json(res, 400, { ok: false, error: 'expiresAfter.seconds must be between 3600 and 2592000' })
            }
            form.append('expires_after[anchor]', 'created_at')
            form.append('expires_after[seconds]', String(seconds))
          }
          const response = await fetch(`${base}/files`, {
            method: 'POST',
            headers: { authorization: `Bearer ${key}` },
            body: form,
          })
          const text = await response.text()
          let body
          try {
            body = text ? JSON.parse(text) : null
          } catch {
            body = { raw: text }
          }
          if (!response.ok) {
            return json(res, 502, { ok: false, error: `DeepSeek API ${response.status}: ${text.slice(0, 300)}` })
          }
          json(res, 200, { ok: true, ...body })
          return
        }
        json(res, 405, { ok: false, error: 'method-not-allowed' })
      } catch (error) {
        json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

  /** GET/DELETE /api/ds/files/:id — retrieve or delete one file. */
  ctx.webServer.register({
    kind: 'prefix',
    path: `${API_PREFIX}/files`,
    handler: async (req, res) => {
      try {
        const pathname = pathnameOf(req)
        if (pathname === `${API_PREFIX}/files`) {
          return json(res, 404, { ok: false, error: 'missing file id' })
        }
        const id = decodeURIComponent(pathname.slice(`${API_PREFIX}/files/`.length))
        if (!id) return json(res, 404, { ok: false, error: 'missing file id' })
        if (req.method === 'GET') {
          const body = await dsFetch(`/files/${encodeURIComponent(id)}`)
          json(res, 200, { ok: true, ...body })
          return
        }
        if (req.method === 'DELETE') {
          const key = await apiKey()
          const base = process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL
          const response = await fetch(`${base}/files/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { authorization: `Bearer ${key}` },
          })
          const text = await response.text()
          let body
          try {
            body = text ? JSON.parse(text) : null
          } catch {
            body = { raw: text }
          }
          if (!response.ok) {
            return json(res, 502, { ok: false, error: `DeepSeek API ${response.status}: ${text.slice(0, 300)}` })
          }
          json(res, 200, { ok: true, ...body })
          return
        }
        json(res, 405, { ok: false, error: 'method-not-allowed' })
      } catch (error) {
        json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    },
  })
}
