# 邮件任务提醒 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 dsh-schedule 在日程开始前 10 分钟，通过邮件提醒 YG，并在 DSH 面板内高亮即将开始的条目。

**Architecture:** 宿主端新增 `src/notify/` 子系统，与既有 `src/store.js` 共用同一份数据。核心是**纯函数**的提醒计算（输入数据+时间，输出待发清单），IO 只发生在最外层：读配置 → 算 → 发信 → 写回去重记录。发信走可替换适配器，默认 SMTP。

**Tech Stack:** Node ESM、`node:test` + `node:assert/strict`、`node:tls`（手写 SMTP，**零第三方依赖**）、cordis `ctx.effect`。

**关键约束：本项目禁止引入任何 npm 依赖。** `node_modules` 是指向 `~/.dsh/profiles/web/node_modules` 的符号链接，是所有插件共享的，装包会污染整个 profile。

---

## 文件结构

| 文件 | 职责 |
| :--- | :--- |
| `src/notify/schedule-core.js` | 纯函数：某日程某天的开始时刻、去重键、算出待发提醒 |
| `src/notify/message.js` | 纯函数：渲染邮件主题与正文 |
| `src/notify/smtp.js` | 零依赖 SMTP over TLS 客户端 + MIME 构造 |
| `src/notify/transports.js` | 适配器工厂：smtp / cfmail / webhook |
| `src/notify/config.js` | notify 配置的默认值、读取、校验 |
| `src/notify/index.js` | 装配层：定时器 + 读配置 + 发送 + 写回 sentLog |
| `src/index.js` | **修改**：apply 里启动通知子系统（约 10 行） |
| `src/client/index.js` | **修改**：面板内「即将开始」高亮 + 时钟 tick |
| `test/notify.test.mjs` | **新建**：上述全部单测 |

---

### Task 1: 开始时刻与去重键

**Files:**
- Create: `src/notify/schedule-core.js`
- Test: `test/notify.test.mjs`

- [ ] **Step 1: 写失败测试**

创建 `test/notify.test.mjs`：

~~~js
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
~~~

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/notify.test.mjs`
Expected: FAIL — `Cannot find module '../src/notify/schedule-core.js'`

- [ ] **Step 3: 写最小实现**

创建 `src/notify/schedule-core.js`：

~~~js
/**
 * 提醒计算核心 —— 纯函数,不读盘、不发信、不碰时钟。
 * 时间字段的解析复用 store.js 的 parseTimeFields,保证与插件既有语义一致。
 */
import { parseTimeFields } from '../store.js'

/**
 * 某条日程在某天的开始时刻。
 * 无时间、或时间非法时返回 null —— 调用方据此跳过该条。
 */
export function startOfOccurrence(item) {
  if (item === null || typeof item !== 'object') return null
  const parsed = parseTimeFields(item.time, item.startTime, item.endTime)
  const raw = parsed.startTime
  if (typeof raw !== 'string' || raw === '') return null
  const m = raw.match(/^(\d{1,2}):(\d{2})$/)
  if (m === null) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (h > 23 || mi > 59) return null
  const hhmm = String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0')
  return { minutes: h * 60 + mi, hhmm }
}

/**
 * 去重键 = 日程 id + 发生时该天的该时刻。
 * 必须含时刻:否则每周重复的课程只有第一周会提醒。
 */
export function reminderKey(itemId, dateStr, hhmm) {
  return String(itemId) + '@' + dateStr + 'T' + hhmm
}
~~~

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/notify.test.mjs`
Expected: PASS — 8 个测试全绿

- [ ] **Step 5: 提交**

~~~bash
git add src/notify/schedule-core.js test/notify.test.mjs
git commit -m "feat(notify): 开始时刻解析与去重键"
~~~

---

### Task 2: 算出待发提醒

