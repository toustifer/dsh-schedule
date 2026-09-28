/**
 * 提醒计算核心 —— 纯函数,不读盘、不发信、不碰时钟。
 * 时间字段的解析复用 store.js 的 parseTimeFields,保证与插件既有语义一致。
 */
import { parseTimeFields, matches } from '../store.js'

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
