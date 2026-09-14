// 本文件由 AI 生成（DeepSeek Harness 里的 agent 编写），人负责需求与验收。
// Probe the DeepSeek endpoint: list models, then test image input per model.
// Usage: $env:DEEPSEEK_API_KEY='...'; node probe-models.mjs [modelId ...]
import zlib from 'node:zlib'

const KEY = process.env.DEEPSEEK_API_KEY
const BASE = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'
if (!KEY) { console.error('missing DEEPSEEK_API_KEY'); process.exit(2) }

const CRC = (() => {
  const t = []
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const t = Buffer.from(type, 'ascii')
  let crc = 0xffffffff
  for (const b of Buffer.concat([t, data])) crc = CRC[(crc ^ b) & 0xff] ^ (crc >>> 8)
  crc = (crc ^ 0xffffffff) >>> 0
  const c = Buffer.alloc(4); c.writeUInt32BE(crc)
  return Buffer.concat([len, t, data, c])
}
function makePng(w, h, rgb) {
  const stride = w * 3 + 1
  const raw = Buffer.alloc(stride * h)
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0
    for (let x = 0; x < w; x++) { const o = y * stride + 1 + x * 3; raw[o] = rgb[0]; raw[o + 1] = rgb[1]; raw[o + 2] = rgb[2] }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}

// 1) live model list
const mRes = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${KEY}` } })
const mBody = await mRes.json()
console.log(`[models] HTTP ${mRes.status} — ${mBody.data.length} entries`)
for (const m of mBody.data) console.log(`  - ${m.id}`)

// 2) image probe per model
const targets = process.argv.slice(2)
if (targets.length === 0) process.exit(0)

const png = makePng(64, 64, [255, 0, 0]) // solid red
const form = new FormData()
form.append('purpose', 'user_data')
form.append('file', new Blob([png], { type: 'image/png' }), 'probe-red.png')
form.append('expires_after[anchor]', 'created_at')
form.append('expires_after[seconds]', '3600')
const upRes = await fetch(`${BASE}/files`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form })
const upText = await upRes.text()
if (!upRes.ok) { console.error(`[upload] HTTP ${upRes.status} ${upText.slice(0, 300)}`); process.exit(1) }
const fileId = JSON.parse(upText).id
console.log(`\n[upload] ok — file_id=${fileId} (64x64 solid red PNG)`)

for (const model of targets) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '这张图是什么颜色？只回答颜色名，两个字以内。' },
          { type: 'file', file_id: fileId },
        ],
      }],
      max_tokens: 64,
      thinking: { type: 'disabled' },
    }),
  })
  const text = await res.text()
  let verdict
  try {
    const j = JSON.parse(text)
    const msg = j.choices?.[0]?.message
    verdict = msg ? `answer="${(msg.content || '').trim()}"` : JSON.stringify(j).slice(0, 200)
  } catch { verdict = text.slice(0, 200) }
  console.log(`  ${model.padEnd(38)} HTTP ${res.status}  ${verdict}`)
}

const del = await fetch(`${BASE}/files/${fileId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${KEY}` } })
console.log(`\n[cleanup] HTTP ${del.status}`)
