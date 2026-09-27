import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('..', import.meta.url)
const packageJson = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))

/** 构建产物 —— 契约测试一律针对 DSH 真正加载的 lib/client.js。 */
function bundle() {
  return readFileSync(new URL('lib/client.js', root), 'utf8')
}

const TL_START = 'function TimelineView('
const GOAL_MARK = '// ==================== 目标层(Goal) UI ===================='

/**
 * 切出 TimelineView 的 **JS 区段**(止于紧随其后的目标层组件区段)。
 * 注意:CSS 全部集中在文件顶部的 `const CSS` 里,不在本区段内 ——
 * 样式断言请直接用 bundle() 整体匹配,别塞进来。
 */
function tl(code) {
  const s = code.indexOf(TL_START)
  const e = code.indexOf(GOAL_MARK)
  assert.ok(s >= 0, 'bundle 应包含 TimelineView')
  assert.ok(e > s, 'TimelineView 之后应紧跟目标层组件区段')
  return code.slice(s, e)
}

test('declares a web DSH bundle whose patch exists', () => {
  assert.equal(packageJson.dsh?.bundle?.patch, './cordis.patch.yml')
  assert.equal(packageJson.dsh?.client?.platform, 'web')
  assert.ok(existsSync(new URL(packageJson.dsh.bundle.patch, root)))
})

test('built client bundle registers the documented plugin contract', async () => {
  let registered
  globalThis.window = { __ModuleLoader__: { load: (b) => { registered = b } } }
  await import(new URL(`lib/client.js?test=${Date.now()}`, root))
  assert.equal(registered.id, 'dsh-schedule')
  const plugin = registered.factory((name) => {
    if (name === 'react') return {}
    throw new Error(`unexpected dependency: ${name}`)
  })
  assert.equal(typeof plugin.apply, 'function')
  assert.ok(Array.isArray(plugin.inject))
})

// ---------- 时间轴 ----------

test('timeline ships a 24h grid with hour and half-hour tick styles', () => {
  const code = bundle()
  // 样式(.dsh-sched-tl-grid 等)位于顶部 CSS 常量
  for (const cls of ['.dsh-sched-tl-container', '.dsh-sched-tl-toolbar', '.dsh-sched-tl-grid',
                     '.dsh-sched-tl-hour', '.dsh-sched-tl-hour-label', '.dsh-sched-tl-sub-hour']) {
    assert.ok(code.includes(cls), `CSS 应包含 ${cls}`)
  }
  const t = tl(code)
  assert.ok(t.includes('Array.from({ length: 24 })'), '应按 24 小时生成刻度')
  assert.ok(t.includes('dsh-sched-tl-hour-label'), 'DOM 应渲染小时标签')
  assert.ok(/const hourHeight = 68/.test(t), '每小时基准高度固定为 68px(拖拽时视口不突跳)')
})

test('timeline snaps drops to a 15-minute grid with a live preview block', () => {
  const code = bundle()
  assert.ok(code.includes('.dsh-sched-tl-drop-preview'), 'CSS 应包含落点预览框样式')
  const t = tl(code)
  assert.ok(t.includes('yToSnappedRange'), '应有 y → 时间吸附换算函数')
  assert.ok(t.includes('Math.round(rawMin / 15) * 15'), '吸附步长应为 15 分钟')
  // 落位健壮性:载荷三重兜底 + 松手瞬间按光标 Y 重算(不依赖可能已过期的 state)
  assert.ok(t.includes('window.__DSH_DRAG_ITEM__'), '拖拽载荷应有全局兜底,防止 dataTransfer 丢失')
  assert.ok(t.includes('draggingItemRef.current || draggingItem || window.__DSH_DRAG_ITEM__'),
    '载荷应按 ref → state → 全局 三级回退取值')
  assert.ok(/previewSlot \|\| yToSnappedRange\(relY, dur\)/.test(t),
    '松手时应按光标 Y 兜底重算落点(避免 React state 闭包取到 null)')
  // 落位收敛到唯一写入路径 applyTaskSchedule,三个字段必须一起写
  assert.ok(t.includes('applyTaskSchedule'), '应把排期写入收敛成一个函数')
  assert.ok(/time: start \+ '-' \+ end/.test(t), '写入应拼出 time 区间')
  assert.ok(t.includes('startTime: start'), '写入应带 startTime')
  assert.ok(t.includes('endTime: end'), '写入应带 endTime')
  assert.ok(/applyTaskSchedule\(id, slot\.start, slot\.end\)/.test(t),
    '松手落位应调用统一的写入函数')
})

