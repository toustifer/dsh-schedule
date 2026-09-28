import assert from 'node:assert/strict'
import { test } from 'node:test'

import { startOfOccurrence, reminderKey, computeDueReminders } from '../src/notify/schedule-core.js'
import { renderReminder } from '../src/notify/message.js'
import { encodeHeader, buildMessage, dotStuff } from '../src/notify/smtp.js'
import { createTransport, httpTransport } from '../src/notify/transports.js'
import { NOTIFY_KEY, defaultNotifyConfig, normalizeNotifyConfig, isRunnable } from '../src/notify/config.js'
import { runReminderTick, startReminder } from '../src/notify/index.js'

const DATE = '2026-09-28'

test('startOfOccurrence 优先用 startTime/endTime', () => {
  assert.deepEqual(startOfOccurrence({ startTime: '08:30', endTime: '09:55' }), { minutes: 510, hhmm: '08:30' })
})

test('startOfOccurrence 能从 time 区间解析', () => {
  assert.deepEqual(startOfOccurrence({ time: '14:15-16:40' }), { minutes: 855, hhmm: '14:15' })
})

test('startOfOccurrence 对单一时间点也成立', () => {
  assert.deepEqual(startOfOccurrence({ time: '20:00' }), { minutes: 1200, hhmm: '20:00' })
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
  assert.equal(computeDueReminders({ items, dateStr: DATE, minutesNow: 500, leadMinutes: 10 }).length, 0)
})