**Files:**
- Modify: `src/notify/schedule-core.js`
- Test: `test/notify.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `test/notify.test.mjs`：

~~~js
import { computeDueReminders } from '../src/notify/schedule-core.js'

const DATE = '2026-09-28'

function item(id, startTime, extra) {
  return Object.assign({ id, title: id, recurring: 'once', date: DATE, startTime }, extra)
}

test('命中窗口内的日程', () => {
  const items = [item('a', '08:30'), item('b', '17:00')]
  // 08:20 → 窗口 [500, 510],08:30(=510) 命中
  const due = computeDueReminders({ items, dateStr: DATE, minutesNow: 500, leadMinutes: 10 })
  assert.equal(due.length, 1)
  assert.equal(due[0].item.id, 'a')
  assert.equal(due[0].hhmm, '08:30')
})

test('窗口之外的不命中', () => {
  const items = [item('a', '08:31')]
  const due = computeDueReminders({ items, dateStr: DATE, minutesNow: 500, leadMinutes: 10 })
  assert.equal(due.length, 0)
})

test('已过时刻的不命中', () => {
  const items = [item('a', '08:00')]
  const due = computeDueReminders({ items, dateStr: DATE, minutesNow: 500, leadMinutes: 10 })
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
  const items = [item('a', '08:30')]
  const sentLog = { 'a@2026-09-28T08:30': 1790000000000 }
  const due = computeDueReminders({ items, dateStr: DATE, minutesNow: 500, leadMinutes: 10, sentLog })
  assert.equal(due.length, 0)
})

test('多条命中按时间升序返回', () => {
  const items = [item('late', '08:30'), item('early', '08:25')]
  const due = computeDueReminders({ items, dateStr: DATE, minutesNow: 500, leadMinutes: 10 })
  assert.deepEqual(due.map((d) => d.item.id), ['early', 'late'])
})

test('weekly 课程在指定星期命中', () => {
  const items = [{
    id: 'w', title: '大学物理（D）[03]', recurring: 'weekly',
    weekdays: [1], startTime: '08:30',
  }]
  // 2026-09-28 是周一
  const due = computeDueReminders({ items, dateStr: DATE, minutesNow: 500, leadMinutes: 10 })
  assert.equal(due.length, 1)
  assert.equal(due[0].key, 'w@2026-09-28T08:30')
})
~~~

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/notify.test.mjs`
Expected: FAIL — `computeDueReminders is not a function`

- [ ] **Step 3: 写实现**

把 `src/notify/schedule-core.js` 顶部**那一行** import 改成同时引入 `matches`（不要再加第二行 import）：

~~~js
import { parseTimeFields, matches } from '../store.js'
~~~

在文件末尾追加：

~~~js
/**
 * 算出「现在该发哪些提醒」。
 * 窗口是闭区间 [minutesNow, minutesNow + leadMinutes]。
 *
 * 跨午夜的窗口(如 23:55 命中次日 00:05)不在本版范围内 —— 凌晨日程极少,
 * 且实现它会让日期归属变复杂,按 YAGNI 略过。
 */
export function computeDueReminders(opts) {
  const items = Array.isArray(opts.items) ? opts.items : []
  const dateStr = opts.dateStr
  const minutesNow = opts.minutesNow
  const leadMinutes = typeof opts.leadMinutes === 'number' ? opts.leadMinutes : 10
  const sentLog = opts.sentLog !== null && typeof opts.sentLog === 'object' ? opts.sentLog : {}

  const horizonEnd = minutesNow + leadMinutes
  const due = []

  for (const item of items) {
    if (item === null || typeof item !== 'object') continue
    if (!matches(item, dateStr)) continue
    const occ = startOfOccurrence(item)
    if (occ === null) continue
    if (occ.minutes < minutesNow || occ.minutes > horizonEnd) continue
    const key = reminderKey(item.id, dateStr, occ.hhmm)
    if (Object.prototype.hasOwnProperty.call(sentLog, key)) continue
    due.push({ key, item, dateStr, hhmm: occ.hhmm, minutes: occ.minutes })
  }

  due.sort((a, b) => a.minutes - b.minutes)
  return due
}
~~~

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/notify.test.mjs`
Expected: PASS — 16 个测试全绿

- [ ] **Step 5: 提交**

~~~bash
git add src/notify/schedule-core.js test/notify.test.mjs
git commit -m "feat(notify): 提醒窗口计算"
~~~

---

### Task 3: 邮件内容渲染

**Files:**
- Create: `src/notify/message.js`
- Test: `test/notify.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `test/notify.test.mjs`：

