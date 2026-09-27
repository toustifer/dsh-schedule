import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { ScheduleStore } from '../src/store.js'

const root = new URL('..', import.meta.url)

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-api-'))
  const path = join(dir, 'data.json')
  const store = new ScheduleStore({ path, legacyPath: join(dir, 'legacy.json') })
  return { dir, path, store }
}

function readDoc(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

// ---------- dailytask_batch ----------

test('batch applies mixed schedule and goal operations in one call', async () => {
  const { dir, store } = fresh()
  try {
    const r = await store.batch([
      { op: 'goal_add', title: '四级 600', horizon: 'term', metric: { type: 'score', target: 600, unit: '分' } },
      { op: 'add', title: '背单词', date: '2026-09-01', startTime: '08:00', endTime: '08:30' },
    ])
    assert.equal(r.ok, true)
    assert.equal(r.applied, 2)
    assert.equal(r.failed, 0)

    const gid = r.results[0].result.goal.id
    const iid = r.results[1].result.item.id

    const r2 = await store.batch([
      { op: 'link_goal', id: iid, goal_id: gid },
      { op: 'set_done', id: iid, date: '2026-09-01', done: true },
      { op: 'update', id: iid, quadrant: 'q1' },
    ])
    assert.equal(r2.ok, true)
    assert.deepEqual(r2.results.map((x) => x.op), ['link_goal', 'set_done', 'update'])

    const snap = await store.snapshot('2026-09-01')
    assert.equal(snap.goals.length, 1)
    assert.equal(snap.items[0].goalId, gid, 'link_goal 应生效')
    assert.equal(snap.items[0].quadrant, 'q1', 'update 应生效')
    assert.equal(snap.done[iid]['2026-09-01'], true, 'set_done 应生效')

    // 结果里回传的 op 名便于 AI 对齐自己的请求
    assert.deepEqual(r.results.map((x) => x.op), ['goal_add', 'add'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('batch is atomic by default: a failure rolls the whole batch back', async () => {
  const { dir, path, store } = fresh()
  try {
    await store.addItem({ title: '原有日程', date: '2026-09-01' })

    await assert.rejects(
      () => store.batch([
        { op: 'add', title: '会被回滚的新日程', date: '2026-09-02' },
        { op: 'update', id: 'dt_不存在', title: 'x' },
      ]),
      /回滚整批/,
    )

    const snap = await store.snapshot('2026-09-01')
    assert.equal(snap.items.length, 1, '失败批次里已成功的那条也必须被撤销')
    assert.equal(snap.items[0].title, '原有日程')
    const doc = readDoc(path)
    assert.equal(doc.items.length, 1, '磁盘也必须回滚')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('batch with atomic=false keeps partial results and reports failures', async () => {
  const { dir, store } = fresh()
  try {
    const r = await store.batch([
      { op: 'add', title: 'A', date: '2026-09-01' },
      { op: 'update', id: 'dt_缺失', title: 'x' },
      { op: 'add', title: 'B', date: '2026-09-01' },
    ], false)

    assert.equal(r.ok, false)
    assert.equal(r.applied, 2, '两条合法操作都应落地')
    assert.equal(r.failed, 1)
    assert.equal(r.failures[0].index, 1)
    assert.equal(r.failures[0].op, 'update')
    assert.match(r.failures[0].error, /找不到该日程/)

    const snap = await store.snapshot('2026-09-01')
    assert.deepEqual(snap.items.map((i) => i.title).sort(), ['A', 'B'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('batch rejects bad input and unknown ops', async () => {
  const { dir, store } = fresh()
  try {
    await assert.rejects(() => store.batch([]), /非空数组/)
    await assert.rejects(() => store.batch(null), /非空数组/)
    await assert.rejects(() => store.batch(new Array(201).fill({ op: 'add', title: 'x' })), /最多 200 条/)
    await assert.rejects(() => store.batch([{ nope: 1 }]), /形如 \{ op: "\.\.\."/)
    await assert.rejects(() => store.batch([{ op: 'teleport' }]), /不认识的操作: teleport/)
    await assert.rejects(() => store.batch([{ op: 'update' }]), /update 需要 id/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('batch reuses the single-op validation instead of its own copy', async () => {
  const { dir, store } = fresh()
  try {
    // 空标题、非法日期这些校验只有一份实现,批量路径必须同样拒绝
    await assert.rejects(() => store.batch([{ op: 'add', title: '   ' }]), /标题不能为空/)
    await assert.rejects(() => store.batch([{ op: 'add', title: 'x', date: '2026-02-30' }]), /无效日期/)
    await assert.rejects(
      () => store.batch([{ op: 'goal_add', title: 'g', metric: { type: 'score', target: 1 } },
                         { op: 'goal_update', id: 'goal_无', current: 1 }]),
      /找不到该目标/,
    )
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// ---------- dailytask_doc_get / dailytask_doc_patch ----------

test('doc_patch writes extension fields and doc_get reads them back', async () => {
  const { dir, path, store } = fresh()
  try {
    const r = await store.docPatch({ set: { tags: ['学期', '冲刺'], ui: { marqueeSpeed: 30 } } })
    assert.deepEqual(r.set.sort(), ['tags', 'ui'])

    const got = await store.readDoc()
    assert.deepEqual(got.doc.tags, ['学期', '冲刺'])
    assert.deepEqual(got.doc.ui, { marqueeSpeed: 30 })
    assert.deepEqual(got.extensionKeys.sort(), ['tags', 'ui'])
    assert.equal(got.version, 2)
    assert.equal(got.writtenBy, 'dsh-schedule@0.4.0')

    // 落盘后仍在
    assert.deepEqual(readDoc(path).tags, ['学期', '冲刺'])

    // keys 过滤
    const only = await store.readDoc(['ui'])
    assert.deepEqual(Object.keys(only.doc), ['ui'])

    // unset 删除
    await store.docPatch({ unset: ['tags'] })
    assert.deepEqual((await store.readDoc()).extensionKeys, ['ui'])
    assert.equal(readDoc(path).tags, undefined)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('doc_patch refuses built-in fields and __proto__', async () => {
  const { dir, store } = fresh()
  try {
    for (const k of ['items', 'done', 'goals', 'version', 'writtenBy']) {
      await assert.rejects(() => store.docPatch({ set: { [k]: [] } }),
        /已知字段/, `写 ${k} 应被拒绝`)
      await assert.rejects(() => store.docPatch({ unset: [k] }),
        /已知字段/, `删 ${k} 应被拒绝`)
    }
    await assert.rejects(() => store.docPatch({ set: { ['__proto__']: {} } }), /__proto__/)
    await assert.rejects(() => store.docPatch({ set: {} }), /需要提供 set 或 unset/)
    await assert.rejects(() => store.docPatch({ unset: [''] }), /非空字符串/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('doc_patch unset sticks: a deleted key is not resurrected from disk', async () => {
  const { dir, path, store } = fresh()
  try {
    const { item } = await store.addItem({ title: 'A', date: '2026-09-01' })
    await store.docPatch({ set: { tags: ['学期'], keep: 1 } })
    assert.deepEqual(readDoc(path).tags, ['学期'])

    await store.docPatch({ unset: ['tags'] })
    assert.equal(readDoc(path).tags, undefined, 'unset 后立刻落盘就该没了')

    // 关键:serializeForDisk 会让"磁盘上的未知字段"优先保留(issue #2),
    // 若不记墓碑,后面的任意一次写盘都会把 tags 从磁盘搬回来。
    await store.setDone(item.id, '2026-09-01', true)
    assert.equal(readDoc(path).tags, undefined, '后续写盘不得把删掉的字段复活')
    assert.equal(readDoc(path).keep, 1, '没被删的扩展字段要留着')

    // 删掉再写回,应当恢复
    await store.docPatch({ set: { tags: ['重新加回'] } })
    assert.deepEqual(readDoc(path).tags, ['重新加回'], '重新写入等于撤销删除')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('extension fields survive ordinary schedule writes', async () => {
  const { dir, path, store } = fresh()
  try {
    const { item } = await store.addItem({ title: 'A', date: '2026-09-01' })
    await store.docPatch({ set: { tags: ['重要'], external: { notionId: 'abc' } } })

    // 随便改点别的,扩展字段不能被顺手冲掉
    await store.setDone(item.id, '2026-09-01', true)
    await store.addGoal({ title: '新目标' }, Date.now(), '2026-09-01')

    const doc = readDoc(path)
    assert.deepEqual(doc.tags, ['重要'], '扩展字段必须存活')
    assert.deepEqual(doc.external, { notionId: 'abc' })
    assert.equal(doc.goals.length, 1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('batch can drive doc_patch too', async () => {
  const { dir, store } = fresh()
  try {
    const r = await store.batch([
      { op: 'add', title: 'A', date: '2026-09-01' },
      { op: 'doc_patch', set: { view: 'matrix' } },
    ])
    assert.equal(r.ok, true)
    assert.deepEqual((await store.readDoc()).doc.view, 'matrix')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// ---------- 宿主契约 ----------

test('host exposes 14 tools and the generic content routes', () => {
  const host = readFileSync(new URL('lib/index.js', root), 'utf8')
  // 派发表在存储层,不在宿主层
  const storeCode = readFileSync(new URL('lib/store.js', root), 'utf8')
  const tools = [...host.matchAll(/'dailytask_[a-z_]+'/g)].map((m) => m[0].slice(1, -1))
  assert.equal(tools.length, 14, '工具总数应为 14')
  for (const t of ['dailytask_batch', 'dailytask_doc_get', 'dailytask_doc_patch']) {
    assert.ok(tools.includes(t), `应注册 ${t}`)
  }
  const routes = [...host.matchAll(/route\('([^']+)'/g)].map((m) => m[1])
  for (const r of ['/batch', '/doc-get', '/doc-patch']) {
    assert.ok(routes.includes(r), `应暴露 ${r}`)
  }
  // 全部 10 种批量 op 都要在 store 的派发表里
  for (const op of ['add', 'update', 'set_done', 'remove', 'link_session',
                    'goal_add', 'goal_update', 'goal_remove', 'link_goal', 'doc_patch']) {
    assert.ok(storeCode.includes(`case '${op}':`), `批量派发应支持 ${op}`)
  }
})
