#!/usr/bin/env node
// 本文件由 AI 生成（DeepSeek Harness 里的 agent 编写），人负责需求与验收。
/**
 * patch-cachehit-2dp.mjs — render the cache-hit rate with 2 decimals.
 *
 * DeepSeek Harness ships `dsh-client-ui-chat` with a cache-hit formatter that
 * only supports 0 or 1 decimal place: both `roundedPercentUnits` and
 * `displayPercentUnits` hard-code decimal handling for a single digit, and the
 * "would round to 100%" guard uses a fixed 1e3 threshold. Raising the requested
 * precision without generalizing those helpers first produces wrong text, so
 * this script widens the helpers and then raises the two call sites.
 *
 * Idempotent: re-running after a `npm i -g @deepseek-ai/dsh@<version>` upgrade
 * re-applies it. Exits non-zero if an anchor is missing, which means upstream
 * changed the code and the patch needs a look.
 *
 * Usage: node patch-cachehit-2dp.mjs [dshInstallDir]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DECIMALS = 2
const target = join(
  process.argv[2] ??
    join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@deepseek-ai', 'dsh'),
  'node_modules', '@deepseek-ai', 'dsh-client-ui-chat', 'lib', 'client.js',
)

if (!existsSync(target)) {
  console.error(`target not found: ${target}`)
  process.exit(2)
}

let src = readFileSync(target, 'utf8')
const before = src
const report = []

/** Replace exactly one occurrence; record whether it was needed. */
function sub(label, from, to) {
  const count = src.split(from).length - 1
  if (count === 0) {
    report.push(`  MISS   ${label} — anchor absent (already patched, or upstream changed)`)
    return
  }
  if (count > 1) {
    report.push(`  WARN   ${label} — ${count} occurrences, expected 1`)
  }
  src = src.replace(from, to)
  report.push(`  patch  ${label}`)
}

// 1) unit scale: was (decimalPlaces === 0 ? 1 : 10) * 100
sub(
  'roundedPercentUnits: scale',
  'const scale = (decimalPlaces === 0 ? 1 : 10) * 100;',
  'const scale = 100 * Math.pow(10, decimalPlaces);',
)

// 2) "would round to 100%" guard: threshold must scale with the unit scale too
sub(
  'formatCacheHitPercent: 100% guard threshold',
  'if (roundedUnits < (decimalPlaces === 0 ? 100 : 1e3)) return displayPercentUnits(roundedUnits, decimalPlaces);',
  'if (roundedUnits < 100 * Math.pow(10, decimalPlaces)) return displayPercentUnits(roundedUnits, decimalPlaces);',
)

// 3) display: pad the fraction to the requested width (toFixed semantics)
sub(
  'displayPercentUnits: pad to decimalPlaces',
  'const whole = Math.floor(units / 10);\n\t\t\tconst tenths = units % 10;\n\t\t\treturn tenths === 0 ? String(whole) : `${whole}.${tenths}`;',
  'const unit = Math.pow(10, decimalPlaces);\n\t\t\tconst whole = Math.floor(units / unit);\n\t\t\tconst fraction = units % unit;\n\t\t\treturn `${whole}.${String(fraction).padStart(decimalPlaces, "0")}`;',
)

// 4) a full cache hit must honour the requested width as well
sub(
  'formatCacheHitPercent: full-hit 100',
  'if (missedInputTokens === 0) return "100";',
  'if (missedInputTokens === 0) return decimalPlaces === 0 ? "100" : (100).toFixed(decimalPlaces);',
)

// 5) the session stats line + Token usage panel (both read this one value)
sub(
  'cacheHitPercent: request 2 decimals',
  'return formatCacheHitPercent(usage.cacheReadTokens, denominator);',
  `return formatCacheHitPercent(usage.cacheReadTokens, denominator, ${DECIMALS});`,
)

// 6) the per-turn usage panel, so every cache-hit surface agrees
sub(
  'TurnUsagePanel: request 2 decimals',
  'formatCacheHitPercent(usage.cacheReadTokens, usage.totalTokens - usage.outputTokens, 1);',
  `formatCacheHitPercent(usage.cacheReadTokens, usage.totalTokens - usage.outputTokens, ${DECIMALS});`,
)

console.log(`target: ${target}`)
console.log(report.join('\n'))
if (src === before) {
  console.log('\nno change — already at 2 decimals (or anchors moved)')
} else {
  writeFileSync(target, src)
  const remaining = src.match(/decimalPlaces === 0 \? 1 : 10|decimalPlaces === 0 \? 100 : 1e3/)
  console.log(`\nwritten (${before.length} -> ${src.length} bytes)`)
  console.log(remaining ? `WARNING: legacy precision branch still present: ${remaining[0]}` : 'legacy precision branches: none left')
}
