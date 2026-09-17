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

test('logic: matches 认得顺延历史日期(与宿主端 store 对齐)', () => {
  // once 日程已从 8-10 顺延到 8-14,rolloverDates 记录了中间每一天
  const carried = { recurring: 'once', date: '2026-08-14', rolloverDates: ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13'] }
  for (const d of ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14']) {
    assert.equal(L.matches(carried, d), true, d + ' 应命中')
  }
  assert.equal(L.matches(carried, '2026-08-09'), false)
  // 无顺延历史的普通 once 不受影响
  assert.equal(L.matches({ recurring: 'once', date: '2026-08-14' }, '2026-08-10'), false)
})

test('logic: rowsFor 在顺延日期上给出 rollover 行', () => {
  const data = {
    items: [{ id: 'r1', title: '交报告', recurring: 'once', date: '2026-08-14', carryOver: true, rolloverDates: ['2026-08-12'] }],
    done: {},
  }
  const rows = L.rowsFor(data, '2026-08-12')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].rollover, true)
  assert.equal(rows[0].done, false)
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

test('logic: parseTimeBlock 支持起止区间与单点时间', () => {
  // 区间格式 "09:00-10:30"
  const b1 = L.parseTimeBlock({ time: '09:00-10:30' })
  assert.equal(b1.hasTime, true)
  assert.equal(b1.startTime, '09:00')
  assert.equal(b1.endTime, '10:30')
  assert.equal(b1.startMinutes, 540)
  assert.equal(b1.endMinutes, 630)
  assert.equal(b1.durationMinutes, 90)
  assert.equal(b1.isRange, true)

  // 显式 startTime 与 endTime 属性
  const b2 = L.parseTimeBlock({ startTime: '14:00', endTime: '15:15' })
  assert.equal(b2.hasTime, true)
  assert.equal(b2.startTime, '14:00')
  assert.equal(b2.endTime, '15:15')
  assert.equal(b2.durationMinutes, 75)
  assert.equal(b2.isRange, true)

  // 单点时间 "16:00": 默认预估 45 分钟色块
  const b3 = L.parseTimeBlock({ time: '16:00' })
  assert.equal(b3.hasTime, true)
  assert.equal(b3.startTime, '16:00')
  assert.equal(b3.endTime, '16:45')
  assert.equal(b3.durationMinutes, 45)
  assert.equal(b3.isRange, false)

  // 无时间
  const b4 = L.parseTimeBlock({ title: '无时间' })
  assert.equal(b4.hasTime, false)
  assert.equal(b4.startMinutes, null)
})

test('logic: detectTimeConflicts 重叠判定', () => {
  const rows = [
    { item: { id: '1', title: '会议A', time: '09:00-10:30' } },
    { item: { id: '2', title: '会议B', time: '10:00-11:00' } }, // 与 A 重叠
    { item: { id: '3', title: '午餐', time: '12:00-13:00' } },   // 独立
  ]
  const map = L.detectTimeConflicts(rows)
  assert.equal(map['1'].length, 1)
  assert.equal(map['1'][0].id, '2')
  assert.equal(map['2'].length, 1)
  assert.equal(map['2'][0].id, '1')
  assert.equal(map['3'].length, 0)
})

test('logic: computeTimeSchedule 插入空闲段与按序排列', () => {
  const rows = [
    { item: { id: 't2', title: '下午评审', time: '14:00-15:00' } },
    { item: { id: 't1', title: '晨会', time: '09:00-10:00' } },
    { item: { id: 'none', title: '无排期待办' } },
  ]
  const schedule = L.computeTimeSchedule(rows, { startHour: 9, endHour: 18 })
  assert.equal(schedule.unscheduled.length, 1)
  assert.equal(schedule.unscheduled[0].item.id, 'none')

  // 节点顺序应为: 晨会 (9:00-10:00) -> 空闲段 (10:00-14:00 4小时) -> 下午评审 (14:00-15:00) -> 空闲段 (15:00-18:00)
  assert.equal(schedule.nodes.length, 4)
  assert.equal(schedule.nodes[0].type, 'task')
  assert.equal(schedule.nodes[0].item.id, 't1')

  assert.equal(schedule.nodes[1].type, 'free')
  assert.equal(schedule.nodes[1].startTime, '10:00')
  assert.equal(schedule.nodes[1].endTime, '14:00')
  assert.equal(schedule.nodes[1].durationMinutes, 240)

  assert.equal(schedule.nodes[2].type, 'task')
  assert.equal(schedule.nodes[2].item.id, 't2')

  assert.equal(schedule.nodes[3].type, 'free')
  assert.equal(schedule.nodes[3].startTime, '15:00')
  assert.equal(schedule.nodes[3].endTime, '18:00')

  assert.equal(schedule.stats.conflictCount, 0)
  assert.equal(schedule.stats.totalScheduled, 2)
  assert.equal(schedule.stats.totalUnscheduled, 1)
})
