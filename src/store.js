/**
 * dsh-schedule — 存储核心(纯 Node 模块,可单元测试)。
 *
 * 数据模型:
 *   { items: ScheduleItem[], done: { [itemId]: { [YYYY-MM-DD]: true } } }
 *
 * - items: 日程定义(标题/重复规则/时间/备注/关联会话)
 * - done:  完成记录按 (日程ID, 日期) 永久累积 —— 历史永不删除,
 *          支撑周/月/季度/年度回顾统计。
 * - once + carryOver: 一次性日程未完成时,下次访问自动顺延到当天;
 *          rolloverDates 保留它曾经占用过的历史日期。
 *
 * 存储位置:
 *   默认 ~/.dsh/dsh-schedule-data.json;首次加载时自动迁移旧版
 *   (进程工作目录下的 dsh-schedule-data.json)到新位置。
 */

import { promises as fsp } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** 新数据文件位置:用户 DSH 主目录下。 */
export const DEFAULT_DATA_PATH = join(homedir(), '.dsh', 'dsh-schedule-data.json')

/** 旧版数据文件位置(动态插件时期,写在进程工作目录)。 */
export const LEGACY_DATA_PATH = join(process.cwd(), 'dsh-schedule-data.json')

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{1,2}:\d{2}$/
const TIME_RANGE_RE = /^(\d{1,2}:\d{2})\s*[-~至到]\s*(\d{1,2}:\d{2})$/

// ---- 目标层(Goal)枚举 ----
/** 时间跨度:学期 / 学年 / 自定义起止 */
export const GOAL_HORIZONS = ['term', 'year', 'custom']
/** 度量方式:数值 / 计数 / 百分比 / 里程碑(0 或 1) */
export const GOAL_METRIC_TYPES = ['score', 'count', 'percent', 'milestone']
/** 目标状态:进行中 / 已达成 / 已放弃 */
export const GOAL_STATUSES = ['active', 'done', 'dropped']

// ---- 数据文件元信息 ----

/**
 * 数据格式代次。1 = 无 goals 层,2 = 含 goals 层。
 * 注意这是**数据模型**版本,不是写入方代码版本 —— 写入方是谁看 writtenBy。
 */
export const DATA_FORMAT_VERSION = 2

/**
 * 写入方标识。写进数据文件,便于事后判断"是谁把这个文件写坏的" ——
 * 同机多进程 / 多版本 / 云同步共存时,这是唯一能事后归因的线索。
 * 必须与 package.json 的 version 一致(test/goals.test.mjs 有断言守着)。
 */
export const DATA_WRITER = 'dsh-schedule@0.4.0'

/**
 * 本版本认识的顶层字段。其余字段一律**原样保留**,绝不按白名单重构整个文档
 * —— 否则"持有旧代码的进程写一次盘就会静默抹掉新字段"(issue #2)。
 */
export const KNOWN_TOP_KEYS = ['version', 'writtenBy', 'items', 'done', 'goals']

/**
 * 拷贝对象的自有可枚举键,但剔除 `__proto__`。
 * 数据文件里若含 `"__proto__"`,用赋值方式合并它会走原型 setter 构成原型污染;
 * 必须用逐键赋值 + 显式跳过,而不是展开运算符之外的任何"顺手"写法。
 */
function copySafeEntries(obj) {
  const out = {}
  for (const k of Object.keys(obj)) {
    if (k === '__proto__') continue
    out[k] = obj[k]
  }
  return out
}

export function parseTimeFields(inputTime, inputStartTime, inputEndTime) {
  let startTime = ''
  let endTime = ''

  if (typeof inputStartTime === 'string' && TIME_RE.test(inputStartTime.trim())) {
    startTime = inputStartTime.trim()
  }
  if (typeof inputEndTime === 'string' && TIME_RE.test(inputEndTime.trim())) {
    endTime = inputEndTime.trim()
  }

  if (typeof inputTime === 'string') {
    const t = inputTime.trim()
    const m = t.match(TIME_RANGE_RE)
    if (m) {
      if (!startTime) startTime = m[1]
      if (!endTime) endTime = m[2]
    } else if (TIME_RE.test(t)) {
      if (!startTime) startTime = t
    }
  }

  let time = ''
  if (startTime && endTime) {
    time = startTime + '-' + endTime
  } else if (startTime) {
    time = startTime
  }

  return { time, startTime, endTime }
}

function pad(n) {
  return String(n).padStart(2, '0')
}

/** 本地时区今天的 YYYY-MM-DD。 */
export function localDateStr(d = new Date()) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

/** 纯日历加减天数,使用 UTC 避免夏令时影响日期运算。 */
export function addDays(dateStr, amount) {
  const parts = dateStr.split('-')
  const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])))
  d.setUTCDate(d.getUTCDate() + amount)
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate())
}

/** 日期字符串 → ISO 星期几(1=周一 … 7=周日)。 */
export function isoDay(dateStr) {
  const parts = dateStr.split('-')
  const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])))
  const j = d.getUTCDay()
  return j === 0 ? 7 : j
}

function cleanDate(value) {
  return typeof value === 'string' && DATE_RE.test(value) ? value : ''
}

/**
 * 校验"真实日历"日期:形状 YYYY-MM-DD 且月/日确实存在(拒绝 2026-02-30、
 * 2026-13-01 这类会被 UTC 进位悄悄滚走的值),闰年 2-29 正确放行。
 * 合法返回原字符串,否则返回 ''。
 */
