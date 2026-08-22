import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ScheduleStore, normalizeItem, matches, isoDay, localDateStr, addDays, reconcileCarryOver, parseDateStr } from '../src/store.js'

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

test('update: 提供了非法日期必须报错而不是静默清空', async () => {
  const { store, dir } = makeStore()
  try {
    const { item } = await store.addItem({ title: '交房租', date: '2026-09-01' }, 111, '2026-08-17')
    // 形状合法但日历不存在的日期
    await assert.rejects(() => store.updateItem(item.id, { date: '2026-02-30' }), /无效日期/)
    // 形状都不对的日期
    await assert.rejects(() => store.updateItem(item.id, { date: '明天' }), /无效日期/)
    // 原日程不受影响(没有静默写成空串)
    const snap = await store.snapshot()
    assert.equal(snap.items[0].date, '2026-09-01')
    // 合法新日期正常更新
    await store.updateItem(item.id, { date: '2026-10-01' })
    const snap2 = await store.snapshot()
    assert.equal(snap2.items[0].date, '2026-10-01')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('parseDateStr: 真实日历校验', () => {
  assert.equal(parseDateStr('2026-08-17'), '2026-08-17')
  assert.equal(parseDateStr('2028-02-29'), '2028-02-29') // 闰年放行
  assert.equal(parseDateStr('2026-02-30'), '')           // 2 月 30 日
  assert.equal(parseDateStr('2026-13-01'), '')           // 13 月
  assert.equal(parseDateStr('2026-00-10'), '')           // 0 月
  assert.equal(parseDateStr('2026-08-00'), '')           // 0 日
  assert.equal(parseDateStr('2026-4-1'), '')             // 形状不符
  assert.equal(parseDateStr(undefined), '')
  assert.equal(parseDateStr(42), '')
})

test('add/setDone/listForDate: 全部入口拒绝不存在的日历日期', async () => {
  const { store, dir } = makeStore()
  try {
    // 注意:addItem/setDone 的参数校验在进入 promise 链之前同步抛出,
    // 断言必须用 async 箭头让抛出变成 rejection。
    await assert.rejects(async () => store.addItem({ title: 'x', date: '2026-04-31' }, 111, '2026-08-17'), /无效日期/)
    await assert.rejects(async () => store.addItem({ title: 'y', date: '2026-13-05' }, 112, '2026-08-17'), /无效日期/)
    const { item } = await store.addItem({ title: '合法' }, 113, '2026-08-17')
    await assert.rejects(async () => store.setDone(item.id, '2026-02-30', true), /无效日期/)
    await assert.rejects(async () => store.listForDate('2026-13-01', '2026-08-17'), /无效日期/)
    // 缺省/空串仍回退到 today,不受影响
    const rows = await store.listForDate('', '2026-08-17')
    assert.equal(rows.length, 1)
    await store.setDone(item.id, undefined, true, '2026-08-17')
    const snap = await store.snapshot('2026-08-17')
    assert.equal(snap.done[item.id]['2026-08-17'], true)
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

test('carryOver: 默认关闭,once 可开启,recurring 不可', () => {
  const off = normalizeItem({ title: 'a', date: '2026-08-18' }, 111, '2026-08-17')
  assert.equal(off.carryOver, false)
  const on = normalizeItem({ title: 'b', date: '2026-08-18', carryOver: true }, 112, '2026-08-17')
  assert.equal(on.carryOver, true)
  // snake_case 也接受
  const on2 = normalizeItem({ title: 'c', date: '2026-08-18', carry_over: true }, 113, '2026-08-17')
  assert.equal(on2.carryOver, true)
  // daily / weekly 强制关闭
  const daily = normalizeItem({ title: 'd', recurring: 'daily', carryOver: true }, 114, '2026-08-17')
  assert.equal(daily.carryOver, false)
  const weekly = normalizeItem({ title: 'e', recurring: 'weekly', carryOver: true }, 115, '2026-08-17')
  assert.equal(weekly.carryOver, false)
})

test('carryOver: 过去未完成自动顺延到今天,并记录中间日期', () => {
  const data = { items: [{ id: 'x1', title: '交报告', recurring: 'once', date: '2026-08-10', carryOver: true, rolloverDates: [] }], done: {} }
  const changed = reconcileCarryOver(data, '2026-08-14')
  assert.equal(changed, true)
  const item = data.items[0]
  assert.equal(item.date, '2026-08-14')
  assert.deepEqual(item.rolloverDates, ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13'])
  // 再次执行不应再改变
  assert.equal(reconcileCarryOver(data, '2026-08-14'), false)
})

test('carryOver: 过去已完成的不顺延;daily/weekly 不顺延;未开启不顺延', () => {
  // 已完成:done 里原日期有记录
  const doneData = { items: [{ id: 'x1', title: 'a', recurring: 'once', date: '2026-08-10', carryOver: true, rolloverDates: [] }], done: { x1: { '2026-08-10': true } } }
  assert.equal(reconcileCarryOver(doneData, '2026-08-14'), false)
  assert.equal(doneData.items[0].date, '2026-08-10')
  // daily
  const dailyData = { items: [{ id: 'x2', title: 'b', recurring: 'daily', date: '', carryOver: true, rolloverDates: [] }], done: {} }
  assert.equal(reconcileCarryOver(dailyData, '2026-08-14'), false)
  // weekly
  const weeklyData = { items: [{ id: 'x3', title: 'c', recurring: 'weekly', date: '', weekdays: [1], carryOver: true, rolloverDates: [] }], done: {} }
  assert.equal(reconcileCarryOver(weeklyData, '2026-08-14'), false)
  // carryOver 关闭
  const offData = { items: [{ id: 'x4', title: 'd', recurring: 'once', date: '2026-08-10', carryOver: false, rolloverDates: [] }], done: {} }
  assert.equal(reconcileCarryOver(offData, '2026-08-14'), false)
  assert.equal(offData.items[0].date, '2026-08-10')
})

test('carryOver: 通过 store 自动顺延并持久化,listForDate 可见', async () => {
  const { store, dir } = makeStore()
  try {
    const { item } = await store.addItem({ title: '交报告', date: '2026-08-10', carryOver: true }, 111, '2026-08-14')
    // addItem 时 today=8-14,应直接顺延
    assert.equal(item.date, '2026-08-14')
    // 顺延历史日也能列出
    const hist = await store.listForDate('2026-08-10', '2026-08-14')
    assert.equal(hist.length, 1)
    assert.equal(hist[0].rolloverDates.length, 4)
    // 重建后仍保持
    const reloaded = new ScheduleStore({ path: store.path, legacyPath: store.legacyPath })
    const snap = await reloaded.snapshot('2026-08-14')
    assert.equal(snap.items[0].date, '2026-08-14')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('carryOver: 多天跨度过后,中间所有未完成日期都在历史里', async () => {
  const data = { items: [{ id: 'x1', title: '搬砖', recurring: 'once', date: '2026-08-01', carryOver: true, rolloverDates: [] }], done: {} }
  reconcileCarryOver(data, '2026-08-17')
  const item = data.items[0]
  assert.equal(item.date, '2026-08-17')
  assert.equal(item.rolloverDates.length, 16) // 8-01 .. 8-16
  assert.deepEqual(item.rolloverDates[0], '2026-08-01')
  assert.deepEqual(item.rolloverDates[15], '2026-08-16')
})

test('carryOver: updateItem 可开启/关闭', async () => {
  const { store, dir } = makeStore()
  try {
    const { item } = await store.addItem({ title: '写总结', date: '2026-08-17' }, 111, '2026-08-17')
    assert.equal(item.carryOver, false)
    await store.updateItem(item.id, { carryOver: true }, '2026-08-17')
    let snap = await store.snapshot('2026-08-17')
    assert.equal(snap.items[0].carryOver, true)
    await store.updateItem(item.id, { carry_over: false }, '2026-08-17')
    snap = await store.snapshot('2026-08-17')
    assert.equal(snap.items[0].carryOver, false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