~~~js
import { renderReminder } from '../src/notify/message.js'

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
~~~

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/notify.test.mjs`
Expected: FAIL — 找不到 `../src/notify/message.js`

- [ ] **Step 3: 写实现**

创建 `src/notify/message.js`：

~~~js
/**
 * 把待发提醒渲染成邮件主题与正文 —— 纯函数,纯文本,不做 HTML。
 * 提醒的职责是让人看见,不是好看。
 */
const FOOTER = '——\ndsh-schedule 自动提醒'

export function renderReminder(entries, ctx) {
  const list = Array.isArray(entries) ? entries : []
  if (list.length === 0) return null

  const leadMinutes = ctx.leadMinutes
  const dateStr = ctx.dateStr
  const weekdayName = ctx.weekdayName
  const todayLine = '今天 ' + dateStr + ' ' + weekdayName

  let subject
  const lines = []

  if (list.length === 1) {
    const e = list[0]
    const title = e.item.title === undefined ? '' : String(e.item.title)
    subject = '⏰ ' + leadMinutes + ' 分钟后：' + title
    lines.push(title)
    lines.push(e.hhmm + ' 开始')
  } else {
    subject = '⏰ ' + leadMinutes + ' 分钟内有 ' + list.length + ' 条日程'
    for (const e of list) {
      lines.push('· ' + e.hhmm + '  ' + (e.item.title === undefined ? '' : String(e.item.title)))
    }
  }

  lines.push('')
  lines.push(todayLine)
  lines.push(FOOTER)

  return { subject, text: lines.join('\n') }
}
~~~

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/notify.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交**

~~~bash
git add src/notify/message.js test/notify.test.mjs
git commit -m "feat(notify): 邮件内容渲染"
~~~

---

### Task 4: 零依赖 SMTP 客户端

**Files:**
- Create: `src/notify/smtp.js`
- Test: `test/notify.test.mjs`

- [ ] **Step 1: 写失败测试（只测纯函数部分）**

追加到 `test/notify.test.mjs`：

~~~js
import { encodeHeader, buildMessage, dotStuff } from '../src/notify/smtp.js'

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
~~~

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/notify.test.mjs`
Expected: FAIL — 找不到 `../src/notify/smtp.js`

- [ ] **Step 3: 写实现**

创建 `src/notify/smtp.js`：

~~~js
/**
 * 极简 SMTP over TLS 客户端 —— 零第三方依赖。
 * 为什么手写:插件的 node_modules 是指向共享 profile 的符号链接,
 * 装 nodemailer 会污染所有插件。协议本身足够简单,不值得为此引入依赖。
 *
 * 只支持 465 端口的隐式 TLS(QQ 邮箱支持),不支持 STARTTLS —— 够用即可。
 */
import tls from 'node:tls'

const CRLF = '\r\n'

/** 非 ASCII 头部必须做 RFC 2047 编码,否则收件端会显示乱码。 */
export function encodeHeader(value) {
  const s = String(value === undefined || value === null ? '' : value)
  if (/^[\x20-\x7E]*$/.test(s)) return s
  return '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?='
}

/** RFC 5321 点填充:行首的 '.' 必须重复一次。正文用 base64,这里主要防头部意外。 */
export function dotStuff(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => (line.startsWith('.') ? '.' + line : line))
    .join(CRLF)
}

/** 构造完整 MIME 报文。正文整体 base64,避免 8bit 与行宽问题。 */
export function buildMessage(opts) {
  const headers = [
    'From: ' + opts.from,
    'To: ' + opts.to.join(', '),
    'Subject: ' + encodeHeader(opts.subject),
    'Date: ' + opts.date.toUTCString(),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ]
  const body = Buffer.from(String(opts.text), 'utf8').toString('base64')
  // base64 每行不超过 76 字符,按 76 折行
  const wrapped = body.match(/.{1,76}/g) || ['']
  return headers.join(CRLF) + CRLF + CRLF + wrapped.join(CRLF)
}

/**
 * 逐行读取 SMTP 响应。SMTP 多行响应用 "250-xxx" 续行、末行 "250 xxx" 结束,
 * 这里把一次响应聚合成一行字符串交给调用方。
 */
function createLineReader(socket) {
  let buf = ''
  let pending = []
  const queue = []
  let waiter = null

  function deliver(line) {
    if (waiter !== null) {
      const w = waiter
      waiter = null
      w(line)
    } else {
      queue.push(line)
    }
  }

  socket.on('data', (chunk) => {
    buf += chunk.toString('utf8')
    let idx = buf.indexOf('\r\n')
    while (idx >= 0) {
      const line = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      if (/^\d{3}-/.test(line)) {
        pending.push(line)
      } else {
        deliver(pending.length > 0 ? pending.join('\n') + '\n' + line : line)
        pending = []
      }
      idx = buf.indexOf('\r\n')
    }
  })

  return function readLine() {
    return new Promise((resolve) => {
      if (queue.length > 0) {
        resolve(queue.shift())
        return
      }
      waiter = resolve
    })
  }
}

