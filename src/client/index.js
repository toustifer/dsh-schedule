/**
 * dsh-schedule — 浏览器半身(CommonJS 形式,由 scripts/build.mjs 包装为
 * DSH client-modules C6 bundle;纯逻辑辅助在 logic.cjs 中先行内联)。
 *
 * 表面:
 *   1. 会话标题栏右侧"日程"文字按钮(conversation.session.header.actions)
 *   2. 日程抽屉面板(今天 / 本周 / 历史月历+统计),全高停靠右侧(shell.overlay)
 *      —— 行内 ✎ 编辑、点击标题进详情(完整备注/统计/顺延历史)、
 *      添加表单折叠为「+ 添加」按钮
 *   3. 侧边栏底部「日程」入口(sidebar.footer.action)
 *   4. 输入框右侧 🔗 关联按钮(conversation.input.right)
 *
 * 数据面:/api/dailytask/*。依赖 React(模块表 externals),无构建期依赖。
 */

const React = require('react')

const CSS_EXTRA = '.dsh-sched-panel{top:0;right:0;bottom:0;left:auto;width:420px;max-width:100vw;max-height:none;border-radius:0;border:none;border-left:1px solid rgba(127,127,127,.28);box-shadow:-12px 0 32px rgba(0,0,0,.18);}.dsh-sched-backbtn{border:none;background:transparent;border-radius:8px;padding:2px 8px;font-size:15px;line-height:1;cursor:pointer;color:inherit;}.dsh-sched-backbtn:hover{background:rgba(127,127,127,.15);}.dsh-sched-addtoggle{border:1px solid rgba(9,105,218,.5);background:rgba(9,105,218,.08);color:#0969da;border-radius:8px;padding:3px 10px;font-size:12px;line-height:1.4;cursor:pointer;white-space:nowrap;}.dsh-sched-addtoggle:hover{background:rgba(9,105,218,.16);}.dsh-sched-addtoggle.active{background:#0969da;border-color:#0969da;color:#fff;}.dsh-sched-textarea{width:100%;min-height:56px;resize:vertical;background:rgba(127,127,127,.08);border:1px solid rgba(127,127,127,.3);border-radius:8px;padding:6px 9px;font-size:13px;color:inherit;font-family:inherit;box-sizing:border-box;}.dsh-sched-textarea:focus{outline:none;border-color:rgba(9,105,218,.6);}.dsh-sched-editbtn{flex:none;border:none;background:transparent;color:rgba(127,127,127,.75);font-size:13px;cursor:pointer;border-radius:6px;padding:0 4px;}.dsh-sched-editbtn:hover{color:#0969da;background:rgba(9,105,218,.08);}.dsh-sched-detail{padding:12px 14px 14px;display:flex;flex-direction:column;gap:10px;}.dsh-sched-detail-title{font-size:16px;font-weight:600;line-height:1.5;word-break:break-word;}.dsh-sched-detail-pills{display:flex;gap:5px;flex-wrap:wrap;align-items:center;}.dsh-sched-section{border-top:1px solid rgba(127,127,127,.16);padding-top:8px;display:flex;flex-direction:column;gap:6px;}.dsh-sched-section-label{font-size:11px;font-weight:600;color:rgba(127,127,127,.85);}.dsh-sched-note-full{white-space:pre-wrap;word-break:break-word;line-height:1.6;font-size:13px;background:rgba(127,127,127,.07);border-radius:8px;padding:8px 10px;}.dsh-sched-note-empty{font-size:12px;color:rgba(127,127,127,.7);}.dsh-sched-actions{margin-top:auto;display:flex;gap:6px;flex-wrap:wrap;padding-top:10px;border-top:1px solid rgba(127,127,127,.16);}.dsh-sched-abtn{display:inline-flex;align-items:center;gap:4px;border:1px solid rgba(127,127,127,.35);background:transparent;border-radius:8px;padding:5px 12px;font-size:12px;line-height:1.4;cursor:pointer;color:inherit;}.dsh-sched-abtn:hover{background:rgba(127,127,127,.1);}.dsh-sched-abtn.primary{background:#0969da;border-color:#0969da;color:#fff;}.dsh-sched-abtn.primary:hover{background:#0a5bb8;}.dsh-sched-abtn.danger{color:#d1242f;border-color:rgba(209,36,47,.5);}.dsh-sched-abtn.danger:hover{background:rgba(209,36,47,.08);}.dsh-sched-abtn.danger.confirm{background:#d1242f;border-color:#d1242f;color:#fff;}.dsh-sched-chip.static{cursor:default;}.dsh-sched-footbtn{display:inline-flex;align-items:center;gap:6px;background:transparent;border:none;border-radius:8px;padding:6px 10px;font-size:13px;line-height:1.2;cursor:pointer;color:inherit;}.dsh-sched-footbtn:hover{background:rgba(127,127,127,.14);}.dsh-sched-footbtn.active{background:rgba(127,127,127,.22);}.dsh-sched-footico{font-size:14px;line-height:1;}@media (prefers-color-scheme: dark){.dsh-sched-panel{border-left-color:rgba(255,255,255,.14);box-shadow:-12px 0 32px rgba(0,0,0,.5);}.dsh-sched-addtoggle{color:#6cb0f5;border-color:rgba(86,155,235,.55);background:rgba(86,155,235,.14);}.dsh-sched-addtoggle.active{background:#2f7be0;border-color:#2f7be0;color:#fff;}.dsh-sched-section,.dsh-sched-actions{border-top-color:rgba(255,255,255,.12);}.dsh-sched-note-full{background:rgba(255,255,255,.06);}.dsh-sched-abtn{border-color:rgba(255,255,255,.28);}.dsh-sched-abtn.primary{background:#2f7be0;border-color:#2f7be0;}.dsh-sched-editbtn:hover{color:#6cb0f5;background:rgba(86,155,235,.12);}.dsh-sched-textarea:focus{border-color:rgba(86,155,235,.6);}}'

