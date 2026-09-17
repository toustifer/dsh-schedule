/**
 * dsh-schedule — 客户端纯逻辑(无 React / 无 DOM / 无 IO)。
 *
 * 该文件同时以两种方式使用:
 *   1. node:test 单元测试直接 require(本文件是 .cjs,不受 package.json
 *      "type": "module" 影响);
 *   2. scripts/build.mjs 把它整体内联到 C6 bundle 工厂闭包里,
 *      位于 src/client/index.js 之前,后者直接引用这些函数名。
 *
 * 底部的条件导出只在 Node(测试)环境生效:bundle 里存在 window,
 * 导出被跳过,不影响工厂返回值。
 */

function pad(n) { return String(n).padStart(2, '0') }

/** Date → 本地时区 YYYY-MM-DD。 */
function fmt(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) }

function todayStr() { return fmt(new Date()) }

/** YYYY-MM-DD → 本地时区 Date(仅用于展示/星期计算)。 */
function dateOf(s) { const p = s.split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])) }

/** 日期字符串 → ISO 星期几(1=周一 … 7=周日)。 */
function isoDay(s) { const j = dateOf(s).getDay(); return j === 0 ? 7 : j }

function addDays(s, n) { const d = dateOf(s); d.setDate(d.getDate() + n); return fmt(d) }

function mondayOf(s) { return addDays(s, -(isoDay(s) - 1)) }

const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/**
 * 日程在某天是否出现。与宿主端 store.js 的 matches 保持一致:
 * once 日程的顺延历史日期(rolloverDates)也算出现,这样历史月历
 * 才能像 README 宣称的那样显示顺延经过的每一天。
 */
function matches(item, dateStr) {
  if (item.recurring === 'once') {
    if (item.date === dateStr) return true
    return Array.isArray(item.rolloverDates) && item.rolloverDates.indexOf(dateStr) !== -1
  }
  if (item.recurring === 'daily') return true
  if (item.recurring === 'weekly') {
    const wd = Array.isArray(item.weekdays) ? item.weekdays : []
    return wd.indexOf(isoDay(dateStr)) !== -1
  }
  return false
}

function recurringLabel(item) {
  if (item.recurring === 'daily') return '每天'
  if (item.recurring === 'weekly') {
    const wd = Array.isArray(item.weekdays) ? item.weekdays : []
    if (wd.length === 0) return '每周'
    return '每周' + wd.map((n) => WEEKDAY_NAMES[n - 1]).join('')
  }
  return ''
}

/**
 * 排序:有时间在前(按分钟数值,兼容 H:MM 与 HH:MM),无时间殿后,
 * 同组按标题字典序。入参既可以是日程对象也可以是 rowsFor 的包装行
 * { item, ... } —— 历史实现读错了层级导致排序从未生效,这里统一兼容。
 */
function minutesOfDay(t) {
  const i = t.indexOf(':')
  if (i === -1) return NaN
  return Number(t.slice(0, i)) * 60 + Number(t.slice(i + 1))
}

function unwrapRow(x) {
  return x !== null && typeof x === 'object' && x.item !== undefined ? x.item : x
}

function sortRows(a, b) {
  const ia = unwrapRow(a)
  const ib = unwrapRow(b)
  const ta = typeof ia.time === 'string' && ia.time !== ''
  const tb = typeof ib.time === 'string' && ib.time !== ''
  if (ta !== tb) return ta ? -1 : 1
  if (ta) {
    const ma = minutesOfDay(ia.time)
    const mb = minutesOfDay(ib.time)
    if (ma !== mb) return ma < mb ? -1 : 1
  }
  return String(ia.title || '').localeCompare(String(ib.title || ''))
}

/** data.items 中出现在 dateStr 的日程行(附完成/顺延标记),已排序。 */
function rowsFor(data, dateStr) {
  if (data === null) return []
  const rows = []
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i]
    if (matches(item, dateStr)) {
      const doneMap = data.done && data.done[item.id] ? data.done[item.id] : {}
      const isRollover = item.recurring === 'once' && Array.isArray(item.rolloverDates) && item.rolloverDates.indexOf(dateStr) !== -1
      rows.push({ item, done: !!doneMap[dateStr], rollover: isRollover })
    }
  }
  rows.sort(sortRows)
  return rows
}