/** 响应首行码不匹配就抛错,错误信息带上服务器原文,便于排查。 */
function expectCode(response, code) {
  if (!response.startsWith(code)) {
    throw new Error('SMTP 期望 ' + code + ',收到: ' + response.split('\n')[0])
  }
}

/**
 * 发一封信。任何一步失败都 reject,并销毁连接。
 * 收件人逐个 RCPT TO —— 多收件人是需求,不是可选项。
 */
export function smtpSend(opts) {
  const host = opts.host
  const port = opts.port === undefined ? 465 : opts.port
  const user = opts.user
  const pass = opts.pass
  const from = opts.from
  const to = Array.isArray(opts.to) ? opts.to : [opts.to]
  const timeoutMs = opts.timeoutMs === undefined ? 25000 : opts.timeoutMs

  return new Promise((resolve, reject) => {
    let settled = false
    let socket = null

    const timer = setTimeout(() => {
      finish(new Error('SMTP 超时(' + timeoutMs + 'ms)'))
    }, timeoutMs)

    function finish(err) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (socket !== null) {
        try { socket.destroy() } catch (e) { /* 连接已断,忽略 */ }
      }
      if (err) reject(err)
      else resolve()
    }

    socket = tls.connect({ host, port, servername: host }, async () => {
      const read = createLineReader(socket)
      try {
        expectCode(await read(), '220')
        socket.write('EHLO dsh-schedule' + CRLF)
        expectCode(await read(), '250')

        socket.write('AUTH LOGIN' + CRLF)
        expectCode(await read(), '334')
        socket.write(Buffer.from(user, 'utf8').toString('base64') + CRLF)
        expectCode(await read(), '334')
        socket.write(Buffer.from(pass, 'utf8').toString('base64') + CRLF)
        expectCode(await read(), '235')

        socket.write('MAIL FROM:<' + from + '>' + CRLF)
        expectCode(await read(), '250')

        for (const rcpt of to) {
          socket.write('RCPT TO:<' + rcpt + '>' + CRLF)
          expectCode(await read(), '250')
        }

        socket.write('DATA' + CRLF)
        expectCode(await read(), '354')

        const message = buildMessage({
          from, to, subject: opts.subject, text: opts.text, date: new Date(),
        })
        socket.write(dotStuff(message) + CRLF + '.' + CRLF)
        expectCode(await read(), '250')

        socket.write('QUIT' + CRLF)
        finish(null)
      } catch (e) {
        finish(e)
      }
    })

    socket.on('error', (e) => finish(e))
  })
}
~~~

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/notify.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交**

~~~bash
git add src/notify/smtp.js test/notify.test.mjs
git commit -m "feat(notify): 零依赖 SMTP over TLS 客户端"
~~~

---

### Task 5: 传输适配器

**Files:**
- Create: `src/notify/transports.js`
- Test: `test/notify.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `test/notify.test.mjs`：

~~~js
import { createTransport, httpTransport } from '../src/notify/transports.js'

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
~~~

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/notify.test.mjs`
Expected: FAIL — 找不到模块

- [ ] **Step 3: 写实现**

创建 `src/notify/transports.js`：

~~~js
/**
 * 发信适配器 —— 统一接口 send({ recipients, subject, text }) => Promise<void>。
 * 换通道只改配置里的 transport.kind,不动调度逻辑。
 */
import { smtpSend } from './smtp.js'

/** SMTP(默认):把收件人列表整体交给 smtpSend,它内部逐个 RCPT TO。 */
export function smtpTransport(config) {
  const from = config.user
  return async function send(payload) {
    await smtpSend({
      host: config.host,
      port: config.port,
      user: config.user,
      pass: config.pass,
      from,
      to: payload.recipients,
      subject: payload.subject,
      text: payload.text,
    })
  }
}

