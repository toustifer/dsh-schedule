import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('..', import.meta.url)
const packageJson = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))

test('declares a web DSH bundle whose patch exists', () => {
  assert.equal(packageJson.dsh?.bundle?.patch, './cordis.patch.yml')
  assert.equal(packageJson.dsh?.client?.platform, 'web')
  assert.ok(existsSync(new URL(packageJson.dsh.bundle.patch, root)))
})

test('built client bundle registers the documented plugin contract', async () => {
  let registered
  globalThis.window = { __ModuleLoader__: { load: (bundle) => { registered = bundle } } }
  await import(new URL(`lib/client.js?test=${Date.now()}`, root))
  assert.equal(registered.id, 'dsh-schedule')
  const plugin = registered.factory((name) => {
    if (name === 'react') return {}
    throw new Error(`unexpected dependency: ${name}`)
  })
  assert.equal(typeof plugin.apply, 'function')
  assert.ok(Array.isArray(plugin.inject))
})

test('built client bundle contains drag-schedule classes and drop target styles', () => {
  const clientCode = readFileSync(new URL('lib/client.js', root), 'utf8')
  assert.ok(clientCode.includes('.dsh-sched-tl-free-box'), 'CSS 应包含 free-box 样式')
  assert.ok(clientCode.includes('.dsh-sched-tl-dragcard'), 'CSS 应包含 dragcard 样式')
  assert.ok(clientCode.includes('dsh-sched-tl-dragcard'), 'DOM 应渲染 dragcard 结构')
  assert.ok(clientCode.includes('selectedUnscheduledId') || clientCode.includes('handleAssignToFree'), '应支持选中待办一键排程到空闲段')
})

test('built client bundle contains quick-adjust delay buttons and logic', () => {
  const clientCode = readFileSync(new URL('lib/client.js', root), 'utf8')
  assert.ok(clientCode.includes('.dsh-sched-tl-adjust-group'), 'CSS 应包含 adjust-group 样式')
  assert.ok(clientCode.includes('.dsh-sched-tl-adjust-btn'), 'CSS 应包含 adjust-btn 样式')
  assert.ok(clientCode.includes('+15m'), '卡片应包含 +15m 快捷延期按钮')
  assert.ok(clientCode.includes('+30m'), '卡片应包含 +30m 快捷延期按钮')
  assert.ok(clientCode.includes('calculateQuickAdjust'), 'bundle 应包含 calculateQuickAdjust 函数')
})

