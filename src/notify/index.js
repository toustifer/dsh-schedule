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
    // 上一轮还没跑完(慢网络)时跳过本轮,避免堆积
    if (running) return
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