/** 通用 HTTP 端点:cfmail 与任意 webhook 都走这里。 */
export function httpTransport(config) {
  const doFetch = config.fetchImpl || globalThis.fetch
  return async function send(payload) {
    const res = await doFetch(config.url, {
      method: 'POST',
      headers: Object.assign(
        { 'content-type': 'application/json' },
        config.headers === undefined ? {} : config.headers,
      ),
      body: JSON.stringify({
        recipients: payload.recipients,
        subject: payload.subject,
        text: payload.text,
      }),
    })
    if (res === undefined || res.ok !== true) {
      const status = res === undefined ? 'no-response' : res.status
      const body = res !== undefined && typeof res.text === 'function'
        ? await res.text().catch(() => '')
        : ''
      throw new Error('HTTP 传输失败 ' + status + ': ' + String(body).slice(0, 200))
    }
  }
}

/** 按配置造出对应的 send 函数。 */
export function createTransport(config) {
  const kind = config === null || config === undefined ? undefined : config.kind
  if (kind === 'smtp') return smtpTransport(config)
  if (kind === 'cfmail' || kind === 'webhook') return httpTransport(config)
  throw new Error('未知的 transport.kind: ' + String(kind))
}
~~~

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/notify.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交**

~~~bash
git add src/notify/transports.js test/notify.test.mjs
git commit -m "feat(notify): 可替换的发信适配器"
~~~

---

### Task 6: 配置的默认值与校验

**Files:**
- Create: `src/notify/config.js`
- Test: `test/notify.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `test/notify.test.mjs`：

~~~js
import { NOTIFY_KEY, defaultNotifyConfig, normalizeNotifyConfig, isRunnable } from '../src/notify/config.js'

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
})

test('isRunnable 在未启用时返回 false', () => {
  assert.equal(isRunnable(normalizeNotifyConfig({ enabled: false })), false)
})

test('isRunnable 在没有收件人时返回 false', () => {
  const cfg = normalizeNotifyConfig({ enabled: true, recipients: [] })
  assert.equal(isRunnable(cfg), false)
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
~~~

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/notify.test.mjs`
Expected: FAIL

- [ ] **Step 3: 写实现**

创建 `src/notify/config.js`：

~~~js
/**
 * notify 配置的读取与校验。
 * 配置存在插件数据文件的扩展字段里,走 store.docPatch / store.readDoc,
 * 不改数据格式版本。
 */
export const NOTIFY_KEY = 'notify'

export const DEFAULT_LEAD_MINUTES = 10

export function defaultNotifyConfig() {
  return {
    enabled: false,
    leadMinutes: DEFAULT_LEAD_MINUTES,
    recipients: [],
    transport: {
      kind: 'smtp',
      host: 'smtp.qq.com',
      port: 465,
      secure: true,
      user: '',
      pass: '',
    },
    sentLog: {},
  }
}

function asStringArray(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const v of value) {
    if (typeof v === 'string' && v.trim() !== '') out.push(v.trim())
  }
  return out
}

function positiveInt(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.floor(n)
}

/** 把任意输入(可能来自手改的 JSON)整理成一份可信配置。 */
export function normalizeNotifyConfig(raw) {
  const base = defaultNotifyConfig()
  if (raw === null || typeof raw !== 'object') return base

  const transportRaw = raw.transport !== null && typeof raw.transport === 'object'
    ? raw.transport
    : {}

  return {
    enabled: raw.enabled === true,
    leadMinutes: positiveInt(raw.leadMinutes, DEFAULT_LEAD_MINUTES),
    recipients: asStringArray(raw.recipients),
    transport: {
      kind: typeof transportRaw.kind === 'string' && transportRaw.kind !== ''
        ? transportRaw.kind
        : base.transport.kind,
      host: typeof transportRaw.host === 'string' ? transportRaw.host : base.transport.host,
      port: positiveInt(transportRaw.port, base.transport.port),
      secure: transportRaw.secure !== false,
      user: typeof transportRaw.user === 'string' ? transportRaw.user : '',
      pass: typeof transportRaw.pass === 'string' ? transportRaw.pass : '',
      url: typeof transportRaw.url === 'string' ? transportRaw.url : '',
    },
    sentLog: raw.sentLog !== null && typeof raw.sentLog === 'object' ? raw.sentLog : {},
  }
}

/**
 * 是否具备真正发信的条件。
 * 「没配好就绝不发」—— 宁可安静,也不要发半成品或报错刷屏。
 */