/** [fromDate, toDate] 闭区间内的完成总数(字符串比较依赖 YYYY-MM-DD 定长格式)。 */
function completedBetween(data, fromDate, toDate) {
  let n = 0
  if (data !== null) {
    for (const id in data.done) {
      const m = data.done[id]
      for (const date in m) {
        if (m[date] && date >= fromDate && date <= toDate) n++
      }
    }
  }
  return n
}

function hasDoneOn(data, date) {
  if (data === null) return false
  for (const id in data.done) {
    if (data.done[id][date]) return true
  }
  return false
}

function minutesToTime(mins) {
  if (typeof mins !== 'number' || isNaN(mins)) return ''
  const clamped = Math.max(0, Math.min(1439, Math.floor(mins)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return pad(h) + ':' + pad(m)
}

const TIME_RANGE_RE = /^(\d{1,2}:\d{2})\s*[-~至到]\s*(\d{1,2}:\d{2})$/
const SINGLE_TIME_RE = /^(\d{1,2}:\d{2})$/

/**
 * 解析日程的时间块信息:
 * 优先取 startTime/endTime; 若无则从 time 解析起止区间或单一时间点。
 * 单一时间点默认预估 45 分钟用于色块跨度与重叠冲突检测。
 */
function parseTimeBlock(rawItem) {
  const item = unwrapRow(rawItem)
  if (!item || typeof item !== 'object') {
    return { hasTime: false, startTime: '', endTime: '', startMinutes: null, endMinutes: null, durationMinutes: 0, isRange: false }
  }

  let s = typeof item.startTime === 'string' && item.startTime ? item.startTime.trim() : ''
  let e = typeof item.endTime === 'string' && item.endTime ? item.endTime.trim() : ''

  if (!s && typeof item.time === 'string') {
    const t = item.time.trim()
    const mRange = t.match(TIME_RANGE_RE)
    if (mRange) {
      s = mRange[1]
      e = mRange[2]
    } else {
      const mSingle = t.match(SINGLE_TIME_RE)
      if (mSingle) s = mSingle[1]
    }
  }

  const startM = s ? minutesOfDay(s) : NaN
  if (isNaN(startM)) {
    return { hasTime: false, startTime: '', endTime: '', startMinutes: null, endMinutes: null, durationMinutes: 0, isRange: false }
  }

  let endM = e ? minutesOfDay(e) : NaN
  let isRange = true
  if (isNaN(endM) || endM <= startM) {
    if (isNaN(endM)) {
      isRange = false
      endM = Math.min(1440, startM + 45)
      e = minutesToTime(endM)
    } else {
      endM = Math.min(1440, startM + 30)
      e = minutesToTime(endM)
    }
  }

  const durationMinutes = Math.max(1, endM - startM)
  return {
    hasTime: true,
    startTime: s,
    endTime: e,
    startMinutes: startM,
    endMinutes: endM,
    durationMinutes,
    isRange,
  }
}

/** 格式化持续分钟数为友好的文字:如 90 -> "1小时30分", 45 -> "45分钟" */
function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '0分钟'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return h + '小时' + m + '分'
  if (h > 0) return h + '小时'
  return m + '分钟'
}

/** 检测当天有时间的日程之间的重叠冲突 */
function detectTimeConflicts(rows) {
  const conflictMap = {}
  const timed = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const item = unwrapRow(r)
    const block = parseTimeBlock(item)
    if (block.hasTime) {
      timed.push({ row: r, item, block })
      conflictMap[item.id] = []
    }
  }

  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i]
      const b = timed[j]
      // 重叠判定: a.start < b.end && b.start < a.end
      if (a.block.startMinutes < b.block.endMinutes && b.block.startMinutes < a.block.endMinutes) {
        conflictMap[a.item.id].push({
          id: b.item.id,
          title: b.item.title,
          time: b.item.time,
          startTime: b.block.startTime,
          endTime: b.block.endTime,
        })
        conflictMap[b.item.id].push({
          id: a.item.id,
          title: a.item.title,
          time: a.item.time,
          startTime: a.block.startTime,
          endTime: a.block.endTime,
        })
      }
    }
  }
  return conflictMap
}

/**
 * 计算当天的垂直时间轴排程:
 * 返回有序的节点列表 (含 task 节点与计算出来的 free 空闲时段节点), 以及未排期的待办列表
 */
