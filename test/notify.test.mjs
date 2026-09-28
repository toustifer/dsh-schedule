import assert from 'node:assert/strict'
import { test } from 'node:test'

import { startOfOccurrence, reminderKey } from '../src/notify/schedule-core.js'

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
  const a = reminderKey('dt_lesson', '2026-09-28', '08:30')
  const b = reminderKey('dt_lesson', '2026-10-05', '08:30')
  assert.notEqual(a, b)
})

test('同一条日程改了时间也会得到不同键', () => {
  const a = reminderKey('dt_x', '2026-09-28', '08:30')
  const b = reminderKey('dt_x', '2026-09-28', '10:15')
  assert.notEqual(a, b)
})