export function isRunnable(cfg) {
  if (cfg.enabled !== true) return false
  if (cfg.recipients.length === 0) return false
  const t = cfg.transport
  if (t.kind === 'smtp') {
    return t.host !== '' && t.user !== '' && t.pass !== ''
  }
  if (t.kind === 'cfmail' || t.kind === 'webhook') {
    return typeof t.url === 'string' && t.url !== ''
  }
  return false
}
~~~

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/notify.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交**

~~~bash
git add src/notify/config.js test/notify.test.mjs
git commit -m "feat(notify): 配置默认值与可运行性校验"
~~~

---

### Task 7: 装配层（定时器 + 发送 + 写回）

**Files:**
- Create: `src/notify/index.js`
- Test: `test/notify.test.mjs`

- [ ] **Step 1: 写失败测试（注入假时钟与假传输）**

追加到 `test/notify.test.mjs`：

~~~js
import { runReminderTick, startReminder } from '../src/notify/index.js'

function fakeStore(notifyRaw, items) {
  const state = { notify: notifyRaw }
  return {
    state,
    async snapshot() { return { items, done: {}, goals: [] } },
    async readDoc(keys) { return { doc: { notify: state.notify } } },
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
~~~

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/notify.test.mjs`
Expected: FAIL

- [ ] **Step 3: 写实现**

创建 `src/notify/index.js`：

~~~js
/**
 * 通知子系统装配层 —— 唯一有副作用的地方:
 * 读配置 → 算待发 → 发信 → 写回去重记录。
 *
 * 时钟通过 now 注入,发信通过 send 注入 —— 因此可以完全离线单测。
 */
import { computeDueReminders } from './schedule-core.js'
import { renderReminder } from './message.js'
import { createTransport } from './transports.js'
import { NOTIFY_KEY, normalizeNotifyConfig, isRunnable } from './config.js'

const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const SENT_LOG_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** 本地时区:某天的 YYYY-MM-DD 与当天已过分钟数。 */
function localParts(d) {
  const pad = (n) => String(n).padStart(2, '0')
  const dateStr = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  const minutesNow = d.getHours() * 60 + d.getMinutes()
  const iso = d.getDay() === 0 ? 7 : d.getDay()
  return { dateStr, minutesNow, weekdayName: WEEKDAY_NAMES[iso - 1] }
}

/** 只保留最近 7 天的去重记录,避免无限膨胀。 */
function pruneSentLog(sentLog, nowMs) {
  const out = {}
  for (const key of Object.keys(sentLog)) {
    const at = Number(sentLog[key])
    if (Number.isFinite(at) && nowMs - at < SENT_LOG_TTL_MS) out[key] = at
  }
  return out
}

/** 读取当前配置(容错:任何异常都回落到「未启用」)。 */
async function loadConfig(store) {
  try {
    const res = await store.readDoc([NOTIFY_KEY])
    const doc = res !== null && typeof res === 'object' ? res.doc : undefined
    return normalizeNotifyConfig(doc === undefined ? undefined : doc[NOTIFY_KEY])
  } catch (e) {
    return normalizeNotifyConfig(undefined)
  }
}

async function persistSentLog(store, cfg, sentLog) {
  const next = Object.assign({}, cfg, { sentLog })
  await store.docPatch({ set: { [NOTIFY_KEY]: next } })
}

/**
 * 跑一次提醒检查。返回统计,便于测试与日志。
 * send 可注入;不注入时按配置造真实传输。
 */
export async function runReminderTick(opts) {
  const store = opts.store
  const now = opts.now instanceof Date ? opts.now : new Date()
  const nowMs = now.getTime()

  const cfg = await loadConfig(store)
  const sentLog = pruneSentLog(cfg.sentLog, nowMs)

  if (!isRunnable(cfg)) return { sent: 0, failed: 0, skipped: 'not-runnable' }

  const snap = await store.snapshot()
  const parts = localParts(now)
  const due = computeDueReminders({
    items: snap.items,
    dateStr: parts.dateStr,
    minutesNow: parts.minutesNow,
    leadMinutes: cfg.leadMinutes,
    sentLog,
  })

  if (due.length === 0) return { sent: 0, failed: 0, skipped: 'nothing-due' }

  const rendered = renderReminder(due, {
    dateStr: parts.dateStr,
    weekdayName: parts.weekdayName,
    leadMinutes: cfg.leadMinutes,
  })

  const send = typeof opts.send === 'function' ? opts.send : createTransport(cfg.transport)

  try {
    await send({ recipients: cfg.recipients, subject: rendered.subject, text: rendered.text })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (typeof opts.onError === 'function') opts.onError(msg)
    return { sent: 0, failed: 1, error: msg }
  }

  for (const d of due) sentLog[d.key] = nowMs
  await persistSentLog(store, cfg, sentLog)
  return { sent: 1, failed: 0, count: due.length, subject: rendered.subject }
}

/**
 * 启动周期检查。返回停表函数。
 * 默认每分钟一次 —— 对应「提前 10 分钟」这个粒度,精度足够。
 */
export function startReminder(opts) {
  const intervalMs = opts.intervalMs === undefined ? 60000 : opts.intervalMs
  let running = false

  const tick = async () => {
    if (running) return  // 上一轮还没跑完(慢网络),跳过本轮,避免堆积
    running = true
    try {
      await runReminderTick(opts)
    } catch (e) {
      if (typeof opts.onError === 'function') {
        opts.onError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      running = false
    }
  }

  const timer = setInterval(tick, intervalMs)
  if (typeof timer.unref === 'function') timer.unref()

  return function stop() {
    clearInterval(timer)
  }
}
~~~

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/notify.test.mjs`
Expected: PASS

- [ ] **Step 5: 跑全量回归**

Run: `npm test`
Expected: 原有 99 个测试 + 新增测试全部 PASS

- [ ] **Step 6: 提交**

~~~bash
git add src/notify/index.js test/notify.test.mjs
git commit -m "feat(notify): 装配层与周期调度"
~~~

---

### Task 8: 接入插件宿主端

**Files:**
- Modify: `src/index.js`（文件头 import 区 + `apply` 结尾）
- Modify: `scripts/build.mjs`（**必须**：新增 `notify/` 目录的拷贝，否则 lib 里缺模块）

- [ ] **Step 1: 加 import**

在 `src/index.js` 第 20 行 `import { ScheduleStore } from './store.js'` 之后插入：

~~~js
import { startReminder } from './notify/index.js'
~~~

- [ ] **Step 2: 在 apply 里启动**

把 `src/index.js` 末尾这一段：

~~~js
  console.log('[dsh-schedule] host ready')
}
~~~

改成：

~~~js
  // ---- 邮件提醒:每分钟检查一次,DSH 存活期间生效 ----
  ctx.effect(() => {
    const stop = startReminder({
      store,
      intervalMs: 60000,
      onError: (msg) => console.warn('[dsh-schedule] notify error:', msg),
    })
    return () => stop()
  }, 'dsh-schedule: reminder ticker')

  console.log('[dsh-schedule] host ready')
}
~~~

