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
      url: '',
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
  if (cfg === null || typeof cfg !== 'object') return false
  if (cfg.enabled !== true) return false
  if (!Array.isArray(cfg.recipients) || cfg.recipients.length === 0) return false
  const t = cfg.transport
  if (t === null || typeof t !== 'object') return false
  if (t.kind === 'smtp') {
    return t.host !== '' && t.user !== '' && t.pass !== ''
  }
  if (t.kind === 'cfmail' || t.kind === 'webhook') {
    return typeof t.url === 'string' && t.url !== ''
  }
  return false
}
