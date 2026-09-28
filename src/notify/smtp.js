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

/** RFC 5321 点填充:行首的 '.' 必须重复一次。 */
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
    let idx = buf.indexOf(CRLF)
    while (idx >= 0) {
      const line = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      if (/^\d{3}-/.test(line)) {
        pending.push(line)
      } else {
        deliver(pending.length > 0 ? pending.join('\n') + '\n' + line : line)
        pending = []
      }
      idx = buf.indexOf(CRLF)
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