- [ ] **Step 3: 让构建脚本带上 notify/ 目录**

build.mjs 原本只拷贝 `src/index.js` 与 `src/store.js`。把 import 行改成：

~~~js
import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
~~~

并在两个 `copyFileSync` 之后追加：

~~~js
// notify/ 是宿主端新增的子模块目录,必须一起带上,
// 否则 lib/index.js 里的 import './notify/index.js' 会解析失败。
// 先删后拷:避免源目录里删掉的文件在 lib 里阴魂不散。
const libNotify = join(lib, 'notify')
rmSync(libNotify, { recursive: true, force: true })
cpSync(join(root, 'src', 'notify'), libNotify, { recursive: true })
~~~

- [ ] **Step 4: 构建并全量测试**

Run: `npm test`
Expected: 全部 PASS（`npm test` 会先跑 build 再跑测试）

- [ ] **Step 4: 验证插件能加载**

Run: `node -e "import('./lib/index.js').then(m => console.log('exports:', Object.keys(m).join(',')))"`
Expected: 打印 `exports: name,inject,apply`，且不抛错

- [ ] **Step 5: 提交**

~~~bash
git add src/index.js
git commit -m "feat(notify): 宿主端接入提醒调度"
~~~

---

### Task 9: 客户端「即将开始」高亮

**Files:**
- Modify: `src/client/index.js`（CSS 常量、ScheduleRow 组件、SchedulePanel 时钟）

- [ ] **Step 1: 追加 CSS**

在 `src/client/index.js` 第 22 行 CSS 字符串的**末尾**（`.dsh-sched-tt-empty{...}` 之后、闭合单引号之前）追加：

