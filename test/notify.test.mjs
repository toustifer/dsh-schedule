import assert from 'node:assert/strict'
import { test } from 'node:test'

import { startOfOccurrence, reminderKey, computeDueReminders } from '../src/notify/schedule-core.js'

const DATE = '2026-09-28'

test('startOfOccurrence 优先用 startTime/endTime', () => {
  assert.deepEqual(
    startOfOccurrence({ startTime: '08:30', endTime: '09:55' }),
    { minutes: 510, hhmm: '08:30' },
  )
})

test('startOfOccurrence 能从 time 区间解析', () => {
  assert.deepEqual(
    startOfOccurrence({ time: '14:15-16:40' }),
    { minutes: 855, hhmm: '14:15' },
  )
})

test('startOfOccurrence 对单一时间点也成立', () => {
  assert.deepEqual(
    startOfOccurrence({ time: '20:00' }),
    { minutes: 1200, hhmm: '20:00' },
  )
})

test('startOfOccurrence 对无时间的日程返回 null', () => {
  assert.equal(startOfOccurrence({ time: '', startTime: '', endTime: '' }), null)
  assert.equal(startOfOccurrence({}), null)
})

test('startOfOccurrence 对非法时间返回 null', () => {
  assert.equal(startOfOccurrence({ startTime: '25:99' }), null)
})

test('reminderKey 把发生时刻编进键里', () => {
  assert.equal(reminderKey('dt_a', '2026-09-28', '08:30'), 'dt_a@2026-09-28T08:30')
})

test('同一条日程在不同日期得到不同键', () => {
  assert.notEqual(reminderKey('dt_lesson', '2026-09-28', '08:30'), reminderKey('dt_lesson', '2026-10-05', '08:30'))
})

test('同一条日程改了时间也会得到不同键', () => {
  assert.notEqual(reminderKey('dt_x', '2026-09-28', '08:30'), reminderKey('dt_x', '2026-09-28', '10:15'))
})

function item(id, startTime, extra) {
  return Object.assign({ id, title: id, recurring: 'once', date: DATE, startTime }, extra)
}

test('命中窗口内的日程', () => {
  const items = [item('a', '08:30'), item('b', '17:00')]
  const due = computeDueReminders({ items, dateStr: DATE, minutesNow: 500, leadMinutes: 10 })
  assert.equal(due.length, 1)
  assert.equal(due[0].item.id, 'a')
  assert.equal(due[0].hhmm, '08:30')
})

test('窗口之外的不命中', () => {
  const due = computeDueReminders({ items: [item('a', '08:31')], dateStr: DATE, minutesNow: 500, leadMinutes: 10 })
  assert.equal(due.length, 0)
})

test('已过时刻的不命中', () => {
  const due = computeDueReminders({ items: [item('a', '08:00')], dateStr: DATE, minutesNow: 500, leadMinutes: 10 })
  assert.equal(due.length, 0)
})

test('无时间的日程永不命中', () => {
  const items = [{ id: 'x', title: 'x', recurring: 'once', date: DATE }]
  const due = computeDueReminders({ items, dateStr: DATE, minutesNow: 500, leadMinutes: 10 })
  assert.equal(due.length, 0)
})

test('不在当天出现的日程不命中', () => {
  const items = [{ id: 'y', title: 'y', recurring: 'once', date: '2026-09-29', startTime: '08:30' }]
  const due = computeDueReminders({ items, dateStr: DATE, minutesNow: 500, leadMinutes: 10 })
  assert.equal(due.length, 0)
})

test('已在 sentLog 里的不再命中', () => {
  const sentLog = { 'a@2026-09-28T08:30': 1790000000000 }
  const due = computeDueReminders({ items: [item('a', '08:30')], dateStr: DATE, minutesNow: 500, leadMinutes: 10, sentLog })
  assert.equal(due.length, 0)
})

test('多条命中按时间升序返回', () => {
  const items = [item('late', '08:30'), item('early', '08:25')]
  const due = computeDueReminders({ items, dateStr: DATE, minutesNow: 500, leadMinutes: 10 })
  assert.deepEqual(due.map((d) => d.item.id), ['early', 'late'])
})

test('weekly 课程在指定星期命中', () => {
  const items = [{ id: 'w', title: '大学物理（D）[03]', recurring: 'weekly', weekdays: [1], startTime: '08:30' }]
  const due = computeDueReminders({ items, dateStr: DATE, minutesNow: 500, leadMinutes: 10 })
  assert.equal(due.length, 1)
  assert.equal(due[0].key, 'w@2026-09-28T08:30')
})
