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
