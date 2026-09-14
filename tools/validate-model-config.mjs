// 本文件由 AI 生成（DeepSeek Harness 里的 agent 编写），人负责需求与验收。
// Validate the live settings.yaml against the real llm-deepseek resolver.
const DSH = 'file:///C:/Users/18335/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules'
const YAML = (await import(`${DSH}/yaml/dist/index.js`)).default
const { resolveAdapterOptions } = await import(`${DSH}/@deepseek-ai/dsh-llm-deepseek/lib/index.js`)
const { readFile } = await import('node:fs/promises')

const doc = YAML.parse(await readFile('C:/Users/18335/.dsh/settings.yaml', 'utf8'))
const resolved = resolveAdapterOptions(doc['llm-deepseek'] ?? {}, undefined)
console.log('resolved catalog (what the adapter advertises to the harness):')
for (const m of resolved.models) {
  console.log('  -', m.id.padEnd(20), '|', String(m.name).padEnd(16), '| modalities:', m.inputModalities.join('+'),
    '| pixels:', m.imagePixelBudget ?? '-', '| bytes:', m.imageMaxBytes ?? '-')
}
console.log('\nagent-default-model:', JSON.stringify(doc['agent-default-model']))
const def = doc['agent-default-model']?.model
const hit = resolved.models.find((m) => m.id === def)
console.log('default model resolves:', hit ? `YES (${hit.name}, ${hit.inputModalities.join('+')})` : 'NO — NOT IN CATALOG')
