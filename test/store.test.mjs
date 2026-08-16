import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ScheduleStore, normalizeItem, matches, isoDay, localDateStr } from '../src/store.js'

function makeStore() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-sched-test-'))
  const store = new ScheduleStore({ path: join(dir, 'data.json'), legacyPath: join(dir, 'legacy.json') })
  return { store, dir }
}

test('isoDay: 1=周一 … 7=周日', () => {
  assert.equal(isoDay('2026-08-17'), 1) // 周一
  assert.equal(isoDay('2026-08-18'), 2)
  assert.equal(isoDay('2026-08-22'), 6)
  assert.equal(isoDay('2026-08-23'), 7) // 周日
})

test('localDateStr 格式', () => {
  assert.match(localDateStr(new Date(2026, 7, 5)), /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(localDateStr(new Date(2026, 0, 9)), '2026-01-09')
})

test('normalizeItem: 校验与默认值', () => {
  assert.throws(() => normalizeItem({ title: '  ' }), /不能为空/)
  const once = normalizeItem({ title: '开会', date: '2026-08-20' }, 123, '2026-08-17')
  assert.equal(once.recurring, 'once')
  assert.equal(once.date, '2026-08-20')
  assert.deepEqual(once.weekdays, [])
  assert.equal(once.time, '')
  assert.deepEqual(once.linkedSessions, [])

  // once 缺省日期 = 今天
  assert.equal(normalizeItem({ title: 'x' }, 123, '2026-08-17').date, '2026-08-17')
  // weekly 缺省 weekdays = 今天(周一 → 1)
  assert.deepEqual(normalizeItem({ title: 'x', recurring: 'weekly' }, 123, '2026-08-17').weekdays, [1])
  // 非法时间被清空
  assert.equal(normalizeItem({ title: 'x', time: 'abc' }, 123, '2026-08-17').time, '')
  // 非法 weekdays 被过滤
  assert.deepEqual(normalizeItem({ title: 'x', recurring: 'weekly', weekdays: [1, 9, 0, 3] }, 123, '2026-08-17').weekdays, [1, 3])
})

test('matches: 三种重复在周一展开', () => {
  const once = { recurring: 'once', date: '2026-08-20', weekdays: [] }
  const daily = { recurring: 'daily', date: '', weekdays: [] }
  const weekly = { recurring: 'weekly', date: '', weekdays: [1, 3, 5] }
  assert.equal(matches(once, '2026-08-20'), true)
  assert.equal(matches(once, '2026-08-21'), false)
  assert.equal(matches(daily, '2026-08-17'), true)
  assert.equal(matches(daily, '2026-08-23'), true)
  assert.equal(matches(weekly, '2026-08-17'), true)  // 周一
  assert.equal(matches(weekly, '2026-08-18'), false) // 周二
  assert.equal(matches(weekly, '2026-08-19'), true)  // 周三
})

test('add / snapshot / listForDate', async () => {
  const { store, dir } = makeStore()
  try {
    await store.addItem({ title: '写日报', recurring: 'daily', time: '18:00' }, 111, '2026-08-17')
    await store.addItem({ title: '健身', recurring: 'weekly', weekdays: [1, 3, 5] }, 112, '2026-08-17')
    await store.addItem({ title: '预约牙医', date: '2026-08-19' }, 113, '2026-08-17')

    const snap = await store.snapshot()
    assert.equal(snap.items.length, 3)

    const monday = await store.listForDate('2026-08-17')
    assert.deepEqual(monday.map((i) => i.title).sort(), ['写日报', '健身'].sort())
    assert.ok(monday.every((i) => i.done === false))

    const wed = await store.listForDate('2026-08-19')
    assert.deepEqual(wed.map((i) => i.title).sort(), ['写日报', '健身', '预约牙医'].sort())
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('setDone: 按天记录、可取消、不影响其他天', async () => {
  const { store, dir } = makeStore()
  try {
    const { item } = await store.addItem({ title: '写日报', recurring: 'daily' }, 111, '2026-08-17')
    await store.setDone(item.id, '2026-08-17', true)
    await store.setDone(item.id, '2026-08-18', true)

    let mon = await store.listForDate('2026-08-17')
    assert.equal(mon[0].done, true)
    // 取消 8-17,不影响 8-18
    await store.setDone(item.id, '2026-08-17', false)
    mon = await store.listForDate('2026-08-17')
    assert.equal(mon[0].done, false)
    const tue = await store.listForDate('2026-08-18')
    assert.equal(tue[0].done, true)

    await assert.rejects(() => store.setDone('nope', '2026-08-17', true), /找不到/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('linkSession: 关联 / 去重 / 取消', async () => {
  const { store, dir } = makeStore()
  try {
    const { item } = await store.addItem({ title: '写周报' }, 111, '2026-08-17')
    await store.linkSession(item.id, 's1', true)
    await store.linkSession(item.id, 's2', true)
    await store.linkSession(item.id, 's1', true) // 去重
    let snap = await store.snapshot()
    assert.deepEqual(snap.items[0].linkedSessions, ['s1', 's2'])
    await store.linkSession(item.id, 's1', false)
    snap = await store.snapshot()
    assert.deepEqual(snap.items[0].linkedSessions, ['s2'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('update: 部分字段更新', async () => {
  const { store, dir } = makeStore()
  try {
    const { item } = await store.addItem({ title: '健身', recurring: 'weekly', weekdays: [1, 3, 5] }, 111, '2026-08-17')
    await store.updateItem(item.id, { time: '20:00', note: '深蹲+卧推' })
    const snap = await store.snapshot()
    assert.equal(snap.items[0].time, '20:00')
    assert.equal(snap.items[0].note, '深蹲+卧推')
    assert.deepEqual(snap.items[0].weekdays, [1, 3, 5]) // 未提供的字段保留
    await assert.rejects(() => store.updateItem(item.id, { title: '' }), /不能为空/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('remove: 删除日程并清理完成记录', async () => {
  const { store, dir } = makeStore()
  try {
    const { item } = await store.addItem({ title: '临时' }, 111, '2026-08-17')
    await store.setDone(item.id, '2026-08-17', true)
    await store.removeItem(item.id)
    const snap = await store.snapshot()
    assert.equal(snap.items.length, 0)
    assert.equal(snap.done[item.id], undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('持久化: 重建实例仍能读到数据', async () => {
  const { store, dir } = makeStore()
  try {
    const { item } = await store.addItem({ title: '写日报', recurring: 'daily' }, 111, '2026-08-17')
    await store.setDone(item.id, '2026-08-17', true)
    await store.linkSession(item.id, 'sess-1', true)

    const reloaded = new ScheduleStore({ path: store.path, legacyPath: store.legacyPath })
    const snap = await reloaded.snapshot()
    assert.equal(snap.items.length, 1)
    assert.equal(snap.items[0].title, '写日报')
    assert.equal(snap.done[item.id]['2026-08-17'], true)
    assert.deepEqual(snap.items[0].linkedSessions, ['sess-1'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('迁移: 旧位置数据自动迁移到新位置并删除旧文件', async () => {
  const { store, dir } = makeStore()
  try {
    // 制造旧文件
    const legacy = store.legacyPath
    const payload = { version: 1, items: [{ id: 'dt_old', title: '旧日程', recurring: 'once', date: '2026-08-17', weekdays: [], time: '', note: '', linkedSessions: [], createdAt: 1 }], done: { dt_old: { '2026-08-17': true } } }
    writeFileSync(legacy, JSON.stringify(payload), 'utf8')

    const migrated = await store.snapshot()
    assert.equal(migrated.items.length, 1)
    assert.equal(migrated.items[0].title, '旧日程')
    assert.equal(migrated.done.dt_old['2026-08-17'], true)
    // 新文件已写入,旧文件已删除
    assert.ok(existsSync(store.path))
    assert.ok(!existsSync(legacy))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
