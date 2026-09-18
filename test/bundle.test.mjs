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

test('built client bundle implements pointer-driven timeline drag and drop with capture and computeDropTime', () => {
  const clientCode = readFileSync(new URL('lib/client.js', root), 'utf8')

  // 1. 验证抓手与样式
  assert.ok(clientCode.includes('.dsh-sched-tl-handle'), 'CSS 应包含 dsh-sched-tl-handle 样式')
  assert.ok(clientCode.includes('touch-action: none'), '抓手样式必须设置 touch-action: none 确保移动端响应')
  assert.ok(clientCode.includes('.dsh-sched-tl-card.dragging'), 'CSS 应包含拖拽半透明悬浮态样式')
  assert.ok(clientCode.includes('.dsh-sched-tl-drop-indicator'), 'CSS 应包含落点吸附提示条样式')
  assert.ok(clientCode.includes('.dsh-sched-tl-floating-hint'), 'CSS 应包含浮动拖拽吸附胶囊提示')

  // 2. 验证 Pointer 事件与 setPointerCapture 实现
  assert.ok(clientCode.includes('startPointerDrag'), 'TimelineView 应包含 Pointer 拖拽处理函数')
  assert.ok(clientCode.includes('setPointerCapture'), '拖拽启动必须尝试调用 setPointerCapture 锁定指针')
  assert.ok(clientCode.includes('pointermove'), '拖拽必须监听 pointermove 事件进行实时落点跟踪')
  assert.ok(clientCode.includes('pointerup'), '松开指针必须监听 pointerup 事件提交更新')
  assert.ok(clientCode.includes('pointercancel'), '拖拽异常必须监听 pointercancel 事件进行安全清理')

  // 3. 验证严禁 HTML5 draggable 冲突
  const tlViewSection = clientCode.slice(clientCode.indexOf('function TimelineView('), clientCode.indexOf('function SchedulePanel('))
  assert.ok(!tlViewSection.includes('draggable: true'), 'TimelineView 绝对严禁使用原生 HTML5 draggable 导致宿主死锁')
  assert.ok(!tlViewSection.includes('onDragStart'), 'TimelineView 绝对严禁使用原生 onDragStart')
  assert.ok(!tlViewSection.includes('onDrop'), 'TimelineView 绝对严禁使用原生 onDrop')

  // 4. 验证核心算法接入与数据更新
  assert.ok(tlViewSection.includes('computeDropTime'), 'TimelineView 拖动中必须调用 computeDropTime 计算落点')
  assert.ok(tlViewSection.includes("onMutate('update'"), '松手完成排程必须触发 onMutate update 更新时间')

  // 5. 验证已排期卡片与未排期卡片均挂载抓手
  assert.ok(tlViewSection.includes('dsh-sched-tl-handle'), '已排期卡片与未排期卡片均应包含抓手节点')
})

test('built client bundle implements Time Ruler axis, draggable handles, and sliding interaction with cascade support', () => {
  const clientCode = readFileSync(new URL('lib/client.js', root), 'utf8')

  // 1. 验证时间轴标尺轨道与抓手样式类
  assert.ok(clientCode.includes('.dsh-sched-tl-ruler-track'), 'CSS 应包含 ruler-track 标尺轨道样式')
  assert.ok(clientCode.includes('.dsh-sched-tl-ruler-handle'), 'CSS 应包含 ruler-handle 标尺抓手样式')
  assert.ok(clientCode.includes('.dsh-sched-tl-ruler-bubble'), 'CSS 应包含 ruler-bubble 动态浮动刻度气泡样式')
  assert.ok(clientCode.includes('cursor: ns-resize'), '抓手样式应包含 ns-resize 调节指针光标')
  assert.ok(clientCode.includes('dsh-sched-ruler-glow') || clientCode.includes('dsh-sched-pulse'), '抓手应包含呼吸光效动画')

  // 2. 验证 DOM 中渲染标尺组件与抓手
  const tlViewSection = clientCode.slice(clientCode.indexOf('function TimelineView('), clientCode.indexOf('function SchedulePanel('))
  assert.ok(tlViewSection.includes('dsh-sched-tl-ruler-track'), 'TimelineView 应渲染 dsh-sched-tl-ruler-track 标尺轨道')
  assert.ok(tlViewSection.includes('dsh-sched-tl-ruler-handle'), 'TimelineView 应渲染 dsh-sched-tl-ruler-handle 标尺抓手')
  assert.ok(tlViewSection.includes('dsh-sched-tl-ruler-bubble'), 'TimelineView 应渲染 dsh-sched-tl-ruler-bubble 浮动气泡')
  assert.ok(tlViewSection.includes('now-handle'), 'Now 当前时间节点应渲染专属 now-handle 游标抓手')

  // 3. 验证 PointerEvent 与滑动计算
  assert.ok(tlViewSection.includes('startRulerSlide'), 'TimelineView 应包含 startRulerSlide 滑动处理函数')
  assert.ok(tlViewSection.includes('setPointerCapture'), '标尺抓手滑动应调用 setPointerCapture')
  assert.ok(tlViewSection.includes('timeRulerShift'), '标尺滑动应调用 timeRulerShift 核心算法进行时序推导')
  assert.ok(tlViewSection.includes('cascade'), '标尺滑动应支持 cascade 级联顺延')
  assert.ok(tlViewSection.includes('snapMinutes'), '标尺滑动应支持 15m 刻度网格吸附')
  assert.ok(tlViewSection.includes("onMutate('update'"), '松手完成滑动必须触发 onMutate update 保存新时间')

  // 4. 验证多端触控 touch-action 与 user-select 防冲突
  assert.ok(clientCode.includes('user-select: none'), 'CSS 应包含 user-select: none')
})


