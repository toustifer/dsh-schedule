/**
 * dsh-schedule — DeepSeek Harness 本地日程插件(Host 半身)。
 *
 * 提供:
 *   1. 六个模型工具 dailytask_add / dailytask_list / dailytask_set_done /
 *      dailytask_update / dailytask_delete / dailytask_link_session
 *      —— 在任意对话里说"帮我记一条日程"即可由 AI 直接操作同一份数据。
 *   2. /api/dailytask/* HTTP API —— 浏览器面板的数据面。
 *
 * 数据长期保存在 ~/.dsh/dsh-schedule-data.json(首次启动自动迁移旧文件)。
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { ScheduleStore } from './store.js'

export const name = 'dsh-schedule'
export const inject = ['tools']

/** 统一工具输出:JSON 值 + 文本渲染。 */
function makeTool(name, description, parameters, execute) {
  return defineTool({
    name,
    description,
    parameters,
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    execute,
  })
}

export function apply(ctx) {
  const store = new ScheduleStore()

  // ---- 模型工具 ----
  ctx.tools.register(makeTool(
    'dailytask_add',
    '添加一条日程。recurring 为 once(一次性,需要 date)时只出现在那一天;daily(每天)每天都出现;weekly(每周)在 weekdays 指定的星期几出现(1=周一 … 7=周日)。time 为可选时间(HH:MM)。carry_over 仅对 once 生效:开启后若到期日未完成,下次查看时自动顺延到当天(历史日期保留)。',
    {
      title: { type: 'string', required: true, description: '日程标题' },
      recurring: { type: 'string', description: '重复方式: once(默认) / daily / weekly' },
      date: { type: 'string', description: '日期 YYYY-MM-DD(once 时必填,缺省今天;weekly 可忽略)' },
      weekdays: { type: 'array', description: 'weekly 时生效:星期几数组,1=周一 … 7=周日,缺省今天' },
      time: { type: 'string', description: '可选时间 HH:MM' },
      note: { type: 'string', description: '可选备注' },
      carry_over: { type: 'boolean', description: '仅 once 生效:未完成自动顺延到当天(默认 false)' },
    },
    async (args) => store.addItem(args === null ? {} : args),
  ))

  ctx.tools.register(makeTool(
    'dailytask_list',
    '列出日程。不带参数返回全部日程及完成记录;带 date(YYYY-MM-DD)时只返回出现在那一天的日程(重复日程按日期展开),并附带该日是否完成。',
    {
      date: { type: 'string', description: '可选:查询某一天(YYYY-MM-DD),缺省返回全部' },
    },
    async (args) => {
      if (args !== null && typeof args === 'object' && typeof args.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
        const items = await store.listForDate(args.date)
        return { date: args.date, count: items.length, items }
      }
      const snap = await store.snapshot()
      return { count: snap.items.length, items: snap.items, done: snap.done }
    },
  ))

  ctx.tools.register(makeTool(
    'dailytask_set_done',
    '标记某条日程在某天完成或取消完成。date 缺省为今天。重复日程只影响指定日期。',
    {
      id: { type: 'string', required: true, description: '日程 id' },
      date: { type: 'string', description: '日期 YYYY-MM-DD,缺省今天' },
      done: { type: 'boolean', description: 'true 完成(默认), false 取消完成' },
    },
    async (args) => {
      if (args === null || typeof args !== 'object') throw new Error('参数无效')
      return store.setDone(String(args.id), args.date, args.done !== false)
    },
  ))

  ctx.tools.register(makeTool(
    'dailytask_update',
    '修改一条日程。只更新提供的字段: title / date / recurring / weekdays / time / note / carry_over。',
    {
      id: { type: 'string', required: true, description: '日程 id' },
      title: { type: 'string', description: '新标题' },
      date: { type: 'string', description: '新日期 YYYY-MM-DD' },
      recurring: { type: 'string', description: 'once / daily / weekly' },
      weekdays: { type: 'array', description: 'weekly 的星期几 1-7' },
      time: { type: 'string', description: '时间 HH:MM' },
      note: { type: 'string', description: '备注' },
      carry_over: { type: 'boolean', description: '仅 once 生效:未完成自动顺延(默认 false)' },
    },
    async (args) => {
      if (args === null || typeof args !== 'object') throw new Error('参数无效')
      return store.updateItem(String(args.id), args)
    },
  ))

  ctx.tools.register(makeTool(
    'dailytask_delete',
    '删除一条日程及其完成记录。',
    {
      id: { type: 'string', required: true, description: '日程 id' },
    },
    async (args) => {
      if (args === null || typeof args !== 'object') throw new Error('参数无效')
      return store.removeItem(String(args.id))
    },
  ))

  ctx.tools.register(makeTool(
    'dailytask_link_session',
    '把当前会话关联到一条日程(或取消关联)。关联后可在日程面板点击会话跳转回该会话。link 缺省为 true。',
    {
      id: { type: 'string', required: true, description: '日程 id' },
      link: { type: 'boolean', description: 'true 关联(默认) / false 取消关联' },
    },
    async (args, exec) => {
      if (exec === null || exec === undefined || exec.agent === undefined) throw new Error('需要会话上下文')
      if (args === null || typeof args !== 'object') throw new Error('参数无效')
      return store.linkSession(String(args.id), exec.agent.id, args.link !== false)
    },
  ))

  // ---- HTTP API(浏览器面板数据面;webServer 可选,无 UI 场景不阻塞) ----
  ctx.inject(['webServer'], (serverCtx) => {
    const json = (res, body, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    const readBody = (req) => new Promise((resolve, reject) => {
      let data = ''
      req.on('data', (c) => { data += c })
      req.on('end', () => {
        try { resolve(data ? JSON.parse(data) : {}) } catch (e) { reject(e) }
      })
    })

    const route = (path, handler) => {
      serverCtx.webServer.register({
        kind: 'exact',
        path: '/api/dailytask' + path,
        handler: (req, res) => Promise.resolve(handler(req, res)).catch((e) => {
          json(res, { error: e instanceof Error ? e.message : String(e) }, 500)
        }),
      })
    }

    route('/get', async (_req, res) => {
      json(res, await store.snapshot())
    })

    route('/add', async (req, res) => {
      const body = await readBody(req)
      await store.addItem(body)
      json(res, await store.snapshot())
    })

    route('/update', async (req, res) => {
      const body = await readBody(req)
      if (typeof body.id !== 'string') throw new Error('参数无效')
      await store.updateItem(body.id, body)
      json(res, await store.snapshot())
    })

    route('/remove', async (req, res) => {
      const body = await readBody(req)
      if (typeof body.id !== 'string') throw new Error('参数无效')
      await store.removeItem(body.id)
      json(res, await store.snapshot())
    })

    route('/set-done', async (req, res) => {
      const body = await readBody(req)
      if (typeof body.id !== 'string') throw new Error('参数无效')
      await store.setDone(body.id, body.date, body.done !== false)
      json(res, await store.snapshot())
    })

    route('/link-session', async (req, res) => {
      const body = await readBody(req)
      if (typeof body.id !== 'string') throw new Error('参数无效')
      await store.linkSession(body.id, body.sessionId, body.link !== false)
      json(res, await store.snapshot())
    })
  })

  console.log('[dsh-schedule] host ready')
}