function computeTimeSchedule(rows, options = {}) {
  const unscheduled = []
  const timed = []

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const item = unwrapRow(r)
    const block = parseTimeBlock(item)
    if (block.hasTime) {
      timed.push({
        row: r,
        item,
        done: !!r.done,
        rollover: !!r.rollover,
        block,
      })
    } else {
      unscheduled.push(r)
    }
  }

  // 按起始时间排序
  timed.sort((a, b) => {
    if (a.block.startMinutes !== b.block.startMinutes) {
      return a.block.startMinutes - b.block.startMinutes
    }
    return String(a.item.title || '').localeCompare(String(b.item.title || ''))
  })

  // 冲突检测
  const conflictMap = detectTimeConflicts(rows)

  // 默认工作窗口: 9:00 - 21:00, 若有更早或更晚的任务则自适应外延
  const defaultStart = typeof options.startHour === 'number' ? options.startHour * 60 : 9 * 60
  const defaultEnd = typeof options.endHour === 'number' ? options.endHour * 60 : 21 * 60

  let windowStart = defaultStart
  let windowEnd = defaultEnd
  if (timed.length > 0) {
    windowStart = Math.min(windowStart, timed[0].block.startMinutes)
    windowEnd = Math.max(windowEnd, timed[timed.length - 1].block.endMinutes)
  }

  const nodes = []
  let cursor = windowStart
  let totalFreeMinutes = 0
  let totalBusyMinutes = 0
  let conflictCount = 0

  for (let i = 0; i < timed.length; i++) {
    const cur = timed[i]
    const conflicts = conflictMap[cur.item.id] || []
    if (conflicts.length > 0) conflictCount++
    totalBusyMinutes += cur.block.durationMinutes

    // 若当前任务的起始时间在光标之后, 且差距 >= 15 分钟, 插入一个空闲段
    if (cur.block.startMinutes > cursor && cur.block.startMinutes - cursor >= 15) {
      const freeDur = cur.block.startMinutes - cursor
      totalFreeMinutes += freeDur
      nodes.push({
        type: 'free',
        startTime: minutesToTime(cursor),
        endTime: cur.block.startTime,
        startMinutes: cursor,
        endMinutes: cur.block.startMinutes,
        durationMinutes: freeDur,
        durationText: formatDuration(freeDur),
      })
    }

    nodes.push({
      type: 'task',
      row: cur.row,
      item: cur.item,
      done: cur.done,
      rollover: cur.rollover,
      block: cur.block,
      conflicts,
    })

    // 光标向前推, 考虑任务可能重叠所以取 Math.max
    cursor = Math.max(cursor, cur.block.endMinutes)
  }

  // 尾部空闲段
  if (cursor < windowEnd && windowEnd - cursor >= 15) {
    const tailFree = windowEnd - cursor
    totalFreeMinutes += tailFree
    nodes.push({
      type: 'free',
      startTime: minutesToTime(cursor),
      endTime: minutesToTime(windowEnd),
      startMinutes: cursor,
      endMinutes: windowEnd,
      durationMinutes: tailFree,
      durationText: formatDuration(tailFree),
    })
  }

  return {
    nodes,
    unscheduled,
    stats: {
      totalScheduled: timed.length,
      totalUnscheduled: unscheduled.length,
      conflictCount,
      totalBusyMinutes,
      totalFreeMinutes,
      totalBusyText: formatDuration(totalBusyMinutes),
      totalFreeText: formatDuration(totalFreeMinutes),
      windowStart: minutesToTime(windowStart),
      windowEnd: minutesToTime(windowEnd),
    },
  }
}

/** 连续完成天数:今天没做则从昨天起算。 */
function streakOf(data, today) {
  let cursor = today
  if (!hasDoneOn(data, cursor)) cursor = addDays(cursor, -1)
  let n = 0
  while (hasDoneOn(data, cursor)) { n++; cursor = addDays(cursor, -1) }
  return n
}

if (typeof window === 'undefined' && typeof module !== 'undefined' && module.exports !== undefined) {
  module.exports = {
    pad, fmt, todayStr, dateOf, isoDay, addDays, mondayOf, WEEKDAY_NAMES,
    matches, recurringLabel, sortRows, rowsFor, completedBetween, hasDoneOn, streakOf,
    minutesToTime, minutesOfDay, parseTimeBlock, formatDuration, detectTimeConflicts, computeTimeSchedule,
  }
}
