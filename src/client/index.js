/**
 * dsh-schedule — 浏览器半身(CommonJS 形式,由 scripts/build.mjs 包装为
 * DSH client-modules C6 bundle)。
 *
 * 表面:
 *   1. 会话标题栏右侧"日程"文字按钮(conversation.session.header.actions)
 *   2. 日程面板(今天 / 本周 / 历史月历+统计),数据面 /api/dailytask/*
 *   3. 输入框右侧 🔗 关联按钮(conversation.input.right)
 *
 * 依赖 React(模块表 externals),不使用任何构建期依赖。
 */

const React = require('react')

const CSS = '.dsh-sched-trigger{display:inline-flex;align-items:center;background:transparent;border:none;border-radius:6px;padding:4px 10px;font-size:13px;line-height:1;cursor:pointer;color:inherit;opacity:.85;}.dsh-sched-trigger:hover{background:rgba(127,127,127,.14);opacity:1;}.dsh-sched-trigger.active{background:rgba(127,127,127,.2);}.dsh-sched-linkbtn{display:inline-flex;align-items:center;justify-content:center;background:transparent;border:1px solid transparent;border-radius:8px;padding:3px 6px;font-size:14px;cursor:pointer;color:inherit;}.dsh-sched-linkbtn:hover,.dsh-sched-linkbtn.active{background:rgba(127,127,127,.14);}.dsh-sched-overlay-wrap{position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:1000;font-family:inherit;}.dsh-sched-panel{position:fixed;top:54px;right:12px;width:400px;max-width:calc(100vw - 24px);max-height:calc(100vh - 76px);display:flex;flex-direction:column;background:#ffffff;color:#1f2328;border:1px solid rgba(127,127,127,.3);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.22);pointer-events:auto;font-size:13px;overflow:hidden;}.dsh-sched-header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(127,127,127,.2);font-weight:600;font-size:14px;}.dsh-sched-tabs{display:flex;gap:4px;margin-left:auto;}.dsh-sched-tab{border:1px solid rgba(127,127,127,.3);background:transparent;border-radius:8px;padding:3px 10px;font-size:12px;cursor:pointer;color:inherit;}.dsh-sched-tab.active{background:rgba(9,105,218,.12);border-color:rgba(9,105,218,.5);color:#0969da;}.dsh-sched-close{border:none;background:transparent;border-radius:8px;padding:2px 8px;font-size:14px;cursor:pointer;color:inherit;}.dsh-sched-close:hover{background:rgba(127,127,127,.15);}.dsh-sched-add{padding:10px 12px;border-bottom:1px solid rgba(127,127,127,.2);display:flex;flex-direction:column;gap:6px;}.dsh-sched-add-row{display:flex;gap:6px;align-items:center;}.dsh-sched-input{flex:1;min-width:0;background:rgba(127,127,127,.08);border:1px solid rgba(127,127,127,.3);border-radius:8px;padding:5px 9px;font-size:13px;color:inherit;}.dsh-sched-input:focus{outline:none;border-color:rgba(9,105,218,.6);}.dsh-sched-addbtn{background:#0969da;color:#fff;border:none;border-radius:8px;padding:5px 12px;font-size:13px;cursor:pointer;white-space:nowrap;}.dsh-sched-addbtn:hover{background:#0a5bb8;}.dsh-sched-add-opts{display:flex;gap:6px;flex-wrap:wrap;align-items:center;}.dsh-sched-weekdays{display:flex;gap:3px;}.dsh-sched-wd{border:1px solid rgba(127,127,127,.35);background:transparent;border-radius:50%;width:24px;height:24px;font-size:11px;cursor:pointer;color:inherit;display:flex;align-items:center;justify-content:center;padding:0;}.dsh-sched-wd.on{background:rgba(9,105,218,.18);border-color:#0969da;color:#0969da;}.dsh-sched-body{flex:1;overflow-y:auto;padding:8px 10px;}.dsh-sched-day{padding:6px 0;}.dsh-sched-dayhead{font-size:12px;font-weight:600;color:rgba(127,127,127,.9);margin:4px 2px 6px;display:flex;align-items:center;gap:6px;}.dsh-sched-dayhead.today{color:#0969da;}.dsh-sched-dayhead .cnt{font-weight:400;color:rgba(127,127,127,.7);}.dsh-sched-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;}.dsh-sched-row:hover{background:rgba(127,127,127,.1);}.dsh-sched-circle{width:18px;height:18px;border-radius:50%;border:2px solid rgba(127,127,127,.7);background:transparent;cursor:pointer;flex:none;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;padding:0;}.dsh-sched-circle.done{background:#2da44e;border-color:#2da44e;}.dsh-sched-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;}.dsh-sched-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:default;}.dsh-sched-title.linked{cursor:pointer;color:#0969da;}.dsh-sched-title.done{text-decoration:line-through;opacity:.5;}.dsh-sched-meta{display:flex;gap:5px;align-items:center;font-size:11px;color:rgba(127,127,127,.85);flex-wrap:wrap;}.dsh-sched-pill{background:rgba(127,127,127,.14);border-radius:5px;padding:0 5px;font-size:10px;line-height:16px;}.dsh-sched-note{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px;}.dsh-sched-chips{display:flex;gap:4px;flex-wrap:wrap;align-items:center;}.dsh-sched-chip{display:inline-flex;align-items:center;gap:2px;max-width:130px;background:rgba(9,105,218,.1);color:#0969da;border:1px solid rgba(9,105,218,.3);border-radius:10px;padding:1px 7px;font-size:11px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.dsh-sched-link{flex:none;width:20px;height:20px;border-radius:50%;border:1px dashed rgba(127,127,127,.6);background:transparent;font-size:11px;cursor:pointer;color:rgba(127,127,127,.8);display:flex;align-items:center;justify-content:center;padding:0;}.dsh-sched-link:hover{border-color:#0969da;color:#0969da;}.dsh-sched-link.on{border-color:rgba(127,127,127,.5);background:rgba(127,127,127,.12);color:rgba(127,127,127,.8);}.dsh-sched-del{flex:none;border:none;background:transparent;color:rgba(127,127,127,.65);font-size:13px;cursor:pointer;border-radius:6px;padding:0 4px;}.dsh-sched-del:hover{color:#d1242f;background:rgba(209,36,47,.1);}.dsh-sched-del.confirm{color:#fff;background:#d1242f;font-size:11px;border-radius:8px;padding:2px 6px;}.dsh-sched-donesum{padding:5px 8px;font-size:12px;color:rgba(127,127,127,.85);cursor:pointer;display:flex;align-items:center;gap:5px;border-radius:8px;}.dsh-sched-donesum:hover{background:rgba(127,127,127,.1);}.dsh-sched-empty{padding:18px 8px;text-align:center;color:rgba(127,127,127,.7);font-size:12px;}.dsh-sched-footer{padding:6px 12px;border-top:1px solid rgba(127,127,127,.2);font-size:11px;color:rgba(127,127,127,.75);display:flex;justify-content:space-between;gap:8px;}.dsh-sched-linker{position:fixed;bottom:86px;right:16px;width:300px;max-width:calc(100vw - 32px);background:#ffffff;color:#1f2328;border:1px solid rgba(127,127,127,.3);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.22);pointer-events:auto;font-size:13px;overflow:hidden;z-index:1001;}.dsh-sched-linker-head{padding:9px 12px;font-weight:600;font-size:13px;border-bottom:1px solid rgba(127,127,127,.2);display:flex;align-items:center;justify-content:space-between;}.dsh-sched-linker-list{max-height:280px;overflow-y:auto;padding:6px;}.dsh-sched-linker-item{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:8px;cursor:pointer;}.dsh-sched-linker-item:hover{background:rgba(127,127,127,.1);}.dsh-sched-linker-item .tag{margin-left:auto;font-size:10px;color:rgba(127,127,127,.7);flex:none;}.dsh-sched-linker-item.linked .tag{color:#2da44e;}.dsh-sched-linker-cancel{padding:7px;border-top:1px solid rgba(127,127,127,.2);text-align:center;}.dsh-sched-linker-cancel button{border:none;background:transparent;color:rgba(127,127,127,.8);cursor:pointer;font-size:12px;padding:2px 12px;border-radius:8px;}.dsh-sched-linker-cancel button:hover{background:rgba(127,127,127,.1);}.dsh-sched-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin:2px 0 6px;}.dsh-sched-calhead{text-align:center;font-size:10px;color:rgba(127,127,127,.7);padding:2px 0;}.dsh-sched-cald{border:1px solid rgba(127,127,127,.14);border-radius:6px;min-height:40px;padding:2px;cursor:pointer;text-align:center;font-size:11px;display:flex;flex-direction:column;align-items:center;gap:1px;background:transparent;color:inherit;}.dsh-sched-cald:hover{border-color:rgba(127,127,127,.45);}.dsh-sched-cald.empty{visibility:hidden;}.dsh-sched-cald.today{border-color:#0969da;}.dsh-sched-cald.sel{background:rgba(9,105,218,.16);border-color:#0969da;}.dsh-sched-cald .d{font-size:11px;line-height:1.3;}.dsh-sched-cald .s{font-size:9px;color:rgba(127,127,127,.8);line-height:1.2;}.dsh-sched-cald .s.doneall{color:#2da44e;font-weight:600;}.dsh-sched-calnav{display:flex;align-items:center;justify-content:space-between;margin:2px 2px 6px;}.dsh-sched-calnav button{border:1px solid rgba(127,127,127,.3);background:transparent;border-radius:6px;padding:2px 9px;font-size:12px;cursor:pointer;color:inherit;}.dsh-sched-calnav button:hover{background:rgba(127,127,127,.12);}.dsh-sched-calnav .t{font-weight:600;font-size:13px;}.dsh-sched-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:8px;}.dsh-sched-stat{background:rgba(127,127,127,.07);border:1px solid rgba(127,127,127,.15);border-radius:8px;padding:5px 4px;text-align:center;}.dsh-sched-stat .v{font-size:15px;font-weight:700;line-height:1.3;}.dsh-sched-stat .k{font-size:10px;color:rgba(127,127,127,.75);margin-top:1px;}.dsh-sched-histhead{font-size:12px;font-weight:600;color:rgba(127,127,127,.9);margin:4px 2px 6px;}@media (prefers-color-scheme: dark){.dsh-sched-panel{background:#1b1e23;color:#e6e8eb;border-color:rgba(255,255,255,.16);}.dsh-sched-linker{background:#1b1e23;color:#e6e8eb;border-color:rgba(255,255,255,.16);}.dsh-sched-tab.active{background:rgba(86,155,235,.18);border-color:rgba(86,155,235,.55);color:#6cb0f5;}.dsh-sched-addbtn{background:#2f7be0;}.dsh-sched-title.linked,.dsh-sched-chip,.dsh-sched-dayhead.today{color:#6cb0f5;}.dsh-sched-chip{background:rgba(86,155,235,.14);border-color:rgba(86,155,235,.4);}.dsh-sched-wd.on{background:rgba(86,155,235,.2);border-color:#6cb0f5;color:#6cb0f5;}.dsh-sched-input:focus{border-color:rgba(86,155,235,.6);}.dsh-sched-cald.today,.dsh-sched-cald.sel{border-color:#6cb0f5;}.dsh-sched-cald.sel{background:rgba(86,155,235,.2);}.dsh-sched-calnav button{border-color:rgba(255,255,255,.25);}}'

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
  ctx.effect(() => injectStyles(CSS))

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

  function pad(n) { return String(n).padStart(2, '0') }
  function fmt(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) }
  function todayStr() { return fmt(new Date()) }
  function dateOf(s) { const p = s.split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])) }
  function isoDay(s) { const j = dateOf(s).getDay(); return j === 0 ? 7 : j }
  function addDays(s, n) { const d = dateOf(s); d.setDate(d.getDate() + n); return fmt(d) }
  function mondayOf(s) { return addDays(s, -(isoDay(s) - 1)) }
  const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

  function matches(item, dateStr) {
    if (item.recurring === 'once') return item.date === dateStr
    if (item.recurring === 'daily') return true
    if (item.recurring === 'weekly') {
      const wd = Array.isArray(item.weekdays) ? item.weekdays : []
      return wd.indexOf(isoDay(dateStr)) !== -1
    }
    return false
  }

  function recurringLabel(item) {
    if (item.recurring === 'daily') return '每天'
    if (item.recurring === 'weekly') {
      const wd = Array.isArray(item.weekdays) ? item.weekdays : []
      if (wd.length === 0) return '每周'
      return '每周' + wd.map((n) => WEEKDAY_NAMES[n - 1]).join('')
    }
    return ''
  }

  function sortRows(a, b) {
    const ta = a.time || '99:99'
    const tb = b.time || '99:99'
    if (ta !== tb) return ta < tb ? -1 : 1
    return (a.title || '').localeCompare(b.title || '')
  }

  function rowsFor(data, dateStr) {
    if (data === null) return []
    const rows = []
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i]
      if (matches(item, dateStr)) {
        const doneMap = data.done && data.done[item.id] ? data.done[item.id] : {}
        const isRollover = item.recurring === 'once' && Array.isArray(item.rolloverDates) && item.rolloverDates.indexOf(dateStr) !== -1
        rows.push({ item, done: !!doneMap[dateStr], rollover: isRollover })
      }
    }
    rows.sort(sortRows)
    return rows
  }

  function completedBetween(data, fromDate, toDate) {
    let n = 0
    if (data !== null) {
      for (const id in data.done) {
        const m = data.done[id]
        for (const date in m) {
          if (m[date] && date >= fromDate && date <= toDate) n++
        }
      }
    }
    return n
  }

  function hasDoneOn(data, date) {
    if (data === null) return false
    for (const id in data.done) {
      if (data.done[id][date]) return true
    }
    return false
  }

  function streakOf(data, today) {
    let cursor = today
    if (!hasDoneOn(data, cursor)) cursor = addDays(cursor, -1)
    let n = 0
    while (hasDoneOn(data, cursor)) { n++; cursor = addDays(cursor, -1) }
    return n
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

  // ---- 顶栏文字按钮(简洁风:纯文字,无图标无红点) ----
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

  function ScheduleRow(props) {
    const { item, dateStr, done, currentSessionId, sessionsState, onMutate } = props
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
          title: links.length > 0 ? '点击跳转到关联会话' : item.title,
          onClick: () => { if (links.length > 0) openSession(links[0]) },
        }, item.title),
        meta.length > 0 || chips.length > 0 ? React.createElement('div', { className: 'dsh-sched-meta' },
          meta.length > 0 ? React.createElement('span', { style: { display: 'contents' } }, meta) : null,
          chips.length > 0 ? React.createElement('span', { className: 'dsh-sched-chips' }, chips) : null,
        ) : null,
      ),
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

  function AddForm(props) {
    const { onMutate } = props
    const [title, setTitle] = React.useState('')
    const [date, setDate] = React.useState('')
    const [recurring, setRecurring] = React.useState('once')
    const [weekdays, setWeekdays] = React.useState([])
    const [time, setTime] = React.useState('')
    const [carryOver, setCarryOver] = React.useState(false)
    function toggleWd(n) {
      setWeekdays(weekdays.indexOf(n) === -1 ? weekdays.concat([n]).sort() : weekdays.filter((x) => x !== n))
    }
    function add() {
      const t = title.trim()
      if (t === '') return
      onMutate('add', {
        title: t,
        recurring,
        date: date || undefined,
        weekdays: recurring === 'weekly' ? weekdays.slice() : undefined,
        time: time || undefined,
        carryOver: recurring === 'once' ? carryOver : undefined,
      })
      setTitle('')
      setDate('')
      setRecurring('once')
      setWeekdays([])
      setTime('')
      setCarryOver(false)
    }
    const wdBtns = []
    for (let i = 1; i <= 7; i++) {
      wdBtns.push(React.createElement('button', {
        key: i,
        className: 'dsh-sched-wd' + (weekdays.indexOf(i) !== -1 ? ' on' : ''),
        onClick: () => toggleWd(i),
      }, String(i)))
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
    if (recurring === 'weekly') opts.push(React.createElement('span', { key: 'wd', className: 'dsh-sched-weekdays' }, wdBtns))
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
          className: 'dsh-sched-input', placeholder: '添加日程,如:写周报', value: title,
          onChange: (e) => setTitle(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Enter') add() },
        }),
        React.createElement('button', { className: 'dsh-sched-addbtn', onClick: add }, '添加'),
      ),
      React.createElement('div', { className: 'dsh-sched-add-opts' }, opts),
    )
  }

  function HistoryView(props) {
    const { data, currentSessionId, sessionsState, onMutate } = props
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
    const sessionsState = props.useSessions((s) => s)
    React.useEffect(() => { if (open && store.data === null) refresh() }, [open])
    if (!open) return null
    const currentSessionId = sessionsState !== null && sessionsState !== undefined ? sessionsState.current : undefined
    async function onMutate(method, args) {
      try { await call(method, args) } catch (e) { console.error('[dsh-schedule] mutate failed', e) }
    }
    const today = todayStr()
    let body = null
    if (view === 'today') {
      const rows = rowsFor(data, today)
      const todo = rows.filter((r) => !r.done)
      const done = rows.filter((r) => r.done)
      const rowEls = []
      for (let i = 0; i < todo.length; i++) {
        rowEls.push(React.createElement(ScheduleRow, {
          key: todo[i].item.id, item: todo[i].item, dateStr: today, done: false,
          currentSessionId: currentSessionId, sessionsState: sessionsState, onMutate: onMutate,
        }))
      }
      const doneEls = []
      for (let i = 0; i < done.length; i++) {
        doneEls.push(React.createElement(ScheduleRow, {
          key: done[i].item.id, item: done[i].item, dateStr: today, done: true,
          currentSessionId: currentSessionId, sessionsState: sessionsState, onMutate: onMutate,
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
      })
    }
    const todayRows = rowsFor(data, today)
    const doneCount = todayRows.filter((r) => r.done).length
    const todoCount = todayRows.length - doneCount
    return React.createElement('div', { className: 'dsh-sched-panel' },
      React.createElement('div', { className: 'dsh-sched-header' },
        React.createElement('span', null, '日程'),
        React.createElement('div', { className: 'dsh-sched-tabs' },
          React.createElement('button', { className: 'dsh-sched-tab' + (view === 'today' ? ' active' : ''), onClick: () => setView('today') }, '今天'),
          React.createElement('button', { className: 'dsh-sched-tab' + (view === 'week' ? ' active' : ''), onClick: () => setView('week') }, '本周'),
          React.createElement('button', { className: 'dsh-sched-tab' + (view === 'history' ? ' active' : ''), onClick: () => setView('history') }, '历史'),
        ),
        React.createElement('button', { className: 'dsh-sched-close', title: '关闭', onClick: () => store.setOpen(false) }, '✕'),
      ),
      React.createElement(AddForm, { onMutate: onMutate }),
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
        items.length === 0 ? React.createElement('div', { className: 'dsh-sched-empty' }, '还没有日程,点右上角「日程」添加') : list,
      ),
      React.createElement('div', { className: 'dsh-sched-linker-cancel' },
        React.createElement('button', { onClick: () => store.setLinker(false) }, '取消'),
      ),
    )
  }

  function ScheduleOverlay(props) {
    const linker = useStore(() => store.linker)
    const open = useStore(() => store.open)
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