function injectStyles(css) {
  const el = document.createElement('style')
  el.textContent = css
  document.head.appendChild(el)
  return () => { el.remove() }
}

function apply(ctx) {
  const slots = ctx.get('slots')
  if (slots === undefined) return
  const sessionsSvc = ctx.get('sessions')
  const timerSvc = ctx.get('timer')
  ctx.effect(() => {
    const a = injectStyles(CSS)
    const b = injectStyles(CSS_EXTRA)
    return () => { a(); b() }
  })

  async function api(method, args) {
    const res = await fetch('/api/dailytask/' + method, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(args || {}),
    })
    if (!res.ok) {
      let msg = 'HTTP ' + res.status
      try {
        const j = await res.json()
        if (j !== null && typeof j === 'object' && j.error) msg = j.error
      } catch (e) { /* keep default */ }
      throw new Error(msg)
    }
    return res.json()
  }

  const store = {
    open: false,
    linker: false,
    data: null,
    subs: [],
    emit() { const list = store.subs.slice(); for (let i = 0; i < list.length; i++) { try { list[i]() } catch (e) {} } },
    subscribe(fn) { store.subs.push(fn); return () => { store.subs = store.subs.filter((f) => f !== fn) } },
    setOpen(v) { store.open = v; store.linker = false; store.emit() },
    setLinker(v) { store.linker = v; store.open = false; store.emit() },
    setData(d) { store.data = d; store.emit() },
  }

  async function refresh() {
    try {
      store.setData(await api('get'))
    } catch (e) {
      console.error('[dsh-schedule] refresh failed', e)
    }
  }

  async function call(method, args) {
    const r = await api(method, args)
    store.setData(r)
    return r
  }

  function useStore(getter) {
    const [value, setValue] = React.useState(getter)
    React.useEffect(() => store.subscribe(() => setValue(getter())), [])
    return value
  }

  function titleOf(sessionsState, id) {
    if (sessionsState !== null && sessionsState !== undefined && sessionsState.byId !== undefined) {
      const row = sessionsState.byId[id]
      if (row !== undefined) return row.displayTitle || row.title || id
    }
    return id
  }

  function openSession(id) {
    if (sessionsSvc !== undefined) {
      try { sessionsSvc.open(id) } catch (e) { console.error('[dsh-schedule] open session failed', e) }
    }
  }

  // ---- 入口按钮 ----
  function ScheduleTrigger() {
    const open = useStore(() => store.open)
    return React.createElement('button', {
      className: 'dsh-sched-trigger' + (open ? ' active' : ''),
      title: '日程',
      onClick: () => {
        if (store.data === null) refresh()
        store.setOpen(!open)
      },
    }, '日程')
  }

  function ScheduleLinkButton() {
    const linker = useStore(() => store.linker)
    return React.createElement('button', {
      className: 'dsh-sched-linkbtn' + (linker ? ' active' : ''),
      title: '把当前会话关联到日程',
      onClick: () => {
        if (store.data === null) refresh()
        store.setLinker(!linker)
      },
    }, React.createElement('span', null, '🔗'))
  }

  // 侧边栏底部入口:展开时 图标+文字,折叠 rail 时仅图标。
  function SidebarFootButton(props) {
    const open = useStore(() => store.open)
    const wide = !!(props !== null && props !== undefined && props.wide)
    return React.createElement('button', {
      className: 'dsh-sched-footbtn' + (open ? ' active' : ''),
      title: '日程',
      onClick: () => {
        if (store.data === null) refresh()
        store.setOpen(!open)
      },
    },
      React.createElement('span', { className: 'dsh-sched-footico' }, '📅'),
      wide ? React.createElement('span', null, '日程') : null,
    )
  }

  // ---- 行 ----
  function ScheduleRow(props) {
    const { item, dateStr, done, currentSessionId, sessionsState, onMutate, onOpenDetail, onOpenEdit } = props
    const [confirmDel, setConfirmDel] = React.useState(false)
    React.useEffect(() => {
      if (!confirmDel) return undefined
      if (timerSvc !== undefined) return timerSvc.timeout(() => setConfirmDel(false), 3000)
      return undefined
    }, [confirmDel])
    const links = Array.isArray(item.linkedSessions) ? item.linkedSessions : []
    const linkedHere = links.indexOf(currentSessionId) !== -1
    const chips = []
    for (let i = 0; i < links.length; i++) {
      const sid = links[i]
      chips.push(React.createElement('span', {
        key: sid, className: 'dsh-sched-chip', title: '打开会话: ' + sid,
        onClick: () => openSession(sid),
      }, titleOf(sessionsState, sid)))
    }
    const meta = []
    if (item.time) meta.push(React.createElement('span', { key: 't', className: 'dsh-sched-pill' }, item.time))
    const rl = recurringLabel(item)
    if (rl) meta.push(React.createElement('span', { key: 'r', className: 'dsh-sched-pill' }, rl))
    if (item.carryOver && item.recurring === 'once') {
      meta.push(React.createElement('span', {
        key: 'co', className: 'dsh-sched-pill', title: '未完成时自动顺延到第二天',
      }, '顺延'))
    }
    if (item.note) meta.push(React.createElement('span', { key: 'n', className: 'dsh-sched-note' }, item.note))
    const titleCls = 'dsh-sched-title' + (done ? ' done' : '') + (links.length > 0 ? ' linked' : '')
    return React.createElement('div', { className: 'dsh-sched-row' },
      React.createElement('button', {
        className: 'dsh-sched-circle' + (done ? ' done' : ''),
        title: done ? '取消完成' : '标记完成',
        onClick: () => onMutate('set-done', { id: item.id, date: dateStr, done: !done }),
      }, done ? '✓' : ''),
      React.createElement('div', { className: 'dsh-sched-main' },
        React.createElement('div', {
          className: titleCls,
          title: '查看详情',
          onClick: () => onOpenDetail(item.id),
        }, item.title),
        meta.length > 0 || chips.length > 0 ? React.createElement('div', { className: 'dsh-sched-meta' },
          meta.length > 0 ? React.createElement('span', { style: { display: 'contents' } }, meta) : null,
          chips.length > 0 ? React.createElement('span', { className: 'dsh-sched-chips' }, chips) : null,
        ) : null,
      ),
      React.createElement('button', {
        className: 'dsh-sched-editbtn',
        title: '编辑日程',
        onClick: () => onOpenEdit(item.id),
      }, '✎'),
      React.createElement('button', {
        className: 'dsh-sched-link' + (linkedHere ? ' on' : ''),
        title: linkedHere ? '取消关联当前会话' : '把当前会话关联到此日程',
        onClick: () => onMutate('link-session', { id: item.id, sessionId: currentSessionId, link: !linkedHere }),
      }, linkedHere ? '×' : '+'),
      React.createElement('button', {
        className: 'dsh-sched-del' + (confirmDel ? ' confirm' : ''),
        title: '删除日程',
        onClick: () => {
          if (confirmDel) { setConfirmDel(false); onMutate('remove', { id: item.id }) }
          else setConfirmDel(true)
        },
      }, confirmDel ? '确认?' : '✕'),
    )
  }

  function renderWeekdayPicker(wd, onToggle) {
    const btns = []
    for (let i = 1; i <= 7; i++) {
      btns.push(React.createElement('button', {
        key: i,
        className: 'dsh-sched-wd' + (wd.indexOf(i) !== -1 ? ' on' : ''),
        onClick: () => onToggle(i),
      }, String(i)))
    }
    return React.createElement('span', { className: 'dsh-sched-weekdays' }, btns)
  }

  // ---- 添加表单(默认折叠,由头部「+ 添加」展开)----
  function AddForm(props) {
    const { onMutate, onCancel } = props
    const [title, setTitle] = React.useState('')
    const [date, setDate] = React.useState('')
    const [recurring, setRecurring] = React.useState('once')
    const [weekdays, setWeekdays] = React.useState([])
    const [time, setTime] = React.useState('')
    const [note, setNote] = React.useState('')
    const [carryOver, setCarryOver] = React.useState(false)
    function toggleWd(n) {
      setWeekdays(weekdays.indexOf(n) === -1 ? weekdays.concat([n]).sort() : weekdays.filter((x) => x !== n))
    }
    async function add() {
      const t = title.trim()
      if (t === '') return
      await onMutate('add', {
        title: t,
        recurring,
        date: date || undefined,
        weekdays: recurring === 'weekly' ? weekdays.slice() : undefined,
        time: time || undefined,
        note: note || undefined,
        carryOver: recurring === 'once' ? carryOver : undefined,
      })
      setTitle(''); setDate(''); setRecurring('once'); setWeekdays([]); setTime(''); setNote(''); setCarryOver(false)
      onCancel()
    }
    const opts = []
    if (recurring === 'once') {
      opts.push(React.createElement('input', {
        key: 'date', type: 'date', className: 'dsh-sched-input', style: { flex: 'none', width: 138 },
        value: date, onChange: (e) => setDate(e.target.value),
      }))
    }
    opts.push(React.createElement('select', {
      key: 'rec', className: 'dsh-sched-input', style: { flex: 'none' },
      value: recurring, onChange: (e) => setRecurring(e.target.value),
    },
      React.createElement('option', { value: 'once' }, '一次性'),
      React.createElement('option', { value: 'daily' }, '每天'),
      React.createElement('option', { value: 'weekly' }, '每周'),
    ))
    if (recurring === 'weekly') opts.push(React.createElement('span', { key: 'wd' }, renderWeekdayPicker(weekdays, toggleWd)))
    opts.push(React.createElement('input', {
      key: 'time', type: 'time', className: 'dsh-sched-input', style: { flex: 'none', width: 104 },
      value: time, onChange: (e) => setTime(e.target.value),
    }))
    if (recurring === 'once') {
      opts.push(React.createElement('label', {
        key: 'carry', style: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' },
      },
        React.createElement('input', {
          type: 'checkbox', checked: carryOver,
          onChange: (e) => setCarryOver(e.target.checked),
        }),
        '未完成自动顺延',
      ))
    }
    return React.createElement('div', { className: 'dsh-sched-add' },
      React.createElement('div', { className: 'dsh-sched-add-row' },
        React.createElement('input', {
          className: 'dsh-sched-input', placeholder: '日程名称,如:写周报', value: title,
          onChange: (e) => setTitle(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Enter') add() },
        }),
        React.createElement('button', { className: 'dsh-sched-addbtn', onClick: add }, '添加'),
      ),
      React.createElement('div', { className: 'dsh-sched-add-opts' }, opts),
      React.createElement('textarea', {
        className: 'dsh-sched-textarea', placeholder: '备注(可选,支持换行)', value: note,
        onChange: (e) => setNote(e.target.value),
      }),
      React.createElement('div', { className: 'dsh-sched-add-opts', style: { justifyContent: 'flex-end' } },
        React.createElement('button', { className: 'dsh-sched-tab', onClick: onCancel }, '收起'),
      ),
    )
  }

  // ---- 详情视图 ----
  function DetailView(props) {
    const { data, item, currentSessionId, sessionsState, onMutate, onBack, onEdit } = props
    const [confirmDel, setConfirmDel] = React.useState(false)
    React.useEffect(() => {
      if (!confirmDel) return undefined
      if (timerSvc !== undefined) return timerSvc.timeout(() => setConfirmDel(false), 3000)
      return undefined
    }, [confirmDel])
    const today = todayStr()
    const links = Array.isArray(item.linkedSessions) ? item.linkedSessions : []
    const linkedHere = links.indexOf(currentSessionId) !== -1
    const doneMap = data !== null && data.done && data.done[item.id] ? data.done[item.id] : {}
    const doneDates = Object.keys(doneMap).filter((d) => doneMap[d]).sort()
    const lastDone = doneDates.length > 0 ? doneDates[doneDates.length - 1] : ''
    const relDate = item.recurring === 'once' ? item.date : today
    const doneToday = !!doneMap[relDate]
    const rollovers = Array.isArray(item.rolloverDates) ? item.rolloverDates.slice().sort() : []
    const pills = []
    const rl = recurringLabel(item)
    pills.push(React.createElement('span', { key: 'r', className: 'dsh-sched-pill' },
      rl || '一次性' + (item.recurring === 'once' && item.date ? ' · ' + item.date : '')))
    if (item.recurring === 'once' && rl) pills.push(React.createElement('span', { key: 'd', className: 'dsh-sched-pill' }, item.date))
    if (item.time) pills.push(React.createElement('span', { key: 't', className: 'dsh-sched-pill' }, item.time))
    if (item.carryOver && item.recurring === 'once') pills.push(React.createElement('span', { key: 'co', className: 'dsh-sched-pill' }, '未完成自动顺延'))
    const chips = []
    for (let i = 0; i < links.length; i++) {
      const sid = links[i]
      chips.push(React.createElement('span', {
        key: sid, className: 'dsh-sched-chip', title: '打开会话: ' + sid,
        onClick: () => openSession(sid),
      }, titleOf(sessionsState, sid)))
    }
    const roChips = []
    for (let i = 0; i < rollovers.length; i++) {
      roChips.push(React.createElement('span', { key: rollovers[i], className: 'dsh-sched-chip static' }, rollovers[i]))
    }
    return React.createElement('div', { className: 'dsh-sched-detail' },
      React.createElement('div', { className: 'dsh-sched-detail-title' }, item.title),
      React.createElement('div', { className: 'dsh-sched-detail-pills' }, pills),
      React.createElement('div', { className: 'dsh-sched-section' },
        React.createElement('div', { className: 'dsh-sched-section-label' }, '备注'),
        item.note
          ? React.createElement('div', { className: 'dsh-sched-note-full' }, item.note)
          : React.createElement('div', { className: 'dsh-sched-note-empty' }, '无备注'),
      ),
      React.createElement('div', { className: 'dsh-sched-section' },
        React.createElement('div', { className: 'dsh-sched-section-label' }, '关联会话'),
        chips.length > 0 ? React.createElement('span', { className: 'dsh-sched-chips' }, chips) : React.createElement('div', { className: 'dsh-sched-note-empty' }, '尚未关联会话'),
        currentSessionId ? React.createElement('div', null,
          React.createElement('button', {
            className: 'dsh-sched-abtn' + (linkedHere ? ' danger' : ''),
            onClick: () => onMutate('link-session', { id: item.id, sessionId: currentSessionId, link: !linkedHere }),
          }, linkedHere ? '取消关联当前会话' : '关联当前会话'),
        ) : null,
      ),
      rollovers.length > 0 ? React.createElement('div', { className: 'dsh-sched-section' },
        React.createElement('div', { className: 'dsh-sched-section-label' }, '顺延历史(共 ' + rollovers.length + ' 天未完成)'),
        React.createElement('span', { className: 'dsh-sched-chips' }, roChips),
      ) : null,
      React.createElement('div', { className: 'dsh-sched-section' },
        React.createElement('div', { className: 'dsh-sched-section-label' }, '完成记录'),
        React.createElement('div', { className: 'dsh-sched-note-empty' },
          doneDates.length > 0
            ? '累计完成 ' + doneDates.length + ' 次' + (lastDone ? ' · 最近 ' + lastDone : '')
            : '还没有完成过',
        ),
      ),
      React.createElement('div', { className: 'dsh-sched-actions' },
        React.createElement('button', { className: 'dsh-sched-abtn primary', onClick: onEdit }, '✎ 编辑'),
        React.createElement('button', {
          className: 'dsh-sched-abtn' + (doneToday ? '' : ' primary'),
          style: doneToday ? {} : { display: 'none' },
          onClick: () => onMutate('set-done', { id: item.id, date: relDate, done: false }),
        }, '取消今日完成'),
        !doneToday ? React.createElement('button', {
          className: 'dsh-sched-abtn',
          onClick: () => onMutate('set-done', { id: item.id, date: relDate, done: true }),
        }, '✓ 标记完成') : null,
        React.createElement('button', {
          className: 'dsh-sched-abtn danger' + (confirmDel ? ' confirm' : ''),
          style: confirmDel ? {} : { marginLeft: 'auto' },
          onClick: () => {
            if (confirmDel) { setConfirmDel(false); onMutate('remove', { id: item.id }); onBack() }
            else setConfirmDel(true)
          },
        }, confirmDel ? '确认删除?' : '删除'),
      ),
    )
  }

  // ---- 编辑表单 ----
  function EditForm(props) {
    const { item, onMutate, onCancel } = props
    const [title, setTitle] = React.useState(item.title || '')
    const [date, setDate] = React.useState(item.recurring === 'once' ? (item.date || '') : '')
    const [recurring, setRecurring] = React.useState(item.recurring || 'once')
    const [weekdays, setWeekdays] = React.useState(Array.isArray(item.weekdays) ? item.weekdays.slice().sort() : [])
    const [time, setTime] = React.useState(item.time || '')
    const [note, setNote] = React.useState(item.note || '')
    const [carryOver, setCarryOver] = React.useState(item.carryOver === true)
    function toggleWd(n) {
      setWeekdays(weekdays.indexOf(n) === -1 ? weekdays.concat([n]).sort() : weekdays.filter((x) => x !== n))
    }
    async function save() {
      const t = title.trim()
      if (t === '') return
      const payload = {
        id: item.id,
        title: t,
        recurring,
        weekdays: recurring === 'weekly' ? weekdays.slice() : undefined,
        time: time || undefined,
        note,
        carryOver: recurring === 'once' ? carryOver : false,
      }
      if (recurring === 'once') payload.date = date || todayStr()
      await onMutate('update', payload)
      onCancel()
    }
    const opts = []
    if (recurring === 'once') {
      opts.push(React.createElement('input', {
        key: 'date', type: 'date', className: 'dsh-sched-input', style: { flex: 'none', width: 138 },
        value: date, onChange: (e) => setDate(e.target.value),
      }))
    }
    opts.push(React.createElement('select', {
      key: 'rec', className: 'dsh-sched-input', style: { flex: 'none' },
      value: recurring, onChange: (e) => setRecurring(e.target.value),
    },
      React.createElement('option', { value: 'once' }, '一次性'),
      React.createElement('option', { value: 'daily' }, '每天'),
      React.createElement('option', { value: 'weekly' }, '每周'),
    ))
    if (recurring === 'weekly') opts.push(React.createElement('span', { key: 'wd' }, renderWeekdayPicker(weekdays, toggleWd)))
    opts.push(React.createElement('input', {
      key: 'time', type: 'time', className: 'dsh-sched-input', style: { flex: 'none', width: 104 },
      value: time, onChange: (e) => setTime(e.target.value),
    }))
    if (recurring === 'once') {
      opts.push(React.createElement('label', {
        key: 'carry', style: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' },
      },
        React.createElement('input', {
          type: 'checkbox', checked: carryOver,
          onChange: (e) => setCarryOver(e.target.checked),
        }),
        '未完成自动顺延',
      ))
    }
    return React.createElement('div', { className: 'dsh-sched-add' },
      React.createElement('div', { className: 'dsh-sched-add-row' },
        React.createElement('input', {
          className: 'dsh-sched-input', value: title,
          onChange: (e) => setTitle(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Enter') save() },
        }),
        React.createElement('button', { className: 'dsh-sched-addbtn', onClick: save }, '保存'),
      ),
      React.createElement('div', { className: 'dsh-sched-add-opts' }, opts),
      React.createElement('textarea', {
        className: 'dsh-sched-textarea', placeholder: '备注(支持换行)', value: note,
        onChange: (e) => setNote(e.target.value),
      }),
      React.createElement('div', { className: 'dsh-sched-add-opts', style: { justifyContent: 'flex-end' } },
        React.createElement('button', { className: 'dsh-sched-tab', onClick: onCancel }, '取消'),
      ),
    )
  }

  function HistoryView(props) {
    const { data, currentSessionId, sessionsState, onMutate, onOpenDetail, onOpenEdit } = props
    const today = todayStr()
    const [year, setYear] = React.useState(Number(today.slice(0, 4)))
    const [month, setMonth] = React.useState(Number(today.slice(5, 7)))
    const [selected, setSelected] = React.useState(today)
    const monday = mondayOf(today)
    const weekDone = completedBetween(data, monday, today)
    const monthDone = completedBetween(data, today.slice(0, 7) + '-01', today)
    const yearDone = completedBetween(data, today.slice(0, 4) + '-01-01', today)
    const totalDone = data === null ? 0 : completedBetween(data, '0000-01-01', '9999-12-31')
    const streak = streakOf(data, today)
    const first = new Date(year, month - 1, 1)
    const startIso = isoDay(fmt(first))
    const daysInMonth = new Date(year, month, 0).getDate()
    const cells = []
    for (let i = 1; i < startIso; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(year + '-' + pad(month) + '-' + pad(d))
    while (cells.length % 7 !== 0) cells.push(null)
    const calEls = []
    const heads = []
    for (let i = 0; i < 7; i++) heads.push(React.createElement('div', { key: 'h' + i, className: 'dsh-sched-calhead' }, WEEKDAY_NAMES[i]))
    for (let i = 0; i < cells.length; i++) {
      const ds = cells[i]
      if (ds === null) {
        calEls.push(React.createElement('div', { key: 'e' + i, className: 'dsh-sched-cald empty' }))
      } else {
        const rows = rowsFor(data, ds)
        const doneCnt = rows.filter((r) => r.done).length
        const rolloverCnt = rows.filter((r) => r.rollover).length
        const isToday = ds === today
        const isSel = ds === selected
        let sub = ''
        if (rows.length > 0) sub = doneCnt === rows.length ? '✓' + doneCnt : doneCnt + '/' + rows.length
        if (rolloverCnt > 0) sub += (sub === '' ? '' : ' ') + '顺' + rolloverCnt
        calEls.push(React.createElement('div', {
          key: ds,
          className: 'dsh-sched-cald' + (isToday ? ' today' : '') + (isSel ? ' sel' : ''),
          title: ds + (rows.length > 0 ? ' · ' + doneCnt + '/' + rows.length + ' 完成' : ' · 无日程'),
          onClick: () => setSelected(ds),
        },
          React.createElement('div', { className: 'd' }, String(Number(ds.slice(8, 10)))),
          sub !== '' ? React.createElement('div', { className: 's' + (doneCnt === rows.length ? ' doneall' : '') }, sub) : null,
        ))
      }
    }
    const selRows = rowsFor(data, selected)
    const selEls = []
    for (let i = 0; i < selRows.length; i++) {
      selEls.push(React.createElement(ScheduleRow, {
        key: selRows[i].item.id, item: selRows[i].item, dateStr: selected, done: selRows[i].done,
        currentSessionId: currentSessionId, sessionsState: sessionsState, onMutate: onMutate,
        onOpenDetail: onOpenDetail, onOpenEdit: onOpenEdit,
      }))
    }
    function shift(delta) {
      let m = month + delta
      let y = year
      if (m < 1) { m = 12; y-- }
      if (m > 12) { m = 1; y++ }
      setYear(y)
      setMonth(m)
    }
    const selLabel = Number(selected.slice(5, 7)) + '月' + Number(selected.slice(8, 10)) + '日 · ' + WEEKDAY_NAMES[isoDay(selected) - 1]
    return React.createElement('div', null,
      React.createElement('div', { className: 'dsh-sched-stats' },
        React.createElement('div', { className: 'dsh-sched-stat' },
          React.createElement('div', { className: 'v' }, String(weekDone)),
          React.createElement('div', { className: 'k' }, '本周完成'),
        ),
        React.createElement('div', { className: 'dsh-sched-stat' },
          React.createElement('div', { className: 'v' }, String(monthDone)),
          React.createElement('div', { className: 'k' }, '本月完成'),
        ),
        React.createElement('div', { className: 'dsh-sched-stat' },
          React.createElement('div', { className: 'v' }, String(yearDone)),
          React.createElement('div', { className: 'k' }, '本年完成'),
        ),
        React.createElement('div', { className: 'dsh-sched-stat' },
          React.createElement('div', { className: 'v' }, String(streak)),
          React.createElement('div', { className: 'k' }, '连续完成天'),
        ),
      ),
      React.createElement('div', { className: 'dsh-sched-calnav' },
        React.createElement('button', { onClick: () => shift(-1) }, '◀'),
        React.createElement('div', { className: 't' }, year + '年 ' + month + '月'),
        React.createElement('button', { onClick: () => shift(1) }, '▶'),
      ),
      React.createElement('div', { className: 'dsh-sched-cal' }, heads.concat(calEls)),
      React.createElement('div', { className: 'dsh-sched-histhead' + (selected === today ? ' today' : '') }, selLabel + ' · 累计完成 ' + totalDone + ' 项'),
      selEls.length === 0 ? React.createElement('div', { className: 'dsh-sched-empty' }, '这一天没有日程') : selEls,
    )
  }

  function SchedulePanel(props) {
    const open = useStore(() => store.open)
    const data = useStore(() => store.data)
    const [view, setView] = React.useState('today')
    const [doneCollapsed, setDoneCollapsed] = React.useState(false)
    const [mode, setMode] = React.useState({ type: 'list' })
    const [adding, setAdding] = React.useState(false)
    const sessionsState = props.useSessions((s) => s)
    // 打开期间每 30 秒拉一次数据:其他会话里的 agent 工具改了日程也能看到;
    // timerSvc.interval 返回 disposer,关闭面板/组件卸载时自动清理。
    React.useEffect(() => {
      if (!open) return undefined
      refresh()
      if (timerSvc === undefined || typeof timerSvc.interval !== 'function') return undefined
      return timerSvc.interval(() => { refresh() }, 30000)
    }, [open])
    if (!open) return null
    const currentSessionId = sessionsState !== null && sessionsState !== undefined ? sessionsState.current : undefined
    async function onMutate(method, args) {
      try { await call(method, args) } catch (e) { console.error('[dsh-schedule] mutate failed', e) }
    }
    function openDetail(id) { setAdding(false); setMode({ type: 'detail', id }) }
    function openEdit(id) { setAdding(false); setMode({ type: 'edit', id }) }
    function backToList() { setMode({ type: 'list' }) }

    // 详情/编辑目标若已被删除(agent 侧改动),回落到列表。
    const itemOf = (id) => data !== null ? data.items.find((i) => i.id === id) : undefined
    let m = mode
    if (m.type !== 'list' && itemOf(m.id) === undefined) m = { type: 'list' }

    const today = todayStr()
    let body = null
    if (m.type === 'detail') {
      body = React.createElement(DetailView, {
        data: data, item: itemOf(m.id), currentSessionId: currentSessionId, sessionsState: sessionsState,
        onMutate: onMutate, onBack: backToList, onEdit: () => setMode({ type: 'edit', id: m.id }),
      })
    } else if (m.type === 'edit') {
      body = React.createElement(EditForm, {
        item: itemOf(m.id), onMutate: onMutate,
        onCancel: () => setMode({ type: 'detail', id: m.id }),
      })
    } else if (view === 'today') {
      const rows = rowsFor(data, today)
      const todo = rows.filter((r) => !r.done)
      const done = rows.filter((r) => r.done)
      const rowEls = []
      for (let i = 0; i < todo.length; i++) {
        rowEls.push(React.createElement(ScheduleRow, {
          key: todo[i].item.id, item: todo[i].item, dateStr: today, done: false,
          currentSessionId: currentSessionId, sessionsState: sessionsState, onMutate: onMutate,
          onOpenDetail: openDetail, onOpenEdit: openEdit,
        }))
      }
      const doneEls = []
      for (let i = 0; i < done.length; i++) {
        doneEls.push(React.createElement(ScheduleRow, {
          key: done[i].item.id, item: done[i].item, dateStr: today, done: true,
          currentSessionId: currentSessionId, sessionsState: sessionsState, onMutate: onMutate,
          onOpenDetail: openDetail, onOpenEdit: openEdit,
        }))
      }
      body = React.createElement('div', null,
        rowEls.length === 0 && doneEls.length === 0 ? React.createElement('div', { className: 'dsh-sched-empty' }, '今天没有日程 🎉') : null,
        rowEls,
        doneEls.length > 0 ? React.createElement('div', { className: 'dsh-sched-donesum', onClick: () => setDoneCollapsed(!doneCollapsed) },
          React.createElement('span', null, doneCollapsed ? '▸' : '▾'),
          React.createElement('span', null, '已完成 (' + doneEls.length + ')'),
        ) : null,
        doneCollapsed ? null : doneEls,
      )
    } else if (view === 'week') {
      const monday = mondayOf(today)
      const dayEls = []
      for (let i = 0; i < 7; i++) {
        const ds = addDays(monday, i)
        const rows = rowsFor(data, ds)
        const todayFlag = ds === today
        const rowEls = []
        for (let j = 0; j < rows.length; j++) {
          rowEls.push(React.createElement(ScheduleRow, {
            key: rows[j].item.id, item: rows[j].item, dateStr: ds, done: rows[j].done,
            currentSessionId: currentSessionId, sessionsState: sessionsState, onMutate: onMutate,
            onOpenDetail: openDetail, onOpenEdit: openEdit,
          }))
        }
        const dateLabel = Number(ds.slice(5, 7)) + '月 ' + Number(ds.slice(8, 10)) + '日 · ' + WEEKDAY_NAMES[i] + (todayFlag ? ' · 今天' : '')
        dayEls.push(React.createElement('div', { key: ds, className: 'dsh-sched-day' },
          React.createElement('div', { className: 'dsh-sched-dayhead' + (todayFlag ? ' today' : '') },
            React.createElement('span', null, dateLabel),
            React.createElement('span', { className: 'cnt' }, rows.length > 0 ? rows.filter((r) => !r.done).length + ' 待办' : '无日程'),
          ),
          rowEls,
        ))
      }
      body = React.createElement('div', null, dayEls)
    } else {
      body = React.createElement(HistoryView, {
        data: data, currentSessionId: currentSessionId, sessionsState: sessionsState, onMutate: onMutate,
        onOpenDetail: openDetail, onOpenEdit: openEdit,
      })
    }
    const todayRows = rowsFor(data, today)
    const doneCount = todayRows.filter((r) => r.done).length
    const todoCount = todayRows.length - doneCount
    const inSubView = m.type !== 'list'
    return React.createElement('div', { className: 'dsh-sched-panel' },
      React.createElement('div', { className: 'dsh-sched-header' },
        inSubView ? React.createElement('button', { className: 'dsh-sched-backbtn', title: '返回列表', onClick: backToList }, '←') : null,
        React.createElement('span', null, inSubView ? (m.type === 'edit' ? '编辑日程' : '日程详情') : '日程'),
        !inSubView ? React.createElement('div', { className: 'dsh-sched-tabs' },
          React.createElement('button', { className: 'dsh-sched-tab' + (view === 'today' ? ' active' : ''), onClick: () => { setView('today'); setAdding(false) } }, '今天'),
          React.createElement('button', { className: 'dsh-sched-tab' + (view === 'week' ? ' active' : ''), onClick: () => { setView('week'); setAdding(false) } }, '本周'),
          React.createElement('button', { className: 'dsh-sched-tab' + (view === 'history' ? ' active' : ''), onClick: () => { setView('history'); setAdding(false) } }, '历史'),
        ) : null,
        !inSubView ? React.createElement('button', {
          className: 'dsh-sched-addtoggle' + (adding ? ' active' : ''),
          title: adding ? '收起添加表单' : '添加日程',
          onClick: () => setAdding(!adding),
        }, adding ? '收起' : '+ 添加') : null,
        React.createElement('button', { className: 'dsh-sched-close', title: '关闭', onClick: () => store.setOpen(false) }, '✕'),
      ),
      adding && !inSubView ? React.createElement(AddForm, { onMutate: onMutate, onCancel: () => setAdding(false) }) : null,
      React.createElement('div', { className: 'dsh-sched-body' }, body),
      React.createElement('div', { className: 'dsh-sched-footer' },
        React.createElement('span', null, '今天 ' + todoCount + ' 待办 · ' + doneCount + ' 已完成'),
        React.createElement('span', null, '数据保存在本地'),
      ),
    )
  }

  function ScheduleLinker(props) {
    const linker = useStore(() => store.linker)
    const data = useStore(() => store.data)
    const sessionsState = props.useSessions((s) => s)
    React.useEffect(() => { if (linker && store.data === null) refresh() }, [linker])
    if (!linker) return null
    const currentSessionId = sessionsState !== null && sessionsState !== undefined ? sessionsState.current : undefined
    async function pick(id) {
      try {
        await call('link-session', { id, sessionId: currentSessionId, link: true })
      } catch (e) {
        console.error('[dsh-schedule] link failed', e)
      }
      store.setLinker(false)
    }
    const items = data === null ? [] : data.items.slice().sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    const list = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const linked = Array.isArray(item.linkedSessions) && item.linkedSessions.indexOf(currentSessionId) !== -1
      list.push(React.createElement('div', {
        key: item.id,
        className: 'dsh-sched-linker-item' + (linked ? ' linked' : ''),
        onClick: () => pick(item.id),
      },
        React.createElement('span', { className: 'dsh-sched-title' }, item.title),
        React.createElement('span', { className: 'tag' }, linked ? '✓ 已关联' : recurringLabel(item) || '关联'),
      ))
    }
    return React.createElement('div', { className: 'dsh-sched-linker' },
      React.createElement('div', { className: 'dsh-sched-linker-head' },
        React.createElement('span', null, '把当前会话关联到日程'),
        React.createElement('button', { className: 'dsh-sched-close', onClick: () => store.setLinker(false) }, '✕'),
      ),
      React.createElement('div', { className: 'dsh-sched-linker-list' },
        items.length === 0 ? React.createElement('div', { className: 'dsh-sched-empty' }, '还没有日程,点侧边栏或顶栏「日程」打开面板添加') : list,
      ),
      React.createElement('div', { className: 'dsh-sched-linker-cancel' },
        React.createElement('button', { onClick: () => store.setLinker(false) }, '取消'),
      ),
    )
  }

  function ScheduleOverlay(props) {
    const linker = useStore(() => store.linker)
    const open = useStore(() => store.open)
    // Esc 关闭;点击面板/弹层之外的区域也关闭。
    // 注意把触发按钮自身排除,否则 mousedown 先关、click 再开,面板会闪住不关。
    React.useEffect(() => {
      if (!open && !linker) return undefined
      const inside = '.dsh-sched-panel,.dsh-sched-linker,.dsh-sched-trigger,.dsh-sched-linkbtn,.dsh-sched-footbtn'
      function onKey(e) {
        if (e.key === 'Escape') { store.setOpen(false); store.setLinker(false) }
      }
      function onDown(e) {
        const t = e.target
        if (t && typeof t.closest === 'function' && t.closest(inside)) return
        store.setOpen(false)
        store.setLinker(false)
      }
      document.addEventListener('keydown', onKey)
      document.addEventListener('mousedown', onDown)
      return () => {
        document.removeEventListener('keydown', onKey)
        document.removeEventListener('mousedown', onDown)
      }
    }, [open, linker])
    if (!open && !linker) return null
    return React.createElement('div', { className: 'dsh-sched-overlay-wrap' },
      React.createElement(SchedulePanel, { useSessions: props.useSessions }),
      React.createElement(ScheduleLinker, { useSessions: props.useSessions }),
    )
  }

  slots.inject('conversation.session.header.actions', () => slots.register(
    { name: 'conversation.session.header.actions', id: 'dsh-schedule-trigger', order: 40 },
    () => React.createElement(ScheduleTrigger),
  ))

  slots.inject('sidebar.footer.action', () => slots.register(
    { name: 'sidebar.footer.action', id: 'dsh-schedule-foot', order: 10 },
    (props) => React.createElement(SidebarFootButton, { wide: props !== null && props !== undefined ? props.wide : false }),
  ))

  slots.inject('conversation.input.right', () => slots.register(
    { name: 'conversation.input.right', id: 'dsh-schedule-link', order: 0 },
    () => React.createElement(ScheduleLinkButton),
  ))

  slots.inject('shell.overlay', () => slots.register(
    { name: 'shell.overlay', id: 'dsh-schedule-panel' },
    (props) => React.createElement(ScheduleOverlay, { useSessions: props.useSessions }),
  ))

  refresh()
  console.log('[dsh-schedule] client ready')
}

module.exports = { name: 'dsh-schedule-client', inject: ['slots', 'sessions'], apply }
