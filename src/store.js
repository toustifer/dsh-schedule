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
  item.carryOver = item.carryOver === true
  return item
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
  const time = typeof args.time === 'string' && TIME_RE.test(args.time) ? args.time : ''
  const carryOver = recurring === 'once' && (args.carryOver === true || args.carry_over === true)
  return {
    id: 'dt_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 8),
    title,
    recurring,
    date,
    weekdays,
    time,
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
    this.data = { items: [], done: {} }
    this.loaded = false
    this.protectUnparsedFile = false
    this.writeChain = Promise.resolve()
  }

  async load() {
    if (this.loaded) return this.data
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
          await this.backupCorrupt(text, parseErr)
          this.loaded = true
          return this.data
        }
        if (parsed !== null && typeof parsed === 'object' && Array.isArray(parsed.items)) {
          this.data = {
            items: parsed.items
              .filter((item) => item !== null && typeof item === 'object')
              .map(normalizeStoredItem),
            done: parsed.done && typeof parsed.done === 'object' ? parsed.done : {},
          }
        } else {
          // 结构不对同样按损坏处理 —— 否则空数据会在下一次保存时覆盖原文件
          await this.backupCorrupt(text, new Error('数据文件结构不符合预期(items 不是数组)'))
          this.loaded = true
          return this.data
        }
        // 旧位置 → 新位置迁移(成功后删除旧文件,避免下次重复读旧数据)
        if (source === this.legacyPath) {
          try {
            await fsp.mkdir(join(this.path, '..'), { recursive: true })
            await fsp.writeFile(this.path, JSON.stringify({ version: 1, items: this.data.items, done: this.data.done }, null, 2), 'utf8')
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
   * 数据文件损坏时:先把原文备份到 <path>.corrupt-<时间戳>,再删除原文件,
   * 以空数据继续运行。这样后续保存永远不会覆盖丢失用户数据。
   */
  async backupCorrupt(text, err) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = this.path + '.corrupt-' + stamp
    try {
      await fsp.writeFile(backup, text, 'utf8')
      await fsp.rm(this.path, { force: true })
      console.error('[dsh-schedule] 数据文件无法解析,原文已备份到 ' + backup + '; 以空数据启动', err && err.message)
    } catch (backupErr) {
      // 备份都失败时绝不覆盖原文件:标记保护,save() 直接跳过
      this.protectUnparsedFile = true
      console.error('[dsh-schedule] 数据文件无法解析且备份失败! 已暂停写盘以防数据丢失,请手动处理:', this.path, err && err.message, backupErr && backupErr.message)
    }
  }

  async save() {
    if (this.protectUnparsedFile === true) {
      console.error('[dsh-schedule] 写盘已暂停(数据文件未解析且备份失败),本次变更仅保留在内存')
      return
    }
    await fsp.mkdir(join(this.path, '..'), { recursive: true })
    const tmp = this.path + '.tmp'
    await fsp.writeFile(tmp, JSON.stringify({ version: 1, items: this.data.items, done: this.data.done }, null, 2), 'utf8')
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
      return { items: d.items, done: d.done }
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
        note: i.note,
        linkedSessions: i.linkedSessions,
        carryOver: i.carryOver === true,
        rolloverDates: i.rolloverDates,
        done: !!(d.done[i.id] && d.done[i.id][date]),
      }))
  }

  /** 全量快照。 */
  async snapshot(today = localDateStr()) {
    await this.reconcile(today)
    const d = await this.load()
    return { items: d.items, done: d.done }
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
      if (typeof patch.time === 'string') {
        item.time = TIME_RE.test(patch.time) ? patch.time : ''
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

  linkSession(id, sessionId, link = true, today = localDateStr()) {
    return this.mutate((d) => {
      const item = d.items.find((i) => i.id === id)
      if (item === undefined) throw new Error('找不到该日程: ' + id)
      if (!Array.isArray(item.linkedSessions)) item.linkedSessions = []
      if (link) {
        // 重复关联为 no-op,保持原顺序
        if (sessionId !== '' && item.linkedSessions.indexOf(sessionId) === -1) {
          item.linkedSessions.push(sessionId)
        }
      } else {
        item.linkedSessions = item.linkedSessions.filter((s) => s !== sessionId)
      }
    }, today).then((result) => ({ ok: true, id, sessionId, link }))
  }
}
