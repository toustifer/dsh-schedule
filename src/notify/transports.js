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
