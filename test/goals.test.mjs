import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'

// logic.cjs 是 CommonJS(供构建期内联 + node:test 双用),ESM 测试里要用 createRequire 载入
const require = createRequire(import.meta.url)

import {
  ScheduleStore, normalizeGoal, goalProgress,
  GOAL_HORIZONS, GOAL_METRIC_TYPES, GOAL_STATUSES,
} from '../src/store.js'

const root = new URL('..', import.meta.url)

/** 每个用例一个独立数据文件,互不串味。 */
function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-goal-'))
  const path = join(dir, 'data.json')
  const store = new ScheduleStore({ path, legacyPath: join(dir, 'legacy.json') })
  return { dir, path, store }
}

// ---------- 目标模型 ----------

test('normalizeGoal defaults horizon/metric and derives the end date', () => {
  const g = normalizeGoal({ title: '四级 600 分' }, Date.now(), '2026-09-01')
  assert.equal(g.title, '四级 600 分')
  assert.equal(g.horizon, 'custom')
  assert.equal(g.startDate, '2026-09-01')
  assert.equal(g.endDate, '2026-11-30', 'custom 缺省跨度应为 +90 天')
  assert.equal(g.metric.type, 'percent')
  assert.equal(g.metric.target, 100)
  assert.equal(g.metric.current, 0)
  assert.equal(g.status, 'active')
  assert.ok(g.id.startsWith('goal_'))

  // 学期 / 学年缺省跨度
  assert.equal(normalizeGoal({ title: 't', horizon: 'term' }, 1, '2026-09-01').endDate, '2027-01-19')
  assert.equal(normalizeGoal({ title: 'y', horizon: 'year' }, 1, '2026-09-01').endDate, '2027-06-08')
})

test('normalizeGoal rejects bad input and clamps milestone/progress', () => {
  assert.throws(() => normalizeGoal({ title: '   ' }), /标题不能为空/)
  assert.throws(() => normalizeGoal({ title: 'x', startDate: '2026-02-30' }), /无效开始日期/)
  assert.throws(() => normalizeGoal({ title: 'x', endDate: '2026-13-01' }), /无效结束日期/)
  assert.throws(
    () => normalizeGoal({ title: 'x', startDate: '2026-09-01', endDate: '2026-08-01' }),
    /结束日期不能早于开始日期/)
  // milestone 强制 target = 1
  const m = normalizeGoal({ title: 'm', metric: { type: 'milestone', target: 999 } }, 1, '2026-09-01')
  assert.equal(m.metric.target, 1)
  // current 超过 target 时夹到 target
  const c = normalizeGoal({ title: 'c', metric: { type: 'count', target: 12, current: 99 } }, 1, '2026-09-01')
  assert.equal(c.metric.current, 12)
  // percent 缺省单位 %
  assert.equal(normalizeGoal({ title: 'p' }, 1, '2026-09-01').metric.unit, '%')
})

// ---------- 目标 CRUD ----------

