import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// logic.cjs 是 CommonJS(不受 package.json "type":"module" 影响),
// 用 createRequire 引入以覆盖纯视图逻辑。
const require = createRequire(import.meta.url)
const L = require('../src/client/logic.cjs')

test('logic: addDays 跨月/跨年边界', () => {
  assert.equal(L.addDays('2026-01-31', 1), '2026-02-01')
  assert.equal(L.addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(L.addDays('2026-12-31', 1), '2027-01-01')
  // 闰年
  assert.equal(L.addDays('2028-02-28', 1), '2028-02-29')
})

test('logic: mondayOf 返回本周周一', () => {
  assert.equal(L.mondayOf('2026-08-17'), '2026-08-17') // 周一
  assert.equal(L.mondayOf('2026-08-23'), '2026-08-17') // 周日
  assert.equal(L.mondayOf('2026-08-22'), '2026-08-17') // 周六
})

test('logic: matches 与宿主端一致的 once/daily/weekly 展开', () => {
  const once = { recurring: 'once', date: '2026-08-20' }
  assert.equal(L.matches(once, '2026-08-20'), true)
  assert.equal(L.matches(once, '2026-08-21'), false)
  const weekly = { recurring: 'weekly', weekdays: [1, 5] }
  assert.equal(L.matches(weekly, '2026-08-17'), true) // 周一
  assert.equal(L.matches(weekly, '2026-08-21'), true) // 周五
  assert.equal(L.matches(weekly, '2026-08-19'), false)
})

test('logic: recurringLabel 文案', () => {
  assert.equal(L.recurringLabel({ recurring: 'daily' }), '每天')
  assert.equal(L.recurringLabel({ recurring: 'weekly', weekdays: [1, 3] }), '每周周一周三')
  assert.equal(L.recurringLabel({ recurring: 'weekly', weekdays: [] }), '每周')
  assert.equal(L.recurringLabel({ recurring: 'once' }), '')
})

test('logic: rowsFor 成员、完成与顺延标记', () => {
  const data = {
    items: [
      { id: 'a', title: '乙事项', recurring: 'daily', time: '' },
      { id: 'b', title: '早读', recurring: 'daily', time: '07:00' },
      { id: 'c', title: '站会', recurring: 'daily', time: '09:30' },
    ],
    done: { c: { '2026-08-17': true } },
  }
  const rows = L.rowsFor(data, '2026-08-17')
  // 排序行为由专门的排序用例覆盖(见 sortRows 用例)
  assert.equal(rows.length, 3)
  const byId = {}
  for (const r of rows) byId[r.item.id] = r
  assert.equal(byId.c.done, true)
  assert.equal(byId.b.done, false)
  assert.equal(byId.a.rollover, false)
})

test('logic: sortRows 包装行与裸日程都能正确排序', () => {
  const items = [
    { id: 'a', title: 'zzz', recurring: 'daily', time: '' },
    { id: 'b', title: '早读', recurring: 'daily', time: '07:00' },
    { id: 'c', title: '站会', recurring: 'daily', time: '9:30' }, // 一位数小时
    { id: 'd', title: '评审', recurring: 'daily', time: '10:00' },
    { id: 'e', title: 'aaa', recurring: 'daily', time: '' },
  ]
  // 裸日程数组:9:30(570 分)在 10:00(600 分)之前;无时间殿后;
  // 同为无时间按标题字典序(aaa 在 zzz 前)
  assert.deepEqual(
    items.slice().sort(L.sortRows).map((x) => x.id),
    ['b', 'c', 'd', 'e', 'a'],
  )
  // rowsFor 的包装行 { item, ... }
  const wrapped = items.map((item) => ({ item, done: false, rollover: false }))
  assert.deepEqual(wrapped.sort(L.sortRows).map((x) => x.item.id), ['b', 'c', 'd', 'e', 'a'])
})

test('logic: rowsFor 返回按 sortRows 排好序的行', () => {
  const data = {
    items: [
      { id: 'late', title: '晚班', recurring: 'daily', time: '21:00' },
      { id: 'early', title: '早班', recurring: 'daily', time: '6:00' },
      { id: 'none', title: '没定时间', recurring: 'daily' },
    ],
    done: {},
  }
  assert.deepEqual(
    L.rowsFor(data, '2026-08-17').map((r) => r.item.id),
    ['early', 'late', 'none'],
  )
})

test('logic: completedBetween 闭区间统计与 hasDoneOn/streakOf', () => {
  const data = { items: [], done: { x: { '2026-08-15': true, '2026-08-16': true }, y: { '2026-08-16': true } } }
  assert.equal(L.completedBetween(data, '2026-08-10', '2026-08-16'), 3)
  assert.equal(L.completedBetween(data, '2026-08-16', '2026-08-16'), 2)
  assert.equal(L.completedBetween(data, '2026-08-17', '2026-08-18'), 0)
  assert.equal(L.hasDoneOn(data, '2026-08-15'), true)
  assert.equal(L.hasDoneOn(data, '2026-08-17'), false)
  // 今天(8-16)没做也行:从昨天往前数 2 天
  assert.equal(L.streakOf(data, '2026-08-16'), 2)
  // 今天做了则含今天
  const data2 = { items: [], done: { z: { '2026-08-16': true, '2026-08-17': true } } }
  assert.equal(L.streakOf(data2, '2026-08-17'), 2)
})
