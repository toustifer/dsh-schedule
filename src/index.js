/**
 * dsh-schedule — DeepSeek Harness 本地日程插件(Host 半身)。
 *
 * 提供:
 *   1. 十四个模型工具:
 *      日程层 —— dailytask_add / dailytask_list / dailytask_set_done /
 *                dailytask_update / dailytask_delete / dailytask_link_session
 *      目标层 —— dailytask_goal_add / dailytask_goal_list / dailytask_goal_update /
 *                dailytask_goal_delete / dailytask_link_goal
 *      通用   —— dailytask_batch(批量) / dailytask_doc_get / dailytask_doc_patch
 *                (后两个读写「扩展顶层字段」,即插件自留内容)
 *      —— 在任意对话里说"帮我记一条日程"或"帮我立个四级目标",即可由 AI
 *      直接操作同一份数据。
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
    '添加一条日程。recurring 为 once(一次性,需要 date)时只出现在那一天;daily(每天)每天都出现;weekly(每周)在 weekdays 指定的星期几出现(1=周一 … 7=周日)。time 可为可选时间点(HH:MM)或时间块(HH:MM-HH:MM);也可单独传 start_time 与 end_time。quadrant 为四象限(q1重要紧急/q2重要不紧急/q3紧急不重要/q4不重要不紧急)。carry_over 仅对 once 生效:开启后若到期日未完成,下次查看时自动顺延到当天(历史日期保留)。goal_id 为可选:若这条日程明显服务于某个长期目标(如备考、项目、训练计划),先用 dailytask_goal_list 查到目标 id 再一并传入,归属后该目标才能统计到推进进度。',
    {
      title: { type: 'string', required: true, description: '日程标题' },
      recurring: { type: 'string', description: '重复方式: once(默认) / daily / weekly' },
      date: { type: 'string', description: '日期 YYYY-MM-DD(once 时必填,缺省今天;weekly 可忽略)' },
      weekdays: { type: 'array', description: 'weekly 时生效:星期几数组,1=周一 … 7=周日,缺省今天' },
      time: { type: 'string', description: '可选时间 HH:MM 或区间 HH:MM-HH:MM' },
      start_time: { type: 'string', description: '可选起始时间 HH:MM' },
      end_time: { type: 'string', description: '可选结束时间 HH:MM' },
      quadrant: { type: 'string', description: '四象限优先级: q1(重要紧急)/q2(重要不紧急)/q3(紧急不重要)/q4(不重要不紧急)' },
      goal_id: { type: 'string', description: '可选:归属的长期目标 id(用 dailytask_goal_list 查)' },
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
    '修改一条日程。只更新提供的字段: title / date / recurring / weekdays / time / start_time / end_time / quadrant / goal_id / note / carry_over。goal_id 传目标 id 表示归属到该长期目标,传空串解除归属。',
    {
      id: { type: 'string', required: true, description: '日程 id' },
      title: { type: 'string', description: '新标题' },
      date: { type: 'string', description: '新日期 YYYY-MM-DD' },
      recurring: { type: 'string', description: 'once / daily / weekly' },
      weekdays: { type: 'array', description: 'weekly 的星期几 1-7' },
      time: { type: 'string', description: '时间 HH:MM 或区间 HH:MM-HH:MM' },
      start_time: { type: 'string', description: '起始时间 HH:MM' },
      end_time: { type: 'string', description: '结束时间 HH:MM' },
      quadrant: { type: 'string', description: '四象限优先级: q1(重要紧急)/q2(重要不紧急)/q3(紧急不重要)/q4(不重要不紧急)' },
      goal_id: { type: 'string', description: '归属的长期目标 id;传空串表示解除归属' },
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

  // ---- 目标层(Goal)工具 ----

  /** 工具入参是 snake_case,store 用 camelCase —— 这里统一映射一次。 */
  function goalArgsFrom(a) {
    const pick = (snake, camel) => (a[snake] !== undefined ? a[snake] : a[camel])
    const out = {
      title: a.title,
      horizon: a.horizon,
      startDate: pick('start_date', 'startDate'),
      endDate: pick('end_date', 'endDate'),
      status: a.status,
      note: a.note,
    }
    const mt = pick('metric_type', 'metricType')
    const mtg = pick('metric_target', 'metricTarget')
    const mc = pick('metric_current', 'metricCurrent')
    const mu = pick('metric_unit', 'metricUnit')
    if (mt !== undefined || mtg !== undefined || mc !== undefined || mu !== undefined) {
      out.metric = {}
      if (mt !== undefined) out.metric.type = mt
      if (mtg !== undefined) out.metric.target = mtg
      if (mc !== undefined) out.metric.current = mc
      if (mu !== undefined) out.metric.unit = mu
    } else if (a.metric !== null && typeof a.metric === 'object') {
      out.metric = a.metric
    }
    return out
  }

  ctx.tools.register(makeTool(
    'dailytask_goal_add',
    '新建一个长期目标(跨月 / 学期 / 学年)。horizon: term(学期)/year(学年)/custom(自定义,默认)。metric_type: score(数值,如分数)/count(计数,如套数)/percent(百分比)/milestone(里程碑,达成即 100%)。end_date 缺省时按 horizon 自动推导(学期 +140 天 / 学年 +280 天 / 自定义 +90 天)。',
    {
      title: { type: 'string', required: true, description: '目标标题,如「大学英语四级 600 分」' },
      horizon: { type: 'string', description: 'term(学期) / year(学年) / custom(自定义,默认)' },
      start_date: { type: 'string', description: '开始日期 YYYY-MM-DD,缺省今天' },
      end_date: { type: 'string', description: '结束日期 YYYY-MM-DD,缺省按 horizon 推导' },
      metric_type: { type: 'string', description: 'score / count / percent(默认) / milestone' },
      metric_target: { type: 'number', description: '目标值,如 600;milestone 强制为 1' },
      metric_current: { type: 'number', description: '当前进度值,缺省 0' },
      metric_unit: { type: 'string', description: '单位,如「分」「套」;percent 缺省 %' },
      note: { type: 'string', description: '备注,如「每周 2 套真题 + 每天 40 分钟听力」' },
    },
    async (args) => {
      if (args === null || typeof args !== 'object') throw new Error('参数无效')
      return store.addGoal(goalArgsFrom(args))
    },
  ))

  ctx.tools.register(makeTool(
    'dailytask_goal_list',
    '列出长期目标,每条附带进度(percent / current / target / remainingDays)与关联的日程清单。可按 status 过滤。',
    {
      status: { type: 'string', description: '可选过滤: active(进行中) / done(已达成) / dropped(已放弃)' },
    },
    async (args) => {
      const status = args !== null && typeof args === 'object' ? args.status : undefined
      return { goals: await store.listGoals(status) }
    },
  ))

  ctx.tools.register(makeTool(
    'dailytask_goal_update',
    '更新一个长期目标:进度(metric_current)、状态、时间跨度、备注等。只更新提供的字段;metric_current 会被夹在 0~metric_target 之间。',
    {
      id: { type: 'string', required: true, description: '目标 id' },
      title: { type: 'string', description: '新标题' },
      horizon: { type: 'string', description: 'term / year / custom' },
      status: { type: 'string', description: 'active / done / dropped' },
      start_date: { type: 'string', description: '新开始日期 YYYY-MM-DD' },
      end_date: { type: 'string', description: '新结束日期 YYYY-MM-DD' },
      metric_type: { type: 'string', description: 'score / count / percent / milestone' },
      metric_target: { type: 'number', description: '新目标值' },
      metric_current: { type: 'number', description: '新当前进度值(自动夹在 0~target)' },
      metric_unit: { type: 'string', description: '新单位' },
      note: { type: 'string', description: '新备注' },
    },
    async (args) => {
      if (args === null || typeof args !== 'object') throw new Error('参数无效')
      if (typeof args.id !== 'string' || args.id === '') throw new Error('缺少目标 id')
      const patch = goalArgsFrom(args)
      if (typeof args.title === 'string') patch.title = args.title
      return store.updateGoal(String(args.id), patch)
    },
  ))

  ctx.tools.register(makeTool(
    'dailytask_goal_delete',
    '删除一个长期目标,并自动把归属它的日程解除关联(日程本身不会被删除)。',
    {
      id: { type: 'string', required: true, description: '目标 id' },
    },
    async (args) => {
      if (args === null || typeof args !== 'object') throw new Error('参数无效')
      if (typeof args.id !== 'string' || args.id === '') throw new Error('缺少目标 id')
      return store.removeGoal(String(args.id))
    },
  ))

  ctx.tools.register(makeTool(
    'dailytask_link_goal',
    '把一个日程归属到某个长期目标(或解除归属)。goal_id 传空串或省略表示解除归属。',
    {
      id: { type: 'string', required: true, description: '日程 id' },
      goal_id: { type: 'string', description: '目标 id;传空串表示解除归属' },
    },
    async (args) => {
      if (args === null || typeof args !== 'object') throw new Error('参数无效')
      if (typeof args.id !== 'string' || args.id === '') throw new Error('缺少日程 id')
      const gid = args.goal_id !== undefined ? args.goal_id : args.goalId
      return store.linkGoal(String(args.id), gid === undefined ? '' : gid)
    },
  ))

  // ---- 通用内容修改接口 ----

  ctx.tools.register(makeTool(
    'dailytask_batch',
    '批量修改日程与目标:一次调用里按顺序执行多条操作,不必逐条来回。ops 是操作数组,每项形如 { op: "...", ... }。'
    + '可用 op:add(新建日程,字段同 dailytask_add) / update(改日程,需 id) / set_done(打勾,需 id,可带 date) / '
    + 'remove(删日程,需 id) / link_session(需 id) / goal_add(新建目标,字段同 dailytask_goal_add) / '
    + 'goal_update(需 id) / goal_remove(需 id) / link_goal(需 id,可带 goal_id) / doc_patch(改扩展字段)。'
    + 'atomic 默认 true:任一项失败则整批回滚(磁盘与内存一起),不留半成品;设为 false 则跳过失败项、返回部分结果。'
    + '需要 id 的操作请先用 dailytask_list / dailytask_goal_list 取。',
    {
      ops: { type: 'array', required: true, description: '操作数组,每项含 op 与对应参数;一次最多 200 条' },
      atomic: { type: 'boolean', description: '默认 true:任一失败即整批回滚;false:跳过失败项继续' },
    },
    async (args) => {
      if (args === null || typeof args !== 'object') throw new Error('参数无效')
      if (!Array.isArray(args.ops)) throw new Error('ops 必须是数组')
      return store.batch(args.ops, args.atomic !== false)
    },
  ))

  ctx.tools.register(makeTool(
    'dailytask_doc_get',
    '读取数据文件的顶层字段。keys 省略时返回全部「扩展字段」—— 即本插件内置字段之外、由其它版本或其它工具写入的自有内容(插件设置、标签、统计缓存等)。'
    + '内置字段(items / done / goals / version / writtenBy)也可以读,便于一次看清全局。',
    {
      keys: { type: 'array', description: '要读取的顶层字段名数组;省略则返回全部扩展字段' },
    },
    async (args) => {
      const keys = args !== null && typeof args === 'object' ? args.keys : undefined
      return store.readDoc(keys)
    },
  ))

  ctx.tools.register(makeTool(
    'dailytask_doc_patch',
    '写入数据文件的**扩展**顶层字段 —— AI 往这里放自有内容的正规通道(比如给日程体系加一套标签、存视图偏好、缓存统计结果)。'
    + 'set 是要写入的字段(浅合并,同名整体替换),unset 是要删除的字段名数组。'
    + '注意:内置字段 items / done / goals / version / writtenBy 一律拒绝,它们有各自的专用工具与完整校验。写入的扩展字段会被存储层原样保留。',
    {
      set: { type: 'object', description: '要写入的扩展字段,如 {"tags": ["学期","冲刺"]}' },
      unset: { type: 'array', description: '要删除的扩展字段名数组' },
    },
    async (args) => {
      if (args === null || typeof args !== 'object') throw new Error('参数无效')
      return store.docPatch(args)
    },
  ))

  // ---- HTTP API(浏览器面板数据面;webServer 可选,无 UI 场景不阻塞) ----
  ctx.inject(['webServer'], (serverCtx) => {
    const json = (res, body, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    // 面板/工具的请求都是小 JSON,1MiB 上限足够并防住异常客户端拖垮内存
    const MAX_BODY_BYTES = 1024 * 1024
    const readBody = (req) => new Promise((resolve, reject) => {
      let data = ''
      let size = 0
      req.on('data', (c) => {
        size += c.length
        if (size > MAX_BODY_BYTES) {
          const err = new Error('请求体过大(上限 1MiB)')
          err.statusCode = 413
          reject(err)
          req.destroy()
          return
        }
        data += c
      })
      req.on('end', () => {
        try { resolve(data ? JSON.parse(data) : {}) } catch (e) { reject(e) }
      })
    })

    const route = (path, handler) => {
      serverCtx.webServer.register({
        kind: 'exact',
        path: '/api/dailytask' + path,
        handler: (req, res) => Promise.resolve(handler(req, res)).catch((e) => {
          const status = e !== null && typeof e === 'object' && e.statusCode ? e.statusCode : 500
          json(res, { error: e instanceof Error ? e.message : String(e) }, status)
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

    route('/setDone', async (req, res) => {
        const body = await readBody(req)
        if (typeof body.id !== 'string') throw new Error('参数无效')
        await store.setDone(body.id, body.date, body.done !== false)
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

    // ---- 目标层数据面 ----
    route('/goal-add', async (req, res) => {
      const body = await readBody(req)
      await store.addGoal(body)
      json(res, await store.snapshot())
    })

    route('/goal-list', async (_req, res) => {
      json(res, { goals: await store.listGoals() })
    })

    route('/goal-update', async (req, res) => {
      const body = await readBody(req)
      if (typeof body.id !== 'string') throw new Error('参数无效')
      await store.updateGoal(body.id, body)
      json(res, await store.snapshot())
    })

    route('/goal-remove', async (req, res) => {
      const body = await readBody(req)
      if (typeof body.id !== 'string') throw new Error('参数无效')
      await store.removeGoal(body.id)
      json(res, await store.snapshot())
    })

    route('/link-goal', async (req, res) => {
      const body = await readBody(req)
      if (typeof body.id !== 'string') throw new Error('参数无效')
      const gid = body.goalId !== undefined ? body.goalId : body.goal_id
      await store.linkGoal(body.id, gid === undefined ? '' : gid)
      json(res, await store.snapshot())
    })

    // ---- 通用内容修改接口 ----
    route('/batch', async (req, res) => {
      const body = await readBody(req)
      if (!Array.isArray(body.ops)) throw new Error('ops 必须是数组')
      json(res, await store.batch(body.ops, body.atomic !== false))
    })

    route('/doc-get', async (req, res) => {
      const body = await readBody(req)
      json(res, await store.readDoc(body !== null && typeof body === 'object' ? body.keys : undefined))
    })

    route('/doc-patch', async (req, res) => {
      const body = await readBody(req)
      json(res, await store.docPatch(body))
    })
  })

  console.log('[dsh-schedule] host ready')
}