test('goal CRUD round-trips through the store', async () => {
  const { store, path, dir } = fresh()
  try {
    const { goal, goals } = await store.addGoal(
      { title: '考四级', horizon: 'term', metric: { type: 'score', target: 600, current: 420, unit: '分' } },
      Date.now(), '2026-09-01'
    )
    assert.equal(goals, 1)

    await store.updateGoal(goal.id, { metric: { current: 600 }, status: 'done' })
    let list = await store.listGoals(undefined, '2026-09-01')
    assert.equal(list.length, 1)
    assert.equal(list[0].metric.current, 600)
    assert.equal(list[0].status, 'done')
    assert.equal(list[0].progress.percent, 100)

    // 按 status 过滤
    assert.equal((await store.listGoals('active', '2026-09-01')).length, 0)
    assert.equal((await store.listGoals('done', '2026-09-01')).length, 1)
    assert.equal((await store.listGoals('dropped', '2026-09-01')).length, 0)

    // 落盘版本与字段
    const disk = JSON.parse(readFileSync(path, 'utf8'))
    assert.equal(disk.version, 2, '写入应升级到 version 2')
    assert.equal(disk.goals.length, 1)
    assert.ok(Array.isArray(disk.items) && typeof disk.done === 'object')

    const rm = await store.removeGoal(goal.id)
    assert.equal(rm.goals, 0)
    assert.equal((await store.listGoals(undefined, '2026-09-01')).length, 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('updateGoal validates dates and only touches provided fields', async () => {
  const { store, dir } = fresh()
  try {
    const { goal } = await store.addGoal({ title: '原名', note: '原备注' }, Date.now(), '2026-09-01')
    await store.updateGoal(goal.id, { title: '新名' })
    let list = await store.listGoals(undefined, '2026-09-01')
    assert.equal(list[0].title, '新名')
    assert.equal(list[0].note, '原备注', '未提供的字段不应被改动')
    assert.equal(list[0].horizon, 'custom', '未提供 horizon 应保持原值')

    await assert.rejects(() => store.updateGoal(goal.id, { endDate: '2026-02-30' }), /无效日期/)
    await assert.rejects(() => store.updateGoal('goal_nope', { title: 'x' }), /找不到该目标/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// ---------- 归属 ----------

test('linkGoal binds and unbinds items, and rejects unknown goals', async () => {
  const { store, dir } = fresh()
  try {
    const { goal } = await store.addGoal({ title: '目标A' }, Date.now(), '2026-09-01')
    const { item } = await store.addItem({ title: '背单词', date: '2026-09-01' })

    assert.equal((await store.snapshot()).items[0].goalId, null, '新日程默认不归属')

    await store.linkGoal(item.id, goal.id)
    let snap = await store.snapshot()
    assert.equal(snap.items[0].goalId, goal.id)

    await assert.rejects(() => store.linkGoal(item.id, 'goal_ghost'), /找不到该目标/)

    // 传空串 = 解除归属
    await store.linkGoal(item.id, '')
    assert.equal((await store.snapshot()).items[0].goalId, null)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('removeGoal unlinks its items instead of deleting them', async () => {
  const { store, dir } = fresh()
  try {
    const { goal } = await store.addGoal({ title: '将删除的目标' }, Date.now(), '2026-09-01')
    const a = await store.addItem({ title: 'A', date: '2026-09-01' })
    const b = await store.addItem({ title: 'B', date: '2026-09-01' })
    await store.linkGoal(a.item.id, goal.id)
    await store.linkGoal(b.item.id, goal.id)

    await store.removeGoal(goal.id)
    const snap = await store.snapshot()
    assert.equal(snap.goals.length, 0)
    assert.equal(snap.items.length, 2, '日程本身不能被连带删除')
    assert.ok(snap.items.every((i) => i.goalId === null), '归属应被清空')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// ---------- 进度 ----------

test('goalProgress prefers manual current and falls back to linked completion', () => {
  const goal = {
    id: 'goal_1', horizon: 'term', startDate: '2026-09-01', endDate: '2026-12-31',
    metric: { type: 'score', target: 600, current: 420, unit: '分' },
  }
  const data = {
    items: [{ id: 'a', goalId: 'goal_1' }, { id: 'b', goalId: 'goal_1' }, { id: 'c', goalId: null }],
    done: { a: { '2026-09-10': true } },
  }
  const p = goalProgress(goal, data, '2026-09-01')
  assert.equal(p.current, 420)
  assert.equal(p.target, 600)
  assert.equal(p.percent, 70)
  assert.equal(p.derived, false, '手填进度优先于派生')
  assert.equal(p.linkedTotal, 2, '只统计归属本目标的日程')
  assert.equal(p.linkedDone, 1)
  assert.equal(p.remainingDays, 121, '剩余天数按 endDate - today 计算')

  // current 为 0 且有挂载日程 → 派生
  const zero = { ...goal, metric: { type: 'score', target: 2, current: 0, unit: '套' } }
  const d2 = goalProgress(zero, data, '2026-09-01')
  assert.equal(d2.derived, true)
  assert.equal(d2.current, 1, '派生态等于已完成日程数')
  assert.equal(d2.percent, 50)

  // 无挂载日程且 current 为 0 → 不派生
  const d3 = goalProgress(zero, { items: [], done: {} }, '2026-09-01')
  assert.equal(d3.derived, false)
  assert.equal(d3.percent, 0)

  // 越界夹取 + 空输入
  assert.equal(goalProgress({ ...goal, metric: { target: 10, current: 99 } }, data, '2026-09-01').percent, 100)
  assert.equal(goalProgress(null, data, '2026-09-01').percent, 0)
})

// ---------- 兼容性 ----------

test('legacy data files without goals load as an empty goal list', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-goal-legacy-'))
  const path = join(dir, 'data.json')
  try {
    writeFileSync(path, JSON.stringify({
      version: 1,
      items: [{ id: 'dt_1', title: '旧日程', recurring: 'once', date: '2026-09-01' }],
      done: { dt_1: { '2026-09-01': true } },
    }), 'utf8')

    const store = new ScheduleStore({ path, legacyPath: join(dir, 'none.json') })
    const snap = await store.snapshot('2026-09-01')
    assert.equal(snap.goals.length, 0, '无 goals 字段应视为空数组')
    assert.equal(snap.items.length, 1, '旧日程应完好保留')
    assert.equal(snap.items[0].goalId, null, '旧日程 goalId 应补为 null')
    // 保存后应升到 version 2 且写出 goals
    await store.addGoal({ title: '新目标' }, Date.now(), '2026-09-01')
    const disk = JSON.parse(readFileSync(path, 'utf8'))
    assert.equal(disk.version, 2)
    assert.equal(disk.goals.length, 1)
    assert.equal(disk.items.length, 1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// ---------- 宿主契约 ----------

test('host registers the goal tools and HTTP data plane', () => {
  const host = readFileSync(new URL('lib/index.js', root), 'utf8')
  const tools = [...host.matchAll(/'dailytask_[a-z_]+'/g)].map((m) => m[0].slice(1, -1))
  assert.equal(tools.length, 14, '工具总数应为 14(6 日程 + 5 目标 + 3 通用)')
  for (const t of ['dailytask_goal_add', 'dailytask_goal_list', 'dailytask_goal_update',
                   'dailytask_goal_delete', 'dailytask_link_goal']) {
    assert.ok(tools.includes(t), `应注册 ${t}`)
  }
  const routes = [...host.matchAll(/route\('([^']+)'/g)].map((m) => m[1])
  for (const r of ['/goal-add', '/goal-list', '/goal-update', '/goal-remove', '/link-goal']) {
    assert.ok(routes.includes(r), `应暴露 ${r}`)
  }
  // 日程工具应开放 goal_id 归属参数
  assert.ok(host.includes('goal_id'), 'dailytask_add / update 应支持 goal_id')
  assert.ok(host.includes('goalArgsFrom'), '应有 snake_case → camelCase 的入参映射')
})

test('日程工具的 description 明写 goal_id —— 模型只看得见描述,看不见未文档化的参数', () => {
  const host = readFileSync(new URL('lib/index.js', root), 'utf8')

  /** 取 makeTool('name', '<description>', …) 里的描述串。 */
  function descriptionOf(name) {
    const at = host.indexOf("'" + name + "',")
    assert.ok(at > 0, `应能定位 ${name} 的工具定义`)
    const open = host.indexOf("'", at + name.length + 3)
    const close = host.indexOf("'", open + 1)
    return host.slice(open + 1, close)
  }

  const add = descriptionOf('dailytask_add')
  const update = descriptionOf('dailytask_update')

  assert.ok(add.includes('goal_id'),
    'dailytask_add 的描述应提到 goal_id,否则模型不会主动挂目标')
  assert.ok(update.includes('goal_id'),
    'dailytask_update 的描述应提到 goal_id 及其解除语义')
  // 描述里还应指明「为什么要挂」,而不只是列个字段名
  assert.ok(/长期目标|目标/.test(add), '描述应说明 goal_id 指向长期目标')
})

test('client-side goal helpers stay in sync with the host model', () => {
  const logic = require('../src/client/logic.cjs')
  // 枚举必须与 store 对齐,否则 UI 会出现宿主不认的状态
  for (const h of GOAL_HORIZONS) assert.ok(logic.GOAL_HORIZON_META[h], `horizon ${h} 应有元数据`)
  for (const s of GOAL_STATUSES) assert.ok(logic.GOAL_STATUS_META[s], `status ${s} 应有元数据`)
  for (const m of GOAL_METRIC_TYPES) assert.ok(logic.GOAL_METRIC_LABEL[m], `metric ${m} 应有标签`)

  const goal = { id: 'g', endDate: '2026-12-31', metric: { type: 'score', target: 600, current: 420, unit: '分' } }
  const data = { items: [{ id: 'a', goalId: 'g' }], done: {} }
  const clientProg = logic.goalProgressOf(goal, data, '2026-09-01')
  const hostProg = goalProgress(goal, data, '2026-09-01')
  assert.equal(clientProg.percent, hostProg.percent, '两端进度算法必须一致')
  assert.equal(clientProg.remainingDays, hostProg.remainingDays, '两端剩余天数必须一致')
  assert.equal(logic.formatGoalMetric(goal, clientProg), '420/600 分')
})
