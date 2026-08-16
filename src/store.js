/**
 * dsh-schedule — 存储核心(纯 Node 模块,可单元测试)。
 *
 * 数据模型:
 *   { items: ScheduleItem[], done: { [itemId]: { [YYYY-MM-DD]: true } } }
 *
 * - items: 日程定义(标题/重复规则/时间/备注/关联会话)
 * - done:  完成记录按 (日程ID, 日期) 永久累积 —— 历史永不删除,
 *          支撑周/月/季度/年度回顾统计。
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

/** 日期字符串 → ISO 星期几(1=周一 … 7=周日)。 */
export function isoDay(dateStr) {
  const parts = dateStr.split('-')
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  const j = d.getDay()
  return j === 0 ? 7 : j
}

/** 日程在某天是否出现。 */
export function matches(item, dateStr) {
  if (item.recurring === 'once') return item.date === dateStr
  if (item.recurring === 'daily') return true
  if (item.recurring === 'weekly') {
    const wd = Array.isArray(item.weekdays) ? item.weekdays : []
    return wd.indexOf(isoDay(dateStr)) !== -1
  }
  return false
}

function cleanDate(value) {
  return typeof value === 'string' && DATE_RE.test(value) ? value : ''
}

/** 校验并规范化一条新增日程。 */
export function normalizeItem(args, now = Date.now(), today = localDateStr()) {
  const title = String(args.title === undefined ? '' : args.title).trim()
  if (title === '') throw new Error('日程标题不能为空')
  const recurring = args.recurring === 'daily' ? 'daily' : args.recurring === 'weekly' ? 'weekly' : 'once'
  let date = cleanDate(args.date)
  if (recurring === 'once' && date === '') date = today
  let weekdays = Array.isArray(args.weekdays)
    ? args.weekdays.map(Number).filter((n) => n >= 1 && n <= 7)
    : []
  if (recurring === 'weekly' && weekdays.length === 0) weekdays = [isoDay(today)]
  const time = typeof args.time === 'string' && TIME_RE.test(args.time) ? args.time : ''
  return {
    id: 'dt_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 8),
    title,
    recurring,
    date,
    weekdays,
    time,
    note: typeof args.note === 'string' ? args.note : '',
    linkedSessions: [],
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
        const parsed = JSON.parse(text)
        if (parsed !== null && typeof parsed === 'object' && Array.isArray(parsed.items)) {
          this.data = {
            items: parsed.items,
            done: parsed.done && typeof parsed.done === 'object' ? parsed.done : {},
          }
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

  async save() {
    await fsp.mkdir(join(this.path, '..'), { recursive: true })
    const tmp = this.path + '.tmp'
    await fsp.writeFile(tmp, JSON.stringify({ version: 1, items: this.data.items, done: this.data.done }, null, 2), 'utf8')
    await fsp.rename(tmp, this.path)
  }

  /** 串行化变更:fn 同步修改 data,随后原子落盘;返回全量数据。 */
  mutate(fn) {
    const run = this.writeChain.then(async () => {
      const d = await this.load()
      fn(d)
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
    const d = await this.load()
    const date = cleanDate(dateStr) || today
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
        done: !!(d.done[i.id] && d.done[i.id][date]),
      }))
  }

  /** 全量快照。 */
  async snapshot() {
    const d = await this.load()
    return { items: d.items, done: d.done }
  }

  addItem(args, now = Date.now(), today = localDateStr()) {
    const item = normalizeItem(args, now, today)
    return this.mutate((d) => {
      d.items.push(item)
    }).then((result) => ({ item, items: result.items.length }))
  }

  updateItem(id, patch) {
    return this.mutate((d) => {
      const item = d.items.find((i) => i.id === id)
      if (item === undefined) throw new Error('找不到该日程: ' + id)
      if (typeof patch.title === 'string') {
        const t = patch.title.trim()
        if (t === '') throw new Error('日程标题不能为空')
        item.title = t
      }
      if (typeof patch.date === 'string') item.date = cleanDate(patch.date)
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
    }).then((result) => ({ ok: true, id, items: result.items.length }))
  }

  removeItem(id) {
    return this.mutate((d) => {
      const idx = d.items.findIndex((i) => i.id === id)
      if (idx === -1) throw new Error('找不到该日程: ' + id)
      d.items.splice(idx, 1)
      delete d.done[id]
    }).then((result) => ({ ok: true, remaining: result.items.length }))
  }

  setDone(id, dateStr, done, today = localDateStr()) {
    const date = cleanDate(dateStr) || today
    return this.mutate((d) => {
      if (!d.items.some((i) => i.id === id)) throw new Error('找不到该日程: ' + id)
      if (d.done[id] === undefined) d.done[id] = {}
      if (done) d.done[id][date] = true
      else delete d.done[id][date]
    }).then((result) => {
      const item = result.items.find((i) => i.id === id)
      return { ok: true, id, date, done, title: item ? item.title : undefined }
    })
  }

  linkSession(id, sessionId, link = true) {
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
    }).then((result) => ({ ok: true, id, sessionId, link }))
  }
}