test('timeline keeps a stable viewport and auto-scrolls only near the edges', () => {
  const code = bundle()
  const t = tl(code)
  assert.ok(t.includes('handleAutoScroll'), '应实现边缘自动巡航滚动')
  assert.ok(t.includes('stopAutoScroll'), '应有巡航滚动的刹车清理')
  assert.ok(t.includes('autoScrollTimerRef'), '巡航滚动由 ref 持有定时器')
  assert.ok(t.includes('scrollContainerRef'), '应有滚动容器 ref')
  assert.ok(t.includes('getBoundingClientRect'), '落点计算应基于容器真实几何')
  assert.ok(/scrollEl\.scrollTop =/.test(t), '打开时应把视口滚到当前时刻附近')
  // 网格不得带 transition,否则拖拽瞬间整条时间轴会位移
  assert.ok(!/\.dsh-sched-tl-grid\s*\{[^}]*transition\s*:/.test(code), '网格不应有 transition 突变')
})

test('timeline offers drag, click-to-place, and one-click schedule-to-now', () => {
  const code = bundle()
  const t = tl(code)
  // 1) 原生拖拽
  assert.ok(t.includes('draggable: true'), '卡片应可拖拽')
  assert.ok(t.includes('onDragStart'), '应监听 onDragStart')
  assert.ok(t.includes('onDrop'), '应监听 onDrop')
  // 2) 选中待办后点击网格直接排期
  assert.ok(t.includes('selectedChipId'), '应支持选中待办后点击网格排期')
  assert.ok(t.includes('👉'), '选中态应有视觉反馈')
  // 3) 一键排到当前
  assert.ok(t.includes('排到当前'), '应有一键排到当前按钮')
  assert.ok(code.includes('.dsh-sched-quick-set'), 'CSS 应包含快捷排期按钮样式')
  // 待排期待办池 + 当前时刻红线
  assert.ok(t.includes('dsh-sched-tl-unplaced'), '应渲染待排期待办池')
  assert.ok(t.includes('dsh-sched-tl-chip'), '待排期条目应渲染为 chip')
  assert.ok(t.includes('dsh-sched-tl-now'), '应渲染当前时刻指示线')
})

// ---------- 目标层 ----------

test('built client bundle implements the goals layer UI', () => {
  const code = bundle()
  // 组件
  for (const fn of ['function GoalChip', 'function GoalsBar', 'function GoalDetailView', 'function GoalForm']) {
    assert.ok(code.includes(fn), `应包含 ${fn}`)
  }
  // 样式
  for (const cls of ['.dsh-sched-goalsbar', '.dsh-sched-goalchip', '.dsh-sched-goalbar',
                     '.dsh-sched-goaldetail-bar', '.dsh-sched-goalbadge', '.dsh-sched-goalhead-btn']) {
    assert.ok(code.includes(cls), `CSS 应包含 ${cls}`)
  }
  // 常驻条可一键隐藏,且状态持久化、默认展开
  assert.ok(code.includes('GOALS_BAR_KEY'), '目标条显隐状态应持久化')
  assert.ok(code.includes('readGoalsBarVisible') && code.includes('writeGoalsBarVisible'),
    '应实现目标条显隐读写')
  assert.ok(/return v === null \? true/.test(code), '目标条默认应展开')
  assert.ok(code.includes('隐藏目标条') && code.includes('显示目标条'), '🎯 按钮应能切换显隐')
  assert.ok(code.includes('localStorage'), '显隐状态应存入 localStorage')
  // 挂载
  assert.ok(code.includes('React.createElement(GoalsBar'), '面板应渲染常驻目标条')
  assert.ok(code.includes('React.createElement(GoalDetailView'), '面板应能渲染目标详情')
  assert.ok(code.includes('React.createElement(GoalForm'), '面板应能渲染目标表单')
  // 日程行徽标 + 跨层级跳转
  assert.ok(code.includes('dsh-sched-goalbadge'), '日程行应渲染目标归属徽标')
  assert.ok(code.includes('store.openGoal'), '应通过共享 store 暴露 openGoal')
  // 数据面接线:增 / 改 / 删 / 归属 / 解除归属
  for (const m of ["'goal-add'", "'goal-update'", "'goal-remove'", "'link-goal'"]) {
    assert.ok(code.includes(m), `客户端应调用 ${m}`)
  }
  // 复用纯逻辑
  assert.ok(code.includes('goalProgressOf'), '应复用 goalProgressOf 计算进度')
  assert.ok(code.includes('formatGoalMetric'), '应复用 formatGoalMetric 渲染数值')
})