~~~css
.dsh-sched-row.soon{box-shadow:inset 3px 0 0 0 #6cb0f5;}
.dsh-sched-row.soon .dsh-sched-title{color:#6cb0f5;}
~~~

- [ ] **Step 2: 加高亮判定函数**

在 `function ScheduleRow(props) {`（第 138 行）**之前**插入：

~~~js
/** 距离开始还有 leadMinutes 分钟以内 —— 「即将开始」高亮用。 */
function isStartingSoon(block, leadMinutes, now) {
  if (block === null || block === undefined || block.hasTime !== true) return false
  const d = now === undefined ? new Date() : now
  const nowM = d.getHours() * 60 + d.getMinutes()
  const diff = block.startMinutes - nowM
  return diff >= 0 && diff <= leadMinutes
}
~~~

- [ ] **Step 3: ScheduleRow 用上高亮**

把第 195-196 行：

~~~js
    const titleCls = 'dsh-sched-title' + (done ? ' done' : '') + (links.length > 0 ? ' linked' : '')
    return React.createElement('div', { className: 'dsh-sched-row' },
~~~

改成（`tb` 是第 181 行已有的 parseTimeBlock 结果）：

~~~js
    const titleCls = 'dsh-sched-title' + (done ? ' done' : '') + (links.length > 0 ? ' linked' : '')
    // 10 分钟内即将开始 —— 提醒的视觉侧,与邮件同时生效
    const soon = !done && isStartingSoon(tb, 10)
    return React.createElement('div', { className: 'dsh-sched-row' + (soon ? ' soon' : '') },
~~~

- [ ] **Step 4: 加时钟 tick**

`refresh()` 只在数据变化时触发重渲染，而高亮取决于「现在几点」。在 `SchedulePanel` 内、`const active = props.visible !== false` 这一行**之后**插入：

~~~js
    // 高亮与「现在几点」有关,而 refresh 不保证重渲染 —— 用独立 tick 驱动。
    const [, setClockTick] = React.useState(0)
    React.useEffect(() => {
      if (!active) return undefined
      if (timerSvc === undefined || typeof timerSvc.interval !== 'function') return undefined
      return timerSvc.interval(() => { setClockTick((n) => n + 1) }, 30000)
    }, [active])
~~~

- [ ] **Step 5: 构建与回归**

Run: `npm test`
Expected: 全部 PASS —— 本任务是纯 UI 改动，不应影响任何既有断言

- [ ] **Step 6: 提交**

~~~bash
git add src/client/index.js
git commit -m "feat(notify): 面板内「即将开始」高亮"
~~~

---

### Task 10: 写配置并端到端验证

**Files:**
- 无代码改动；这一步是**真机验证**

- [ ] **Step 1: 写入配置（把授权码填进去）**

用 agent 工具写扩展字段：

~~~json
{
  "set": {
    "notify": {
      "enabled": true,
      "leadMinutes": 10,
      "recipients": ["1577574695@qq.com"],
      "transport": {
        "kind": "smtp",
        "host": "smtp.qq.com",
        "port": 465,
        "secure": true,
        "user": "1577574695@qq.com",
        "pass": "<QQ 邮箱授权码>"
      },
      "sentLog": {}
    }
  }
}
~~~

调用：`dailytask_doc_patch`

- [ ] **Step 2: 用一条 3 分钟后开始的日程验证**

~~~bash
dailytask_add  { "title": "提醒功能自检", "date": "<今天>", "start_time": "<当前时间+3分钟>" }
~~~

- [ ] **Step 3: 重启 DSH，等 3 分钟**

Expected: 邮箱收到主题为 `⏰ 10 分钟后：提醒功能自检` 的邮件

- [ ] **Step 4: 确认去重生效**

再等 1 分钟，确认**没有**收到第二封。

- [ ] **Step 5: 清理测试日程**

~~~bash
dailytask_delete { "id": "<自检条目 id>" }
~~~

---

## 已明确不做（YAGNI）

- 微信 / Telegram / 企业微信推送
- 每日汇总、每周复盘、逾期告警
- 无时间任务的提醒
- 跨午夜的提醒窗口
- HTML 格式邮件
- STARTTLS（只支持 465 隐式 TLS）

## 已知限制

- **插件活在 DSH 进程内**：DSH 未运行或机器关机 → 无提醒。这是架构约束。
- 机器休眠跨过提醒时刻后**不补发**（窗口已过）。
- 发信失败只记日志，不重试（下一分钟若仍在窗口内会自然重试）。