export function parseDateStr(value) {
  const s = cleanDate(value)
  if (s === '') return ''
  const p = s.split('-')
  const y = Number(p[0])
  const m = Number(p[1])
  const d = Number(p[2])
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return ''
  return s
}

/** 日程在某天是否出现。顺延日也属于该一次性日程的历史展开。 */
export function matches(item, dateStr) {
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

function isDone(data, itemId, dateStr) {
  return !!(data && data.done && data.done[itemId] && data.done[itemId][dateStr])
}

/**
 * 把已过期且未完成的一次性顺延日程推进到 today。
 *
 * 这是惰性持久化:不需要后台定时器,任意读取或写入数据时都会执行一次。
 * 如果进程隔了多天才启动,中间每一天都会写入 rolloverDates,所以历史月历
 * 仍能显示每天的未完成记录;当前 date 直接落在今天,不会漏掉任务。
 */
export function reconcileCarryOver(data, today = localDateStr()) {
  const target = cleanDate(today)
  if (target === '' || data === null || typeof data !== 'object' || !Array.isArray(data.items)) return false

  let changed = false
  for (const item of data.items) {
    if (item === null || typeof item !== 'object') continue
    if (item.recurring !== 'once' || item.carryOver !== true) continue
    const due = cleanDate(item.date)
    if (due === '' || due >= target || isDone(data, item.id, due)) continue

    if (!Array.isArray(item.rolloverDates)) {
      item.rolloverDates = []
      changed = true
    }
    let cursor = due
    while (cursor < target) {
      if (item.rolloverDates.indexOf(cursor) === -1) {
        item.rolloverDates.push(cursor)
        changed = true
      }
      cursor = addDays(cursor, 1)
    }
    if (item.date !== target) {
      item.date = target
      changed = true
    }
  }
  return changed
}

function normalizeStoredItem(raw) {
  const item = raw
  if (!Array.isArray(item.weekdays)) item.weekdays = []
  if (!Array.isArray(item.linkedSessions)) item.linkedSessions = []
  if (!Array.isArray(item.rolloverDates)) item.rolloverDates = []
  if (!item.quadrant) item.quadrant = 'q2'
  if (typeof item.time !== 'string') item.time = ''
  if (!item.startTime && item.time) {
    const p = parseTimeFields(item.time, '', '')
    item.startTime = p.startTime
    item.endTime = p.endTime
  }
  if (!item.startTime) item.startTime = ''
  if (!item.endTime) item.endTime = ''
  item.carryOver = item.carryOver === true
  if (typeof item.goalId !== 'string' || item.goalId === '') item.goalId = null
  return item
}

/** 从入参里取 goalId(兼容驼峰与下划线,空串归一为 null)。 */
function pickGoalId(args) {
  const a = args.goalId !== undefined ? args.goalId : args.goal_id
  return typeof a === 'string' && a.trim() !== '' ? a.trim() : null
}

/**
 * 载入时惰性补齐一条目标的结构缺省值。
 * 与 normalizeStoredItem 一致:只补不删,永不因缺字段丢弃用户数据。
 */
function normalizeStoredGoal(raw) {
  const g = raw
  if (!Array.isArray(g.linkedSessions)) g.linkedSessions = []
  if (!GOAL_HORIZONS.includes(g.horizon)) g.horizon = 'custom'
  if (!GOAL_STATUSES.includes(g.status)) g.status = 'active'
  if (g.metric === null || typeof g.metric !== 'object') g.metric = {}
  const m = g.metric
  if (!GOAL_METRIC_TYPES.includes(m.type)) m.type = 'percent'
  const t = Number(m.target)
  m.target = Number.isFinite(t) && t > 0 ? t : (m.type === 'milestone' ? 1 : 100)
  const cur = Number(m.current)
  m.current = Number.isFinite(cur) ? Math.max(0, Math.min(m.target, cur)) : 0
  if (typeof m.unit !== 'string') m.unit = ''
  if (typeof g.startDate !== 'string') g.startDate = ''
  if (typeof g.endDate !== 'string') g.endDate = ''
  if (typeof g.note !== 'string') g.note = ''
  if (typeof g.title !== 'string') g.title = ''
  return g
}

/**
 * 校验并规范化一条新增目标。
 * metric.current 缺省 0;milestone 强制 target = 1(达成/未达成)。
 */
export function normalizeGoal(args, now = Date.now(), today = localDateStr()) {
  const title = String(args.title === undefined ? '' : args.title).trim()
  if (title === '') throw new Error('目标标题不能为空')

  const horizon = GOAL_HORIZONS.includes(args.horizon) ? args.horizon : 'custom'

  let startDate = ''
  if (args.startDate !== undefined && args.startDate !== null && args.startDate !== '') {
    startDate = parseDateStr(args.startDate)
    if (startDate === '') throw new Error('无效开始日期(需要真实的 YYYY-MM-DD): ' + args.startDate)
  } else {
    startDate = cleanDate(today) || localDateStr()
  }

  let endDate = ''
  if (args.endDate !== undefined && args.endDate !== null && args.endDate !== '') {
    endDate = parseDateStr(args.endDate)
    if (endDate === '') throw new Error('无效结束日期(需要真实的 YYYY-MM-DD): ' + args.endDate)
  } else {
    // 缺省跨度:学年 ≈ 280 天,学期 ≈ 140 天,自定义 ≈ 90 天
    const span = horizon === 'year' ? 280 : horizon === 'term' ? 140 : 90
    endDate = addDays(startDate, span)
  }
  if (endDate < startDate) throw new Error('结束日期不能早于开始日期: ' + startDate + ' ~ ' + endDate)

  const rawMetric = args.metric !== null && typeof args.metric === 'object' ? args.metric : {}
  const type = GOAL_METRIC_TYPES.includes(rawMetric.type) ? rawMetric.type : 'percent'
  let target = Number(rawMetric.target)
  if (type === 'milestone') target = 1
  else if (!Number.isFinite(target) || target <= 0) target = type === 'percent' ? 100 : 1
  let current = Number(rawMetric.current)
  if (!Number.isFinite(current) || current < 0) current = 0
  if (current > target) current = target

  let unit = typeof rawMetric.unit === 'string' ? rawMetric.unit : ''
  if (unit === '' && type === 'percent') unit = '%'

  return {
    id: 'goal_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 8),
    title,
    horizon,
    startDate,
    endDate,
    metric: { type, target, current, unit },
    status: GOAL_STATUSES.includes(args.status) ? args.status : 'active',
    note: typeof args.note === 'string' ? args.note : '',
    linkedSessions: [],
    createdAt: now,
  }
}

/** horizon → 中文标签(供 UI / 工具输出复用)。 */
export function horizonLabel(h) {
  if (h === 'term') return '学期'
  if (h === 'year') return '学年'
  return '自定义'
}

/**
 * 计算目标进度。
 * 采用手动填写的 metric.current;当 current 为 0 而目标下挂了日程时,
 * 退化为「关联日程的完成率」推导 —— 仅用于展示,不写回数据(derived 标记)。
 */
export function goalProgress(goal, data, today = localDateStr()) {
  if (goal === null || typeof goal !== 'object') {
    return { current: 0, target: 1, percent: 0, remainingDays: 0, linkedTotal: 0, linkedDone: 0, derived: false }
  }
  const m = goal.metric !== null && typeof goal.metric === 'object' ? goal.metric : {}
  const target = Number.isFinite(Number(m.target)) && Number(m.target) > 0 ? Number(m.target) : 1
  let current = Number(m.current)
  if (!Number.isFinite(current) || current < 0) current = 0
  if (current > target) current = target

  // 关联日程统计:某日程只要「曾完成过任意一天」即计入已完成
  let linkedTotal = 0
  let linkedDone = 0
  if (data !== null && typeof data === 'object' && Array.isArray(data.items)) {
    for (const it of data.items) {
      if (it === null || typeof it !== 'object' || it.goalId !== goal.id) continue
      linkedTotal += 1
      const rec = data.done && data.done[it.id]
      if (rec !== undefined && Object.keys(rec).length > 0) linkedDone += 1
    }
  }

  const todayStr = cleanDate(today) || localDateStr()
  let remainingDays = 0
  if (typeof goal.endDate === 'string' && DATE_RE.test(goal.endDate)) {
    remainingDays = Math.max(0, Math.round(
      (Date.parse(goal.endDate + 'T00:00:00Z') - Date.parse(todayStr + 'T00:00:00Z')) / 86400000
    ))
  }
  const derived = current === 0 && linkedTotal > 0
  const effCurrent = derived ? linkedDone : current
  const percent = Math.max(0, Math.min(100, Math.round((effCurrent / target) * 100)))

  return { current: effCurrent, target, percent, remainingDays, linkedTotal, linkedDone, derived }
}

/** 校验并规范化一条新增日程。 */
export function normalizeItem(args, now = Date.now(), today = localDateStr()) {
  const title = String(args.title === undefined ? '' : args.title).trim()
  if (title === '') throw new Error('日程标题不能为空')
  const recurring = args.recurring === 'daily' ? 'daily' : args.recurring === 'weekly' ? 'weekly' : 'once'
  let date = ''
  if (args.date !== undefined && args.date !== null && args.date !== '') {
    // 提供了日期就必须是真实日历日期,否则直接报错(与 updateItem 一致)
    date = parseDateStr(args.date)
    if (date === '') throw new Error('无效日期(需要真实的 YYYY-MM-DD): ' + args.date)
  }
  const currentDate = cleanDate(today) || localDateStr()
  if (recurring === 'once' && date === '') date = currentDate
  let weekdays = Array.isArray(args.weekdays)
    ? args.weekdays.map(Number).filter((n) => n >= 1 && n <= 7)
    : []
  if (recurring === 'weekly' && weekdays.length === 0) weekdays = [isoDay(currentDate)]
  const timeParsed = parseTimeFields(
    args.time,
    args.startTime !== undefined ? args.startTime : args.start_time,
    args.endTime !== undefined ? args.endTime : args.end_time
  )
  const quadrant = typeof args.quadrant === 'string' && ['q1', 'q2', 'q3', 'q4'].includes(args.quadrant) ? args.quadrant : 'q2'
  const carryOver = recurring === 'once' && (args.carryOver === true || args.carry_over === true)
  return {
    id: 'dt_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 8),
    title,
    recurring,
    date,
    weekdays,
    time: timeParsed.time,
    startTime: timeParsed.startTime,
    endTime: timeParsed.endTime,
    quadrant,
    goalId: pickGoalId(args),
    note: typeof args.note === 'string' ? args.note : '',
    linkedSessions: [],
    carryOver,
    rolloverDates: [],
    createdAt: now,
  }
}

/**
 * 日程存储:文件加载/原子保存/串行化变更 + 领域操作。
 */
export class ScheduleStore {
  constructor(opts = {}) {
    this.path = opts.path || DEFAULT_DATA_PATH
    this.legacyPath = opts.legacyPath !== undefined ? opts.legacyPath : LEGACY_DATA_PATH
    this.data = { items: [], done: {}, goals: [] }
    /**
     * 本进程显式删除过的扩展字段名。
     *
     * 为什么需要它:serializeForDisk 会让"磁盘上的未知字段"优先保留(issue #2),
     * 否则另一个进程写进来的字段会被抹掉。但这条规则和 docPatch 的 unset 直接冲突 ——
     * 删掉 tags 之后,写盘时又会从磁盘把 tags 搬回来,删除等于没生效。
     * 墓碑就是用来区分「我们没见过这个字段」和「我们明确删掉了这个字段」。
     * 它只代表"相对于最近一次读盘"的删除,所以每次真正读盘后归零。
     */
    this.removedKeys = new Set()
    this.loaded = false
    this.protectUnparsedFile = false
    this.writeChain = Promise.resolve()
  }

  async load() {
    if (this.loaded) return this.data
    // 墓碑是"相对最近一次读盘"的增量,一旦重新读盘就不再有效
    this.removedKeys = new Set()
    try {
      let source = null
      try {
        await fsp.access(this.path)
        source = this.path
      } catch {
        try {
          await fsp.access(this.legacyPath)
          source = this.legacyPath
        } catch {
          source = null
        }
      }
      if (source !== null) {
        const text = await fsp.readFile(source, 'utf8')
        let parsed = null
        try {
          parsed = JSON.parse(text)
        } catch (parseErr) {
          await this.backupCorrupt(source, text, parseErr)
          this.loaded = true
          return this.data
        }
        if (parsed !== null && typeof parsed === 'object' && Array.isArray(parsed.items)) {
          // 以**原文为基底**展开:任何本版本不认识的顶层字段都原样带在内存里,
          // 后续写盘时一并带走。绝不用白名单重新构造整个文档(issue #2)。
          this.data = {
            ...copySafeEntries(parsed),
            items: parsed.items
              .filter((item) => item !== null && typeof item === 'object')
              .map(normalizeStoredItem),
            done: parsed.done && typeof parsed.done === 'object' ? parsed.done : {},
            // 旧数据文件无 goals 字段 → 视为空数组(与既有迁移逻辑一致)
            goals: Array.isArray(parsed.goals)
              ? parsed.goals.filter((g) => g !== null && typeof g === 'object').map(normalizeStoredGoal)
              : [],
          }
          // 可观测性:一次性记清"这份文件是谁写的",并提示我们不认识的字段(它们会被保留而非丢弃)
          const unknownKeys = Object.keys(parsed).filter((k) => KNOWN_TOP_KEYS.indexOf(k) === -1)
          const writer = typeof parsed.writtenBy === 'string' ? parsed.writtenBy : '(未记录)'
          console.log(
            '[dsh-schedule] 数据文件 writer=' + writer
            + ' format=' + (parsed.version === undefined ? '?' : parsed.version)
            + ' items=' + this.data.items.length
            + ' goals=' + this.data.goals.length
            + (unknownKeys.length > 0 ? ' | 未知顶层字段(将原样保留): ' + unknownKeys.join(', ') : '')
          )
        } else {
          // 结构不对同样按损坏处理 —— 否则空数据会在下一次保存时覆盖原文件
          await this.backupCorrupt(source, text, new Error('数据文件结构不符合预期(items 不是数组)'))
          this.loaded = true
          return this.data
        }
        // 旧位置 → 新位置迁移(成功后删除旧文件,避免下次重复读旧数据)
        if (source === this.legacyPath) {
          try {
            await fsp.mkdir(join(this.path, '..'), { recursive: true })
            await fsp.writeFile(this.path, JSON.stringify(await this.serializeForDisk(), null, 2), 'utf8')
            await fsp.rm(this.legacyPath, { force: true })
          } catch (err) {
            console.error('[dsh-schedule] legacy data migration failed', err)
          }
        }
      }
    } catch (err) {
      console.error('[dsh-schedule] load failed, starting empty', err)
    }
    this.loaded = true
    return this.data
  }

  /**
   * 数据文件损坏时:先把原文备份到 <源文件>.corrupt-<时间戳>,再删除源文件,
   * 以空数据继续运行。这样后续保存永远不会覆盖丢失用户数据。
   * 注意按实际读取位置(source 可能是旧版迁移路径)处理,否则损坏的旧文件
   * 会在每次启动时被重复解析、重复备份且永远无法自愈。
   */
  async backupCorrupt(source, text, err) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = source + '.corrupt-' + stamp
    try {
      await fsp.writeFile(backup, text, 'utf8')
      await fsp.rm(source, { force: true })
      console.error('[dsh-schedule] 数据文件无法解析,原文已备份到 ' + backup + '; 以空数据启动', err && err.message)
    } catch (backupErr) {
      // 备份都失败时绝不覆盖原文件:标记保护,save() 直接跳过
      this.protectUnparsedFile = true
      console.error('[dsh-schedule] 数据文件无法解析且备份失败! 已暂停写盘以防数据丢失,请手动处理:', source, err && err.message, backupErr && backupErr.message)
    }
  }

  /**
   * 组装要落盘的完整文档 —— issue #2 的核心修复。
   *
   * 规则只有两条,好处是可预测:
   *   - 本版本**认识**的字段(items / done / goals / version / writtenBy)以内存为准;
   *   - 本版本**不认识**的顶层字段,一律取磁盘上的最新值填进输出。
   *
   * 为什么要读盘:Store 是"内存持有 + 全量覆写"模型,同机可能存在另一个进程
   * (旧版插件 / 手工编辑 / 云同步)往文件里塞了我们不认识的字段。不先读盘就直接
   * 覆盖,这些字段会被静默抹掉 —— 那正是被报告的数据丢失。
   *
   * 读不到 / 解析失败都不影响写盘:我们自己的数据仍然要落盘,只是带上不带未知字段。
   */
  async serializeForDisk() {
    const out = copySafeEntries(this.data)
    let disk = null
    try {
      const text = await fsp.readFile(this.path, 'utf8')
      const parsed = JSON.parse(text)
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) disk = parsed
    } catch (err) {
      disk = null
    }
    if (disk !== null) {
      const safe = copySafeEntries(disk)
      for (const k of Object.keys(safe)) {
        if (KNOWN_TOP_KEYS.indexOf(k) !== -1) continue
        // 本进程显式删除过的字段不许从磁盘复活,否则 unset 等于没生效
        if (this.removedKeys.has(k)) continue
        out[k] = safe[k]
      }
    }
    out.version = DATA_FORMAT_VERSION
    out.writtenBy = DATA_WRITER
    return out
  }

  async save() {
    if (this.protectUnparsedFile === true) {
      console.error('[dsh-schedule] 写盘已暂停(数据文件未解析且备份失败),本次变更仅保留在内存')
      return
    }
    await fsp.mkdir(join(this.path, '..'), { recursive: true })
    const tmp = this.path + '.tmp'
    const doc = await this.serializeForDisk()
    await fsp.writeFile(tmp, JSON.stringify(doc, null, 2), 'utf8')
    await fsp.rename(tmp, this.path)
  }

  /** 读取时也执行一次惰性顺延并持久化。 */
  reconcile(today = localDateStr()) {
    const run = this.writeChain.then(async () => {
      const d = await this.load()
      if (reconcileCarryOver(d, today)) {
        try {
          await this.save()
        } catch (err) {
          console.error('[dsh-schedule] carry-over save failed (kept in memory)', err)
        }
      }
      return d
    })
    this.writeChain = run.then(() => undefined, () => undefined)
    return run
  }

  /** 串行化变更:fn 同步修改 data,随后原子落盘;返回全量数据。 */
  mutate(fn, today = localDateStr()) {
    const run = this.writeChain.then(async () => {
      const d = await this.load()
      // 前后各检查一次:支持新增/修改后立即把过去日期顺延到今天。
      reconcileCarryOver(d, today)
      fn(d)
      reconcileCarryOver(d, today)
      try {
        await this.save()
      } catch (err) {
        console.error('[dsh-schedule] save failed (kept in memory)', err)
      }
      return { items: d.items, done: d.done, goals: d.goals }
    })
    this.writeChain = run.then(() => undefined, () => undefined)
    return run
  }

  /** 查询某天出现的日程(重复日程按日期展开),附带该日完成状态。 */
  async listForDate(dateStr, today = localDateStr()) {
    await this.reconcile(today)
    const d = await this.load()
    let date = ''
    if (dateStr === undefined || dateStr === null || dateStr === '') date = today
    else {
      date = parseDateStr(dateStr)
      if (date === '') throw new Error('无效日期(需要真实的 YYYY-MM-DD): ' + dateStr)
    }
    return d.items
      .filter((i) => matches(i, date))
      .map((i) => ({
        id: i.id,
        title: i.title,
        recurring: i.recurring,
        date: i.date,
        weekdays: i.weekdays,
        time: i.time,
        startTime: i.startTime,
        endTime: i.endTime,
        note: i.note,
        linkedSessions: i.linkedSessions,
        carryOver: i.carryOver === true,
        rolloverDates: i.rolloverDates,
        goalId: i.goalId === undefined ? null : i.goalId,
        done: !!(d.done[i.id] && d.done[i.id][date]),
      }))
  }

  /** 全量快照。 */
  async snapshot(today = localDateStr()) {
    await this.reconcile(today)
    const d = await this.load()
    return { items: d.items, done: d.done, goals: d.goals }
  }

  addItem(args, now = Date.now(), today = localDateStr()) {
    const item = normalizeItem(args, now, today)
    return this.mutate((d) => {
      d.items.push(item)
    }, today).then((result) => ({ item, items: result.items.length }))
  }

  updateItem(id, patch, today = localDateStr()) {
    return this.mutate((d) => {
      const item = d.items.find((i) => i.id === id)
      if (item === undefined) throw new Error('找不到该日程: ' + id)
      if (typeof patch.title === 'string') {
        const t = patch.title.trim()
        if (t === '') throw new Error('日程标题不能为空')
        item.title = t
      }
      if (typeof patch.date === 'string') {
        // 提供了日期就必须是真实日历日期 —— 静默清空会让 once 日程从此
        // 不再出现在任何一天,比直接报错糟糕得多。
        const d = parseDateStr(patch.date)
        if (d === '') throw new Error('无效日期(需要真实的 YYYY-MM-DD): ' + patch.date)
        item.date = d
      }
      if (patch.recurring === 'once' || patch.recurring === 'daily' || patch.recurring === 'weekly') {
        item.recurring = patch.recurring
      }
      if (Array.isArray(patch.weekdays)) {
        item.weekdays = patch.weekdays.map(Number).filter((n) => n >= 1 && n <= 7)
      }
      if (patch.quadrant !== undefined) {
        item.quadrant = ['q1', 'q2', 'q3', 'q4'].includes(patch.quadrant) ? patch.quadrant : 'q2'
      }
      if (patch.time !== undefined || patch.startTime !== undefined || patch.start_time !== undefined || patch.endTime !== undefined || patch.end_time !== undefined) {
        const timeParsed = parseTimeFields(
          patch.time !== undefined ? patch.time : item.time,
          patch.startTime !== undefined ? patch.startTime : (patch.start_time !== undefined ? patch.start_time : item.startTime),
          patch.endTime !== undefined ? patch.endTime : (patch.end_time !== undefined ? patch.end_time : item.endTime)
        )
        item.time = timeParsed.time
        item.startTime = timeParsed.startTime
        item.endTime = timeParsed.endTime
      }
      if (patch.goalId !== undefined || patch.goal_id !== undefined) {
        // 显式传 null / '' 表示解除归属
        const gid = patch.goalId !== undefined ? patch.goalId : patch.goal_id
        item.goalId = typeof gid === 'string' && gid.trim() !== '' ? gid.trim() : null
      }
      if (typeof patch.note === 'string') item.note = patch.note
      const carryArg = patch.carryOver !== undefined ? patch.carryOver : patch.carry_over
      if (carryArg !== undefined) item.carryOver = item.recurring === 'once' && carryArg === true
      else if (item.recurring !== 'once') item.carryOver = false
      if (!Array.isArray(item.rolloverDates)) item.rolloverDates = []
    }, today).then((result) => ({ ok: true, id, items: result.items.length }))
  }

  removeItem(id, today = localDateStr()) {
    return this.mutate((d) => {
      const idx = d.items.findIndex((i) => i.id === id)
      if (idx === -1) throw new Error('找不到该日程: ' + id)
      d.items.splice(idx, 1)
      delete d.done[id]
    }, today).then((result) => ({ ok: true, remaining: result.items.length }))
  }

  setDone(id, dateStr, done, today = localDateStr()) {
    let date = ''
    if (dateStr === undefined || dateStr === null || dateStr === '') date = today
    else {
      date = parseDateStr(dateStr)
      if (date === '') throw new Error('无效日期(需要真实的 YYYY-MM-DD): ' + dateStr)
    }
    return this.mutate((d) => {
      if (!d.items.some((i) => i.id === id)) throw new Error('找不到该日程: ' + id)
      if (d.done[id] === undefined) d.done[id] = {}
      if (done) d.done[id][date] = true
      else delete d.done[id][date]
    }, today).then((result) => {
      const item = result.items.find((i) => i.id === id)
      return { ok: true, id, date, done, title: item ? item.title : undefined }
    })
  }

  // ==================== 目标层(Goal)操作 ====================

  addGoal(args, now = Date.now(), today = localDateStr()) {
    const goal = normalizeGoal(args, now, today)
    return this.mutate((d) => {
      d.goals.push(goal)
    }, today).then((result) => ({ goal, goals: result.goals.length }))
  }

  updateGoal(id, patch, today = localDateStr()) {
    return this.mutate((d) => {
      const g = d.goals.find((x) => x.id === id)
      if (g === undefined) throw new Error('找不到该目标: ' + id)

      if (typeof patch.title === 'string') {
        const t = patch.title.trim()
        if (t === '') throw new Error('目标标题不能为空')
        g.title = t
      }
      if (GOAL_HORIZONS.includes(patch.horizon)) g.horizon = patch.horizon
      if (GOAL_STATUSES.includes(patch.status)) g.status = patch.status

      for (const key of ['startDate', 'endDate']) {
        if (typeof patch[key] === 'string' && patch[key] !== '') {
          const v = parseDateStr(patch[key])
          if (v === '') throw new Error('无效日期(需要真实的 YYYY-MM-DD): ' + patch[key])
          g[key] = v
        }
      }
      if (typeof g.startDate === 'string' && typeof g.endDate === 'string' &&
          g.startDate !== '' && g.endDate !== '' && g.endDate < g.startDate) {
        throw new Error('结束日期不能早于开始日期: ' + g.startDate + ' ~ ' + g.endDate)
      }

      if (patch.metric !== null && typeof patch.metric === 'object') {
        const pm = patch.metric
        if (GOAL_METRIC_TYPES.includes(pm.type)) g.metric.type = pm.type
        if (pm.target !== undefined) {
          const t = Number(pm.target)
          if (Number.isFinite(t) && t > 0) g.metric.target = t
        }
        if (g.metric.type === 'milestone') g.metric.target = 1
        if (pm.current !== undefined) {
          const cur = Number(pm.current)
          if (Number.isFinite(cur)) g.metric.current = Math.max(0, Math.min(g.metric.target, cur))
        }
        if (typeof pm.unit === 'string') g.metric.unit = pm.unit
      }
      // 允许直接平铺传 current / target(工具层更省事)
      if (patch.current !== undefined) {
        const cur = Number(patch.current)
        if (Number.isFinite(cur)) g.metric.current = Math.max(0, Math.min(g.metric.target, cur))
      }
      if (typeof patch.note === 'string') g.note = patch.note
      if (!Array.isArray(g.linkedSessions)) g.linkedSessions = []
    }, today).then((result) => ({ ok: true, id, goals: result.goals.length }))
  }

  /** 删除目标,并把归属它的日程解除关联(避免留下悬空 goalId)。 */
  removeGoal(id, today = localDateStr()) {
    return this.mutate((d) => {
      const idx = d.goals.findIndex((x) => x.id === id)
      if (idx === -1) throw new Error('找不到该目标: ' + id)
      d.goals.splice(idx, 1)
      for (const it of d.items) {
        if (it !== null && typeof it === 'object' && it.goalId === id) it.goalId = null
      }
    }, today).then((result) => {
      const unlinked = result.items.filter((i) => i.goalId !== null && i.goalId !== undefined).length
      return { ok: true, id, goals: result.goals.length, remainingLinked: unlinked }
    })
  }

  /** 把某个日程归属到目标(goalId 传 null / '' 表示解除)。 */
  linkGoal(id, goalId, today = localDateStr()) {
    const gid = goalId === undefined || goalId === null ? '' : String(goalId).trim()
    return this.mutate((d) => {
      const item = d.items.find((i) => i.id === id)
      if (item === undefined) throw new Error('找不到该日程: ' + id)
      if (gid !== '') {
        if (!d.goals.some((g) => g.id === gid)) throw new Error('找不到该目标: ' + gid)
        item.goalId = gid
      } else {
        item.goalId = null
      }
    }, today).then((result) => ({ ok: true, id, goalId: gid === '' ? null : gid }))
  }

  /** 目标列表(可按 status 过滤),附带进度与关联日程。 */
  async listGoals(status, today = localDateStr()) {
    await this.reconcile(today)
    const d = await this.load()
    const filter = GOAL_STATUSES.includes(status) ? status : null
    const items = filter === null ? d.goals : d.goals.filter((g) => g.status === filter)
    return items.map((g) => ({
      ...g,
      progress: goalProgress(g, d, today),
      items: d.items
        .filter((i) => i !== null && typeof i === 'object' && i.goalId === g.id)
        .map((i) => ({ id: i.id, title: i.title, date: i.date, recurring: i.recurring, quadrant: i.quadrant })),
    }))
  }

  // ==================== 给 AI 的内容修改接口 ====================

  /**
   * 把一条批量操作派发到对应的领域方法。
   *
   * 刻意**复用既有方法**而不是另写一套逻辑 —— 校验、规范化、顺延、
   * 归属检查全都只有一份实现,批量路径不可能和单条路径产生行为差异。
   */
  async applyOne(op, today = localDateStr()) {
    if (op === null || typeof op !== 'object' || typeof op.op !== 'string') {
      throw new Error('每条操作必须是形如 { op: "...", ... } 的对象')
    }
    const needId = (label) => {
      if (typeof op.id !== 'string' || op.id === '') throw new Error(label + ' 需要 id')
    }
    switch (op.op) {
      case 'add':
        return this.addItem(op, Date.now(), today)
      case 'update':
        needId('update')
        return this.updateItem(op.id, op, today)
      case 'set_done':
        needId('set_done')
        return this.setDone(op.id, op.date, op.done !== false, today)
      case 'remove':
        needId('remove')
        return this.removeItem(op.id, today)
      case 'link_session': {
        needId('link_session')
        const sid = op.session_id !== undefined ? op.session_id : op.sessionId
        return this.linkSession(op.id, sid, op.link !== false, today)
      }
      case 'goal_add':
        return this.addGoal(op, Date.now(), today)
      case 'goal_update':
        needId('goal_update')
        return this.updateGoal(op.id, op, today)
      case 'goal_remove':
        needId('goal_remove')
        return this.removeGoal(op.id, today)
      case 'link_goal': {
        needId('link_goal')
        const gid = op.goal_id !== undefined ? op.goal_id : op.goalId
        return this.linkGoal(op.id, gid === undefined ? '' : gid, today)
      }
      case 'doc_patch':
        return this.docPatch(op, today)
      default:
        throw new Error('不认识的操作: ' + op.op
          + '(可用: add / update / set_done / remove / link_session / goal_add / goal_update / goal_remove / link_goal / doc_patch)')
    }
  }

  /**
   * 批量修改。
   *
   * atomic = true(默认):任一项失败 → 磁盘与内存一起退回批次开始前,不留半成品。
   * atomic = false:逐条应用,失败的记进 failures 继续往下走,拿到部分结果。
   *
   * 回滚手法是"先存原文快照,失败就写回 + 丢弃内存副本(loaded=false 让下次重新读盘)"。
   * 这样不必把九个领域方法重构成可作用于 draft 的纯函数,却拿到同等的全或无语义。
   */
  async batch(ops, atomic = true, today = localDateStr()) {
    if (!Array.isArray(ops) || ops.length === 0) throw new Error('ops 必须是非空数组')
    if (ops.length > 200) throw new Error('一次最多 200 条操作(收到 ' + ops.length + ' 条)')

    let snapshot = null
    try {
      snapshot = await fsp.readFile(this.path, 'utf8')
    } catch (err) {
      snapshot = null
    }

    const results = []
    const failures = []

    for (let i = 0; i < ops.length; i++) {
      try {
        results.push({ index: i, op: ops[i] !== null && typeof ops[i] === 'object' ? ops[i].op : undefined, result: await this.applyOne(ops[i], today) })
      } catch (err) {
        const msg = err !== null && err !== undefined && err.message ? err.message : String(err)
        if (atomic) {
          if (snapshot !== null) {
            try {
              await fsp.writeFile(this.path, snapshot, 'utf8')
            } catch (writeErr) {
              console.error('[dsh-schedule] 批次回滚写盘失败,内存副本已丢弃', writeErr)
            }
            // 丢掉内存副本:下次访问会重新读盘,拿回回滚后的状态
            this.loaded = false
            this.data = { items: [], done: {}, goals: [] }
            this.removedKeys = new Set()
          }
          throw new Error('批次第 ' + (i + 1) + ' 项(' + String(ops[i] !== null && typeof ops[i] === 'object' ? ops[i].op : '?') + ')失败,已回滚整批: ' + msg)
        }
        failures.push({ index: i, op: ops[i] !== null && typeof ops[i] === 'object' ? ops[i].op : undefined, error: msg })
      }
    }

    return { ok: failures.length === 0, applied: results.length, failed: failures.length, results, failures }
  }

  /** 本版本已知字段之外的扩展字段名(即"别的版本 / 别的工具"写进来的自有内容)。 */
  async listExtensionKeys(today = localDateStr()) {
    await this.reconcile(today)
    const d = await this.load()
    return Object.keys(d).filter((k) => KNOWN_TOP_KEYS.indexOf(k) === -1 && k !== '__proto__')
  }

  /**
   * 读顶层字段。keys 省略时返回全部**扩展**字段。
   * 已知字段也允许读(便于 AI 一次看清全局),但返回的是内存里的权威副本。
   */
  async readDoc(keys, today = localDateStr()) {
    await this.reconcile(today)
    const d = await this.load()
    const extensionKeys = Object.keys(d).filter((k) => KNOWN_TOP_KEYS.indexOf(k) === -1 && k !== '__proto__')
    const wanted = Array.isArray(keys) && keys.length > 0 ? keys : extensionKeys
    const doc = {}
    for (const k of wanted) {
      if (typeof k !== 'string' || k === '' || k === '__proto__') continue
      if (Object.prototype.hasOwnProperty.call(d, k)) doc[k] = d[k]
    }
    return { version: DATA_FORMAT_VERSION, writtenBy: DATA_WRITER, extensionKeys, doc }
  }

  /**
   * 写**扩展**顶层字段 —— 这是 AI 往数据文件里放自有内容的正规通道
   * (标签、视图偏好、统计缓存、外部系统 id 映射……)。
   *
   * 已知字段(version / writtenBy / items / done / goals)一律拒绝:它们有各自的
   * 专用工具与完整校验,从这条自由通道写进去会绕过校验,并且和内存里的权威副本打架。
   */
  async docPatch(patch, today = localDateStr()) {
    // 刻意 async:参数校验失败要以 rejected promise 的形式抛出,
    // 与 batch / 其它领域方法一致 —— 调用方(工具层 / 批量层)统一用 await 处理。

    const src = patch !== null && typeof patch === 'object' ? patch : {}
    const set = src.set !== null && typeof src.set === 'object' && !Array.isArray(src.set) ? src.set : {}
    const unset = Array.isArray(src.unset) ? src.unset : []
    const setKeys = Object.keys(set).filter((k) => k !== '__proto__')

    for (const k of Object.keys(set)) {
      if (k === '__proto__') throw new Error('字段名 __proto__ 不被允许')
      if (KNOWN_TOP_KEYS.indexOf(k) !== -1) {
        throw new Error('字段 ' + k + ' 是本版本已知字段,请用它的专用工具修改,不能走 doc_patch')
      }
    }
    for (const k of unset) {
      if (typeof k !== 'string' || k === '') throw new Error('unset 的元素必须是非空字符串')
      if (k === '__proto__') throw new Error('字段名 __proto__ 不被允许')
      if (KNOWN_TOP_KEYS.indexOf(k) !== -1) throw new Error('字段 ' + k + ' 是已知字段,不能删除')
    }
    if (setKeys.length === 0 && unset.length === 0) throw new Error('需要提供 set 或 unset')

    return this.mutate((d) => {
      for (const k of setKeys) {
        d[k] = set[k]
        // 重新写入等于撤销之前的删除
        this.removedKeys.delete(k)
      }
      for (const k of unset) {
        delete d[k]
        this.removedKeys.add(k)
      }
    }, today).then(() => ({ ok: true, set: setKeys, unset }))
  }

  linkSession(id, sessionId, link = true, today = localDateStr()) {
    // 归一化为字符串:HTTP/工具层可能传数字或 null,统一成 '' 跳过/按串比较
    const sid = sessionId === undefined || sessionId === null ? '' : String(sessionId)
    return this.mutate((d) => {
      const item = d.items.find((i) => i.id === id)
      if (item === undefined) throw new Error('找不到该日程: ' + id)
      if (!Array.isArray(item.linkedSessions)) item.linkedSessions = []
      if (link) {
        // 重复关联为 no-op,保持原顺序
        if (sid !== '' && item.linkedSessions.indexOf(sid) === -1) {
          item.linkedSessions.push(sid)
        }
      } else {
        item.linkedSessions = item.linkedSessions.filter((s) => s !== sid)
      }
    }, today).then((result) => ({ ok: true, id, sessionId: sid, link }))
  }
}