test('不在当天出现的日程不命中', () => {
  const items = [{ id: 'y', title: 'y', recurring: 'once', date: '2026-09-29', startTime: '08:30' }]
  assert.equal(computeDueReminders({ items, dateStr: DATE, minutesNow: 500, leadMinutes: 10 }).length, 0)
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

const CTX = { dateStr: '2026-09-28', weekdayName: '周一', leadMinutes: 10 }

test('单条命中时主题带标题', () => {
  const out = renderReminder(
    [{ item: { title: '大学物理实验[01]', startTime: '14:15', endTime: '16:40' }, hhmm: '14:15' }],
    CTX,
  )
  assert.equal(out.subject, '⏰ 10 分钟后：大学物理实验[01]')
  assert.match(out.text, /大学物理实验\[01\]/)
  assert.match(out.text, /14:15/)
  assert.match(out.text, /今天 2026-09-28 周一/)
})

test('多条命中时主题带条数,正文逐条列出', () => {
  const out = renderReminder(
    [
      { item: { title: '大物作业' }, hhmm: '20:00' },
      { item: { title: '统计工程学' }, hhmm: '21:00' },
    ],
    CTX,
  )
  assert.equal(out.subject, '⏰ 10 分钟内有 2 条日程')
  assert.match(out.text, /20:00/)
  assert.match(out.text, /大物作业/)
  assert.match(out.text, /统计工程学/)
})

test('空清单返回 null', () => {
  assert.equal(renderReminder([], CTX), null)
})

test('encodeHeader 对纯 ASCII 原样返回', () => {
  assert.equal(encodeHeader('Hello'), 'Hello')
})

test('encodeHeader 对中文做 RFC2047 base64 编码', () => {
  const out = encodeHeader('大学物理')
  assert.match(out, /^=\?UTF-8\?B\?/)
  assert.match(out, /\?=$/)
  const b64 = out.slice('=?UTF-8?B?'.length, -2)
  assert.equal(Buffer.from(b64, 'base64').toString('utf8'), '大学物理')
})

test('dotStuff 给行首的点补一个点', () => {
  assert.equal(dotStuff('.hidden\nvisible'), '..hidden\r\nvisible')
})

test('buildMessage 产出合法头部与 base64 正文', () => {
  const msg = buildMessage({
    from: 'a@qq.com',
    to: ['b@qq.com', 'c@qq.com'],
    subject: '提醒',
    text: '正文内容',
    date: new Date('2026-09-28T08:20:00Z'),
  })
  assert.match(msg, /MIME-Version: 1\.0/)
  assert.match(msg, /Content-Type: text\/plain; charset=UTF-8/)
  assert.match(msg, /Content-Transfer-Encoding: base64/)
  assert.match(msg, /To: b@qq\.com, c@qq\.com/)
  const body = msg.split('\r\n\r\n')[1]
  assert.equal(Buffer.from(body, 'base64').toString('utf8'), '正文内容')
})

test('未知 kind 抛错', () => {
  assert.throws(() => createTransport({ kind: 'carrier-pigeon' }), /未知的 transport/)
})

test('httpTransport 把提醒 POST 成 JSON', async () => {
  let captured = null
  const send = httpTransport({
    url: 'https://example.invalid/x',
    fetchImpl: async (url, init) => {
      captured = { url, init }
      return { ok: true, status: 200, text: async () => 'ok' }
    },
  })
  await send({ recipients: ['a@b.c'], subject: '主题', text: '正文' })
  assert.equal(captured.url, 'https://example.invalid/x')
  assert.equal(captured.init.method, 'POST')
  const payload = JSON.parse(captured.init.body)
  assert.equal(payload.subject, '主题')
  assert.equal(payload.text, '正文')
})

test('httpTransport 在非 2xx 时抛错', async () => {
  const send = httpTransport({
    url: 'https://example.invalid/x',
    fetchImpl: async () => ({ ok: false, status: 500, text: async () => 'boom' }),
  })
  await assert.rejects(() => send({ recipients: [], subject: 's', text: 't' }), /500/)
})

test('默认配置是关闭的', () => {
  const cfg = defaultNotifyConfig()
  assert.equal(cfg.enabled, false)
  assert.equal(cfg.leadMinutes, 10)
  assert.deepEqual(cfg.recipients, [])
  assert.deepEqual(cfg.sentLog, {})
})

test('normalizeNotifyConfig 对缺失输入回落默认', () => {
  const cfg = normalizeNotifyConfig(undefined)
  assert.equal(cfg.enabled, false)
  assert.equal(cfg.transport.kind, 'smtp')
})

test('normalizeNotifyConfig 保留合法字段', () => {
  const cfg = normalizeNotifyConfig({
    enabled: true,
    leadMinutes: 15,
    recipients: ['a@b.c'],
    transport: { kind: 'smtp', host: 'smtp.qq.com', port: 465, user: 'u', pass: 'p' },
  })
  assert.equal(cfg.enabled, true)
  assert.equal(cfg.leadMinutes, 15)
  assert.deepEqual(cfg.recipients, ['a@b.c'])
  assert.equal(cfg.transport.port, 465)
})

test('isRunnable 在未启用时返回 false', () => {
  assert.equal(isRunnable(normalizeNotifyConfig({ enabled: false })), false)
})

test('isRunnable 在没有收件人时返回 false', () => {
  assert.equal(isRunnable(normalizeNotifyConfig({ enabled: true, recipients: [] })), false)
})

test('isRunnable 在 smtp 缺少凭据时返回 false', () => {
  const cfg = normalizeNotifyConfig({
    enabled: true, recipients: ['a@b.c'],
    transport: { kind: 'smtp', host: 'smtp.qq.com', port: 465, user: '', pass: '' },
  })
  assert.equal(isRunnable(cfg), false)
})

test('isRunnable 在配置完整时返回 true', () => {
  const cfg = normalizeNotifyConfig({
    enabled: true, recipients: ['a@b.c'],
    transport: { kind: 'smtp', host: 'smtp.qq.com', port: 465, user: 'u', pass: 'p' },
  })
  assert.equal(isRunnable(cfg), true)
})

test('NOTIFY_KEY 是 notify', () => {
  assert.equal(NOTIFY_KEY, 'notify')
})

function fakeStore(notifyRaw, items) {
  const state = { notify: notifyRaw }
  return {
    state,
    async snapshot() { return { items, done: {}, goals: [] } },
    async readDoc() { return { doc: { notify: state.notify } } },
    async docPatch(patch) {
      if (patch.set && patch.set.notify) state.notify = patch.set.notify
      return { ok: true }
    },
  }
}

test('未启用时一次 tick 不发信也不写状态', async () => {
  const sends = []
  const store = fakeStore({ enabled: false }, [])
  const out = await runReminderTick({
    store, now: new Date('2026-09-28T08:20:00'), send: async (p) => { sends.push(p) },
  })
  assert.equal(sends.length, 0)
  assert.equal(out.sent, 0)
})

test('命中时发信并写回 sentLog', async () => {
  const sends = []
  const items = [{ id: 'a', title: '大物作业', recurring: 'once', date: '2026-09-28', startTime: '08:30' }]
  const store = fakeStore({
    enabled: true, leadMinutes: 10, recipients: ['me@qq.com'],
    transport: { kind: 'webhook', url: 'https://x.invalid' },
    sentLog: {},
  }, items)
  const out = await runReminderTick({
    store, now: new Date('2026-09-28T08:20:00'), send: async (p) => { sends.push(p) },
  })
  assert.equal(out.sent, 1)
  assert.equal(sends.length, 1)
  assert.deepEqual(sends[0].recipients, ['me@qq.com'])
  assert.equal(store.state.notify.sentLog['a@2026-09-28T08:30'] !== undefined, true)
})

test('同一时刻重复 tick 不会重复发', async () => {
  const sends = []
  const items = [{ id: 'a', title: 'x', recurring: 'once', date: '2026-09-28', startTime: '08:30' }]
  const store = fakeStore({
    enabled: true, leadMinutes: 10, recipients: ['me@qq.com'],
    transport: { kind: 'webhook', url: 'https://x.invalid' }, sentLog: {},
  }, items)
  const opts = { store, now: new Date('2026-09-28T08:20:00'), send: async (p) => { sends.push(p) } }
  await runReminderTick(opts)
  await runReminderTick(opts)
  assert.equal(sends.length, 1)
})

test('发送失败时不写 sentLog', async () => {
  const items = [{ id: 'a', title: 'x', recurring: 'once', date: '2026-09-28', startTime: '08:30' }]
  const store = fakeStore({
    enabled: true, leadMinutes: 10, recipients: ['me@qq.com'],
    transport: { kind: 'webhook', url: 'https://x.invalid' }, sentLog: {},
  }, items)
  const out = await runReminderTick({
    store, now: new Date('2026-09-28T08:20:00'),
    send: async () => { throw new Error('boom') },
  })
  assert.equal(out.sent, 0)
  assert.equal(out.failed, 1)
  assert.deepEqual(store.state.notify.sentLog, {})
})

test('startReminder 返回一个可调用的停表函数', () => {
  const store = fakeStore({ enabled: false }, [])
  const stop = startReminder({ store, intervalMs: 100000 })
  assert.equal(typeof stop, 'function')
  stop()
})
