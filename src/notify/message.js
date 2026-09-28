/**
 * 把待发提醒渲染成邮件主题与正文 —— 纯函数,纯文本,不做 HTML。
 * 提醒的职责是让人看见,不是好看。
 */
const FOOTER = '——\ndsh-schedule 自动提醒'

export function renderReminder(entries, ctx) {
  const list = Array.isArray(entries) ? entries : []
  if (list.length === 0) return null

  const leadMinutes = ctx.leadMinutes
  const todayLine = '今天 ' + ctx.dateStr + ' ' + ctx.weekdayName

  let subject
  const lines = []

  if (list.length === 1) {
    const e = list[0]
    const title = e.item.title === undefined ? '' : String(e.item.title)
    subject = '⏰ ' + leadMinutes + ' 分钟后：' + title
    lines.push(title)
    lines.push(e.hhmm + ' 开始')
  } else {
    subject = '⏰ ' + leadMinutes + ' 分钟内有 ' + list.length + ' 条日程'
    for (const e of list) {
      lines.push('· ' + e.hhmm + '  ' + (e.item.title === undefined ? '' : String(e.item.title)))
    }
  }

  lines.push('')
  lines.push(todayLine)
  lines.push(FOOTER)

  return { subject, text: lines.join('\n') }
}
