/**
 * dsh-schedule — 浏览器半身(CommonJS 形式,由 scripts/build.mjs 包装为
 * DSH client-modules C6 bundle;纯逻辑辅助在 logic.cjs 中先行内联)。
 *
 * 表面(全部挂在 DSH 原生右侧栏 / 会话头上,无降级抽屉):
 *   1. 右侧栏页面「日程」—— 机制上是一个 tab 类型(registerTab 到核心服务
 *      `ctx.sidebarRightTabs`,kind = schedule,priority = extension,order 50),
 *      正文注册在 keyed slot `sidebar.right.pane.tab` 的 id/kind 双 key 上。
 *      入口有三条:
 *        a. 侧栏「新标签页」指南页 —— 由定义里的 `guide` 条目贡献(DSH 0.2.x
 *           的指南页只列 guide 条目,没有 guide 就等于没有入口);
 *        b. 会话标题栏右侧 📅「日程规划」按钮(conversation.session.header.utilities);
 *        c. better-sidebar 等其他入口调用 `ctx.sidebarRight.openTab('schedule')`。
 *      面板内含:今天 / 四象限 / 时间轴 / 本周 / 历史,行内 ✎ 编辑、点标题进详情、
 *      添加表单折叠为「+ 添加」、tab 角标显示今天剩余待办。
 *   2. 输入框右侧 🔗 关联按钮(conversation.input.right)+ shell.overlay
 *      里的关联选择弹层 —— 把当前会话关联到某条日程
 *
 * 右侧栏与 sessions 是硬依赖(inject),Cordis 会等服务出现后再 apply,
 * 不再有"有时抽屉、有时侧边卡片"的竞态。
 *
 * 数据面:/api/dailytask/*。依赖 React(模块表 externals),无构建期依赖。
 */

const React = require('react')

// 注:CSS 全部展开为单行字符串(构建脚本只做文本内联,不做 CSS 压缩)。
const CSS = '.dsh-sched-linkbtn{display:inline-flex;align-items:center;justify-content:center;background:transparent;border:1px solid transparent;border-radius:8px;padding:3px 6px;font-size:14px;cursor:pointer;color:inherit;}.dsh-sched-linkbtn:hover,.dsh-sched-linkbtn.active{background:rgba(127,127,127,.14);}.dsh-sched-overlay-wrap{position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:1000;font-family:inherit;}.dsh-sched-header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(127,127,127,.2);font-weight:600;font-size:14px;}.dsh-sched-tabs{display:flex;gap:4px;margin-left:auto;}.dsh-sched-tab{border:1px solid rgba(127,127,127,.3);background:transparent;border-radius:8px;padding:3px 10px;font-size:12px;cursor:pointer;color:inherit;}.dsh-sched-tab.active{background:rgba(9,105,218,.12);border-color:rgba(9,105,218,.5);color:#0969da;}.dsh-sched-add{padding:10px 12px;border-bottom:1px solid rgba(127,127,127,.2);display:flex;flex-direction:column;gap:6px;}.dsh-sched-add-row{display:flex;gap:6px;align-items:center;}.dsh-sched-input{flex:1;min-width:0;background:rgba(127,127,127,.08);border:1px solid rgba(127,127,127,.3);border-radius:8px;padding:5px 9px;font-size:13px;color:inherit;}.dsh-sched-input:focus{outline:none;border-color:rgba(9,105,218,.6);}.dsh-sched-addbtn{background:#0969da;color:#fff;border:none;border-radius:8px;padding:5px 12px;font-size:13px;cursor:pointer;white-space:nowrap;}.dsh-sched-addbtn:hover{background:#0a5bb8;}.dsh-sched-add-opts{display:flex;gap:6px;flex-wrap:wrap;align-items:center;}.dsh-sched-weekdays{display:flex;gap:3px;}.dsh-sched-wd{border:1px solid rgba(127,127,127,.35);background:transparent;border-radius:50%;width:24px;height:24px;font-size:11px;cursor:pointer;color:inherit;display:flex;align-items:center;justify-content:center;padding:0;}.dsh-sched-wd.on{background:rgba(9,105,218,.18);border-color:#0969da;color:#0969da;}.dsh-sched-body{flex:1;overflow-y:auto;padding:8px 10px;}.dsh-sched-day{padding:6px 0;}.dsh-sched-dayhead{font-size:12px;font-weight:600;color:rgba(127,127,127,.9);margin:4px 2px 6px;display:flex;align-items:center;gap:6px;}.dsh-sched-dayhead.today{color:#0969da;}.dsh-sched-dayhead .cnt{font-weight:400;color:rgba(127,127,127,.7);}.dsh-sched-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;}.dsh-sched-row:hover{background:rgba(127,127,127,.1);}.dsh-sched-circle{width:18px;height:18px;border-radius:50%;border:2px solid rgba(127,127,127,.7);background:transparent;cursor:pointer;flex:none;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;padding:0;}.dsh-sched-circle.done{background:#2da44e;border-color:#2da44e;}.dsh-sched-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;}.dsh-sched-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:default;}.dsh-sched-title.linked{cursor:pointer;color:#0969da;}.dsh-sched-title.done{text-decoration:line-through;opacity:.5;}.dsh-sched-meta{display:flex;gap:5px;align-items:center;font-size:11px;color:rgba(127,127,127,.85);flex-wrap:wrap;}.dsh-sched-pill{background:rgba(127,127,127,.14);border-radius:5px;padding:0 5px;font-size:10px;line-height:16px;}.dsh-sched-note{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px;}.dsh-sched-chips{display:flex;gap:4px;flex-wrap:wrap;align-items:center;}.dsh-sched-chip{display:inline-flex;align-items:center;gap:2px;max-width:130px;background:rgba(9,105,218,.1);color:#0969da;border:1px solid rgba(9,105,218,.3);border-radius:10px;padding:1px 7px;font-size:11px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.dsh-sched-link{flex:none;width:20px;height:20px;border-radius:50%;border:1px dashed rgba(127,127,127,.6);background:transparent;font-size:11px;cursor:pointer;color:rgba(127,127,127,.8);display:flex;align-items:center;justify-content:center;padding:0;}.dsh-sched-link:hover{border-color:#0969da;color:#0969da;}.dsh-sched-link.on{border-color:rgba(127,127,127,.5);background:rgba(127,127,127,.12);color:rgba(127,127,127,.8);}.dsh-sched-del{flex:none;border:none;background:transparent;color:rgba(127,127,127,.65);font-size:13px;cursor:pointer;border-radius:6px;padding:0 4px;}.dsh-sched-del:hover{color:#d1242f;background:rgba(209,36,47,.1);}.dsh-sched-del.confirm{color:#fff;background:#d1242f;font-size:11px;border-radius:8px;padding:2px 6px;}.dsh-sched-donesum{padding:5px 8px;font-size:12px;color:rgba(127,127,127,.85);cursor:pointer;display:flex;align-items:center;gap:5px;border-radius:8px;}.dsh-sched-donesum:hover{background:rgba(127,127,127,.1);}.dsh-sched-empty{padding:18px 8px;text-align:center;color:rgba(127,127,127,.7);font-size:12px;}.dsh-sched-footer{padding:6px 12px;border-top:1px solid rgba(127,127,127,.2);font-size:11px;color:rgba(127,127,127,.75);display:flex;justify-content:space-between;gap:8px;}.dsh-sched-linker{position:fixed;bottom:86px;right:16px;width:300px;max-width:calc(100vw - 32px);background:#ffffff;color:#1f2328;border:1px solid rgba(127,127,127,.3);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.22);pointer-events:auto;font-size:13px;overflow:hidden;z-index:1001;}.dsh-sched-linker-head{padding:9px 12px;font-weight:600;font-size:13px;border-bottom:1px solid rgba(127,127,127,.2);display:flex;align-items:center;justify-content:space-between;}.dsh-sched-linker-list{max-height:280px;overflow-y:auto;padding:6px;}.dsh-sched-linker-item{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:8px;cursor:pointer;}.dsh-sched-linker-item:hover{background:rgba(127,127,127,.1);}.dsh-sched-linker-item .tag{margin-left:auto;font-size:10px;color:rgba(127,127,127,.7);flex:none;}.dsh-sched-linker-item.linked .tag{color:#2da44e;}.dsh-sched-linker-cancel{padding:7px;border-top:1px solid rgba(127,127,127,.2);text-align:center;}.dsh-sched-linker-cancel button{border:none;background:transparent;color:rgba(127,127,127,.8);cursor:pointer;font-size:12px;padding:2px 12px;border-radius:8px;}.dsh-sched-linker-cancel button:hover{background:rgba(127,127,127,.1);}.dsh-sched-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin:2px 0 6px;}.dsh-sched-calhead{text-align:center;font-size:10px;color:rgba(127,127,127,.7);padding:2px 0;}.dsh-sched-cald{border:1px solid rgba(127,127,127,.14);border-radius:6px;min-height:40px;padding:2px;cursor:pointer;text-align:center;font-size:11px;display:flex;flex-direction:column;align-items:center;gap:1px;background:transparent;color:inherit;}.dsh-sched-cald:hover{border-color:rgba(127,127,127,.45);}.dsh-sched-cald.empty{visibility:hidden;}.dsh-sched-cald.today{border-color:#0969da;}.dsh-sched-cald.sel{background:rgba(9,105,218,.16);border-color:#0969da;}.dsh-sched-cald .d{font-size:11px;line-height:1.3;}.dsh-sched-cald .s{font-size:9px;color:rgba(127,127,127,.8);line-height:1.2;}.dsh-sched-cald .s.doneall{color:#2da44e;font-weight:600;}.dsh-sched-calnav{display:flex;align-items:center;justify-content:space-between;margin:2px 2px 6px;}.dsh-sched-calnav button{border:1px solid rgba(127,127,127,.3);background:transparent;border-radius:6px;padding:2px 9px;font-size:12px;cursor:pointer;color:inherit;}.dsh-sched-calnav button:hover{background:rgba(127,127,127,.12);}.dsh-sched-calnav .t{font-weight:600;font-size:13px;}.dsh-sched-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:8px;}.dsh-sched-stat{background:rgba(127,127,127,.07);border:1px solid rgba(127,127,127,.15);border-radius:8px;padding:5px 4px;text-align:center;}.dsh-sched-stat .v{font-size:15px;font-weight:700;line-height:1.3;}.dsh-sched-stat .k{font-size:10px;color:rgba(127,127,127,.75);margin-top:1px;}.dsh-sched-histhead{font-size:12px;font-weight:600;color:rgba(127,127,127,.9);margin:4px 2px 6px;}.dsh-sched-backbtn{border:none;background:transparent;border-radius:8px;padding:2px 8px;font-size:15px;line-height:1;cursor:pointer;color:inherit;}.dsh-sched-backbtn:hover{background:rgba(127,127,127,.15);}.dsh-sched-addtoggle{border:1px solid rgba(9,105,218,.5);background:rgba(9,105,218,.08);color:#0969da;border-radius:8px;padding:3px 10px;font-size:12px;line-height:1.4;cursor:pointer;white-space:nowrap;}.dsh-sched-addtoggle:hover{background:rgba(9,105,218,.16);}.dsh-sched-addtoggle.active{background:#0969da;border-color:#0969da;color:#fff;}.dsh-sched-textarea{width:100%;min-height:56px;resize:vertical;background:rgba(127,127,127,.08);border:1px solid rgba(127,127,127,.3);border-radius:8px;padding:6px 9px;font-size:13px;color:inherit;font-family:inherit;box-sizing:border-box;}.dsh-sched-textarea:focus{outline:none;border-color:rgba(9,105,218,.6);}.dsh-sched-editbtn{flex:none;border:none;background:transparent;color:rgba(127,127,127,.75);font-size:13px;cursor:pointer;border-radius:6px;padding:0 4px;}.dsh-sched-editbtn:hover{color:#0969da;background:rgba(9,105,218,.08);}.dsh-sched-detail{padding:12px 14px 14px;display:flex;flex-direction:column;gap:10px;}.dsh-sched-detail-title{font-size:16px;font-weight:600;line-height:1.5;word-break:break-word;}.dsh-sched-detail-pills{display:flex;gap:5px;flex-wrap:wrap;align-items:center;}.dsh-sched-section{border-top:1px solid rgba(127,127,127,.16);padding-top:8px;display:flex;flex-direction:column;gap:6px;}.dsh-sched-section-label{font-size:11px;font-weight:600;color:rgba(127,127,127,.85);}.dsh-sched-note-full{white-space:pre-wrap;word-break:break-word;line-height:1.6;font-size:13px;background:rgba(127,127,127,.07);border-radius:8px;padding:8px 10px;}.dsh-sched-note-empty{font-size:12px;color:rgba(127,127,127,.7);}.dsh-sched-actions{margin-top:auto;display:flex;gap:6px;flex-wrap:wrap;padding-top:10px;border-top:1px solid rgba(127,127,127,.16);}.dsh-sched-abtn{display:inline-flex;align-items:center;gap:4px;border:1px solid rgba(127,127,127,.35);background:transparent;border-radius:8px;padding:5px 12px;font-size:12px;line-height:1.4;cursor:pointer;color:inherit;}.dsh-sched-abtn:hover{background:rgba(127,127,127,.1);}.dsh-sched-abtn.primary{background:#0969da;border-color:#0969da;color:#fff;}.dsh-sched-abtn.primary:hover{background:#0a5bb8;}.dsh-sched-abtn.danger{color:#d1242f;border-color:rgba(209,36,47,.5);}.dsh-sched-abtn.danger:hover{background:rgba(209,36,47,.08);}.dsh-sched-abtn.danger.confirm{background:#d1242f;border-color:#d1242f;color:#fff;}.dsh-sched-chip.static{cursor:default;}@media (prefers-color-scheme: dark){.dsh-sched-linker{background:#1b1e23;color:#e6e8eb;border-color:rgba(255,255,255,.16);}.dsh-sched-tab.active{background:rgba(86,155,235,.18);border-color:rgba(86,155,235,.55);color:#6cb0f5;}.dsh-sched-addbtn{background:#2f7be0;}.dsh-sched-title.linked,.dsh-sched-chip,.dsh-sched-dayhead.today{color:#6cb0f5;}.dsh-sched-chip{background:rgba(86,155,235,.14);border-color:rgba(86,155,235,.4);}.dsh-sched-wd.on{background:rgba(86,155,235,.2);border-color:#6cb0f5;color:#6cb0f5;}.dsh-sched-input:focus{border-color:rgba(86,155,235,.6);}.dsh-sched-cald.today,.dsh-sched-cald.sel{border-color:#6cb0f5;}.dsh-sched-cald.sel{background:rgba(86,155,235,.2);}.dsh-sched-calnav button{border-color:rgba(255,255,255,.25);}.dsh-sched-addtoggle{color:#6cb0f5;border-color:rgba(86,155,235,.55);background:rgba(86,155,235,.14);}.dsh-sched-addtoggle.active{background:#2f7be0;border-color:#2f7be0;color:#fff;}.dsh-sched-section,.dsh-sched-actions{border-top-color:rgba(255,255,255,.12);}.dsh-sched-note-full{background:rgba(255,255,255,.06);}.dsh-sched-abtn{border-color:rgba(255,255,255,.28);}.dsh-sched-abtn.primary{background:#2f7be0;border-color:#2f7be0;}.dsh-sched-editbtn:hover{color:#6cb0f5;background:rgba(86,155,235,.12);}.dsh-sched-textarea:focus{border-color:rgba(86,155,235,.6);}}.dsh-sched-tabwrap { display: flex; flex-direction: column; flex: auto; height: 100%; min-height: 0; background: transparent; color: inherit; box-sizing: border-box; overflow: hidden; }.dsh-sched-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.2)); flex: none; gap: 8px; }.dsh-sched-tabs { display: flex; gap: 4px; }.dsh-sched-tab { border: 1px solid rgba(127,127,127,.3); background: transparent; border-radius: 6px; padding: 3px 9px; font-size: 12px; cursor: pointer; color: inherit; }.dsh-sched-tab.active { background: rgba(9,105,218,.15); border-color: #0969da; color: #0969da; font-weight: 600; }.dsh-sched-addtoggle { border: 1px solid rgba(9,105,218,.5); background: rgba(9,105,218,.08); color: #0969da; border-radius: 6px; padding: 3px 9px; font-size: 12px; cursor: pointer; white-space: nowrap; }.dsh-sched-addtoggle.active { background: #0969da; color: #fff; }.dsh-sched-body { flex: auto; min-height: 0; overflow-y: auto !important; overflow-x: hidden; padding: 12px 14px; scrollbar-gutter: stable; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }.dsh-sched-body::-webkit-scrollbar { width: 6px; }.dsh-sched-body::-webkit-scrollbar-thumb { background: rgba(127,127,127,.3); border-radius: 3px; }.dsh-sched-body::-webkit-scrollbar-thumb:hover { background: rgba(127,127,127,.5); }.dsh-sched-footer { padding: 8px 14px; border-top: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.18)); font-size: 11px; color: rgba(127,127,127,.75); display: flex; justify-content: space-between; flex: none; }.dsh-sched-header-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; background: none; border: none; border-radius: 6px; color: var(--dsw-alias-label-secondary, inherit); cursor: pointer; font-size: 14px; }.dsh-sched-header-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); color: var(--dsw-alias-label-primary, inherit); }/* 四象限网格 */.dsh-sched-matrix { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 8px; height: 100%; min-height: 480px; box-sizing: border-box; }.dsh-sched-qbox { display: flex; flex-direction: column; border-radius: 8px; border: 1px dashed rgba(127,127,127,.3); background: rgba(127,127,127,.04); padding: 8px; min-height: 0; overflow: hidden; transition: border-color .15s, background .15s; }.dsh-sched-qbox.dragover { border-color: #0969da !important; border-style: solid !important; background: rgba(9,105,218,.12) !important; }.dsh-sched-qhead { display: flex; align-items: center; justify-content: space-between; padding-bottom: 4px; margin-bottom: 6px; border-bottom: 1px solid rgba(127,127,127,.15); flex: none; }.dsh-sched-qtitle { font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 4px; }.dsh-sched-qsubtitle { font-size: 9px; color: rgba(127,127,127,.7); margin-left: 3px; font-weight: 400; }.dsh-sched-qcnt { font-size: 10px; padding: 1px 5px; border-radius: 10px; background: rgba(127,127,127,.15); font-weight: 600; }.dsh-sched-qlist { display: flex; flex-direction: column; gap: 5px; flex: 1; overflow-y: auto; padding-right: 2px; min-height: 0; }.dsh-sched-qcard { display: flex; align-items: center; gap: 5px; padding: 6px 7px; background: rgba(127,127,127,.08); border: 1px solid rgba(127,127,127,.18); border-radius: 6px; cursor: grab; user-select: none; font-size: 11px; transition: box-shadow .15s, transform .1s; }.dsh-sched-qcard:hover { border-color: rgba(127,127,127,.45); background: rgba(127,127,127,.12); box-shadow: 0 2px 5px rgba(0,0,0,.08); }.dsh-sched-qcard:active { cursor: grabbing; }.dsh-sched-qcard.dragging { opacity: .35; transform: scale(0.98); }.dsh-sched-qcard.done { opacity: .5; text-decoration: line-through; }.dsh-sched-qcard .qhandle { color: rgba(127,127,127,.45); font-size: 12px; cursor: grab; flex: none; }.dsh-sched-qcard .qtitle { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }.dsh-sched-qcard .qtime { font-size: 9px; padding: 1px 4px; border-radius: 3px; background: rgba(127,127,127,.15); flex: none; }.dsh-sched-qempty { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 10px; color: rgba(127,127,127,.45); border: 1px dashed rgba(127,127,127,.18); border-radius: 5px; min-height: 40px; }/* 垂直时间轴排程样式 */.dsh-sched-timeline { display: flex; flex-direction: column; gap: 14px; min-height: 100%; height: auto; box-sizing: border-box; padding-bottom: 24px; }.dsh-sched-tl-statbar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 6px 10px; background: rgba(127,127,127,.08); border: 1px solid rgba(127,127,127,.18); border-radius: 8px; font-size: 11px; flex: none; }.dsh-sched-tl-pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 12px; background: rgba(127,127,127,.12); font-weight: 500; }.dsh-sched-tl-pill.warn { background: rgba(207,34,46,.15); color: #cf222e; font-weight: 600; }.dsh-sched-tl-axis { position: relative; display: flex; flex-direction: column; gap: 12px; padding-left: 20px; border-left: 2px solid rgba(127,127,127,.25); margin-left: 62px; margin-top: 6px; flex: none; }.dsh-sched-tl-node { position: relative; flex: none; width: 100%; box-sizing: border-box; }.dsh-sched-tl-dot { position: absolute; left: -24px; top: 12px; width: 10px; height: 10px; border-radius: 50%; background: #0969da; border: 2px solid var(--dsw-alias-bg-canvas, #1f2328); box-sizing: border-box; z-index: 2; }.dsh-sched-tl-dot.conflict { background: #cf222e; }.dsh-sched-tl-dot.free { background: rgba(127,127,127,.4); width: 8px; height: 8px; left: -23px; }.dsh-sched-tl-card { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; background: rgba(127,127,127,.08); border: 1px solid rgba(127,127,127,.2); border-radius: 8px; font-size: 12px; box-sizing: border-box; word-break: break-word; transition: all .15s; touch-action: none; }.dsh-sched-tl-card:hover { border-color: rgba(127,127,127,.45); background: rgba(127,127,127,.12); box-shadow: 0 2px 8px rgba(0,0,0,.1); }.dsh-sched-tl-card.conflict { border-color: #cf222e; background: rgba(207,34,46,.08); }.dsh-sched-tl-card.done { opacity: .55; text-decoration: line-through; }.dsh-sched-tl-topline { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; }.dsh-sched-tl-time { font-family: monospace; font-weight: 700; font-size: 12px; color: #0969da; display: inline-flex; align-items: center; gap: 6px; }.dsh-sched-tl-dur { font-size: 10px; color: rgba(127,127,127,.75); font-weight: normal; }.dsh-sched-tl-warn { font-size: 10px; color: #cf222e; background: rgba(207,34,46,.12); padding: 4px 8px; border-radius: 4px; margin-top: 4px; font-weight: 600; display: flex; align-items: center; gap: 4px; word-break: break-word; }.dsh-sched-tl-free-box { display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; border: 1px dashed rgba(127,127,127,.3); border-radius: 6px; font-size: 11px; color: rgba(127,127,127,.75); background: rgba(127,127,127,.02); transition: all .15s; }.dsh-sched-tl-free-box.dragover { border-color: #0969da; border-style: solid; background: rgba(9,105,218,.14); box-shadow: 0 0 10px rgba(9,105,218,.25); color: #0969da; font-weight: 600; }.dsh-sched-tl-dot.free.dragover { background: #0969da; transform: scale(1.3); }.dsh-sched-tl-free-btn { border: none; background: transparent; color: #0969da; cursor: pointer; font-size: 10px; padding: 1px 6px; border-radius: 4px; flex: none; }.dsh-sched-tl-free-btn:hover { background: rgba(9,105,218,.12); text-decoration: underline; }.dsh-sched-tl-unscheduled { margin-top: 20px; padding: 10px 12px; background: rgba(127,127,127,.04); border: 1px solid rgba(127,127,127,.18); border-radius: 8px; flex: none; clear: both; }.dsh-sched-tl-un-header { font-size: 12px; font-weight: 600; color: inherit; display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none; margin-bottom: 6px; }.dsh-sched-tl-un-list { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }.dsh-sched-tl-now-wrap { display: flex; align-items: center; position: relative; margin: 4px 0; z-index: 3; }.dsh-sched-tl-now-dot { position: absolute; left: -25px; top: 50%; transform: translateY(-50%); width: 12px; height: 12px; border-radius: 50%; background: #cf222e; border: 2px solid var(--dsw-alias-bg-canvas, #1f2328); box-sizing: border-box; z-index: 4; box-shadow: 0 0 0 0 rgba(207,34,46,.7); animation: dsh-sched-pulse 2s infinite cubic-bezier(.45, 0, .55, 1); }@keyframes dsh-sched-pulse { 0% { box-shadow: 0 0 0 0 rgba(207,34,46,.7); } 70% { box-shadow: 0 0 0 6px rgba(207,34,46,0); } 100% { box-shadow: 0 0 0 0 rgba(207,34,46,0); } }.dsh-sched-tl-now-line { display: flex; align-items: center; position: relative; width: 100%; height: 2px; background: linear-gradient(90deg, #cf222e 0%, rgba(207,34,46,.4) 75%, transparent 100%); margin-left: -18px; padding-left: 24px; }.dsh-sched-tl-now-label { display: inline-flex; align-items: center; gap: 4px; background: #cf222e; color: #fff; font-size: 10px; font-weight: 700; font-family: monospace; padding: 1px 7px; border-radius: 10px; box-shadow: 0 1px 4px rgba(207,34,46,.35); white-space: nowrap; letter-spacing: .3px; user-select: none; }.dsh-sched-tl-dot.overdue:not(.conflict) { background: #d97706; }.dsh-sched-tl-card.overdue { border-color: rgba(217,119,6,.45); background: rgba(217,119,6,.06); }.dsh-sched-tl-overdue { font-size: 11px; color: #d97706; background: rgba(217,119,6,.12); padding: 3px 8px; border-radius: 4px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; align-self: flex-start; margin-top: 2px; }.dsh-sched-tl-dragcard { display: flex; align-items: center; gap: 4px; background: rgba(127,127,127,.06); border: 1px solid rgba(127,127,127,.18); border-radius: 8px; padding: 1px 6px; cursor: grab; user-select: none; transition: all .15s; }.dsh-sched-tl-dragcard:hover { background: rgba(127,127,127,.12); border-color: rgba(127,127,127,.4); box-shadow: 0 2px 6px rgba(0,0,0,.08); }.dsh-sched-tl-dragcard:active { cursor: grabbing; }.dsh-sched-tl-dragcard.dragging { opacity: .35; transform: scale(0.98); }.dsh-sched-tl-dragcard.done { opacity: .5; }.dsh-sched-tl-dragcard .qhandle { color: rgba(127,127,127,.45); font-size: 13px; cursor: grab; flex: none; padding: 2px; }.dsh-sched-tl-dragcard .dsh-sched-row { flex: 1; min-width: 0; padding: 4px 2px; background: transparent; }.dsh-sched-tl-dragcard .dsh-sched-row:hover { background: transparent; }.dsh-sched-tl-adjust-group { display: inline-flex; align-items: center; gap: 3px; margin-left: 4px; }.dsh-sched-tl-adjust-btn { display: inline-flex; align-items: center; justify-content: center; background: transparent; border: 1px solid rgba(127,127,127,.22); border-radius: 999px; padding: 0 5px; height: 16px; font-size: 10px; line-height: 1; cursor: pointer; color: inherit; opacity: .65; transition: all .15s; user-select: none; }.dsh-sched-tl-adjust-btn:hover { opacity: 1; background: rgba(9,105,218,.12); border-color: rgba(9,105,218,.4); color: #0969da; }.dsh-sched-tl-handle { cursor: grab !important; user-select: none; touch-action: none; color: rgba(127,127,127,.6); font-size: 14px; padding: 2px 6px; margin-right: 2px; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; transition: background .15s, color .15s; flex: none; }.dsh-sched-tl-handle:hover { color: #0969da; background: rgba(9,105,218,.15); cursor: grab !important; }.dsh-sched-tl-handle:active { cursor: grabbing !important; }.dsh-sched-tl-card.dragging { opacity: .45; transform: scale(0.98); box-shadow: 0 4px 14px rgba(0,0,0,.15); pointer-events: none; }.dsh-sched-tl-card.drop-before { border-top: 2px solid #0969da; box-shadow: 0 -2px 8px rgba(9,105,218,.25); }.dsh-sched-tl-card.drop-after { border-bottom: 2px solid #0969da; box-shadow: 0 2px 8px rgba(9,105,218,.25); }.dsh-sched-tl-drop-indicator { display: flex; align-items: center; gap: 6px; padding: 4px 10px; margin: 4px 0; border-radius: 6px; background: rgba(9,105,218,.15); border: 1.5px dashed #0969da; color: #0969da; font-size: 11px; font-weight: 600; font-family: monospace; animation: dsh-sched-drop-pulse 1.5s infinite ease-in-out; box-sizing: border-box; }.dsh-sched-tl-floating-hint { position: sticky; top: 4px; z-index: 10; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 12px; border-radius: 20px; background: #0969da; color: #fff; font-size: 12px; font-weight: 600; box-shadow: 0 4px 12px rgba(9,105,218,.35); margin-bottom: 8px; user-select: none; pointer-events: none; }@keyframes dsh-sched-drop-pulse { 0%, 100% { opacity: .85; transform: scale(1); } 50% { opacity: 1; transform: scale(1.01); } }.dsh-sched-tl-ruler-track { position: absolute; left: -23px; top: 0; bottom: 0; width: 6px; background: linear-gradient(to bottom, rgba(127,127,127,.18) 0%, rgba(9,105,218,.35) 50%, rgba(127,127,127,.18) 100%); border-radius: 3px; cursor: ns-resize; z-index: 1; user-select: none; touch-action: none; transition: background .15s; }.dsh-sched-tl-ruler-track:hover { background: linear-gradient(to bottom, rgba(9,105,218,.35) 0%, rgba(9,105,218,.7) 50%, rgba(9,105,218,.35) 100%); }.dsh-sched-tl-ruler-track::before { content: \"\"; position: absolute; top: 0; bottom: 0; left: -8px; width: 22px; background-image: repeating-linear-gradient(to bottom, rgba(127,127,127,.35) 0, rgba(127,127,127,.35) 1px, transparent 1px, transparent 8px); pointer-events: none; opacity: .6; }.dsh-sched-tl-ruler-handle { position: absolute; left: -80px; top: 8px; display: inline-flex; align-items: center; justify-content: center; gap: 3px; background: var(--dsw-alias-bg-canvas, #1f2328); border: 1.5px solid rgba(9,105,218,.5); border-radius: 6px; padding: 2px 5px; font-size: 11px; font-family: monospace; font-weight: 700; color: #0969da; cursor: ns-resize !important; user-select: none !important; touch-action: none !important; box-shadow: 0 1px 4px rgba(0,0,0,.15); transition: all .15s ease-out; z-index: 6; white-space: nowrap; }.dsh-sched-tl-ruler-handle:hover { border-color: #2f81f7; background: rgba(9,105,218,.15); color: #2f81f7; box-shadow: 0 0 10px rgba(9,105,218,.5); transform: scale(1.06); cursor: ns-resize !important; }.dsh-sched-tl-ruler-handle.active, .dsh-sched-tl-ruler-handle.selected { border-color: #0969da; background: rgba(9,105,218,.2); color: #0969da; box-shadow: 0 0 8px rgba(9,105,218,.45); }.dsh-sched-tl-ruler-handle.sliding { border-color: #58a6ff !important; background: #0969da !important; color: #fff !important; box-shadow: 0 0 14px rgba(9,105,218,.7) !important; transform: scale(1.08); cursor: ns-resize !important; }.dsh-sched-tl-ruler-handle.now-handle { border-color: #cf222e; color: #cf222e; top: 50%; transform: translateY(-50%); box-shadow: 0 1px 6px rgba(207,34,46,.35); animation: dsh-sched-ruler-glow 2s infinite ease-in-out; }.dsh-sched-tl-ruler-handle.now-handle:hover { border-color: #f85149; color: #f85149; background: rgba(207,34,46,.15); transform: translateY(-50%) scale(1.06); }.dsh-sched-tl-ruler-handle.now-handle.sliding { background: #cf222e !important; color: #fff !important; box-shadow: 0 0 14px rgba(207,34,46,.7) !important; transform: translateY(-50%) scale(1.08); }@keyframes dsh-sched-ruler-glow { 0%, 100% { box-shadow: 0 0 4px rgba(207,34,46,.3); } 50% { box-shadow: 0 0 10px rgba(207,34,46,.75); } }.dsh-sched-tl-ruler-arrows { font-size: 9px; letter-spacing: -1px; opacity: .85; line-height: 1; }.dsh-sched-tl-ruler-badge { font-family: monospace; font-size: 11px; font-weight: 700; }.dsh-sched-tl-ruler-grip { font-size: 12px; opacity: .8; margin-left: 1px; font-weight: normal; }.dsh-sched-tl-ruler-bubble { position: sticky; top: 4px; z-index: 25; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 14px; border-radius: 20px; background: linear-gradient(135deg, #0969da 0%, #1f6feb 100%); color: #fff; font-size: 12px; font-weight: 700; font-family: monospace; box-shadow: 0 4px 16px rgba(9,105,218,.45); margin-bottom: 8px; user-select: none; pointer-events: none; animation: dsh-sched-pop-in .15s ease-out; }.dsh-sched-tl-card.ruler-sliding { border-color: #0969da; background: rgba(9,105,218,.12); box-shadow: 0 4px 16px rgba(9,105,218,.25); }.dsh-sched-tl-node.selected .dsh-sched-tl-card { border-color: rgba(9,105,218,.5); box-shadow: 0 0 8px rgba(9,105,218,.15); }.dsh-sched-tl-dot.selected { border-color: #0969da; box-shadow: 0 0 0 3px rgba(9,105,218,.35); transform: scale(1.15); }@keyframes dsh-sched-pop-in { from { opacity: 0; transform: scale(.95) translateY(-4px); } to { opacity: 1; transform: scale(1) translateY(0); } }/* 时间轴视图样式 */.dsh-sched-tl-container { display: flex; flex-direction: column; height: 100%; min-height: 500px; position: relative; overflow: hidden; }.dsh-sched-tl-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 4px 6px 8px; border-bottom: 1px solid rgba(127,127,127,.18); font-size: 11px; flex: none; gap: 8px; }.dsh-sched-tl-badge { background: rgba(9,105,218,.12); color: #0969da; padding: 2px 8px; border-radius: 12px; font-weight: 600; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; }.dsh-sched-tl-scroll { flex: 1; min-height: 0; overflow-y: auto; position: relative; padding: 8px 4px 40px 4px; scroll-behavior: smooth; }.dsh-sched-tl-grid { position: relative; width: 100%; box-sizing: border-box; }.dsh-sched-tl-hour { position: absolute; left: 0; right: 0; border-top: 1px dashed rgba(127,127,127,.18); display: flex; align-items: flex-start; pointer-events: none; }.dsh-sched-tl-hour.zoomed { border-top-style: solid; border-top-color: rgba(127,127,127,.28); }.dsh-sched-tl-hour-label { font-size: 10px; font-family: monospace; color: rgba(127,127,127,.75); width: 38px; text-align: right; padding-right: 8px; margin-top: -7px; flex: none; select-none: none; }.dsh-sched-tl-sub-hour { position: absolute; left: 42px; right: 0; border-top: 1px dotted rgba(127,127,127,.12); pointer-events: none; }.dsh-sched-tl-now { position: absolute; left: 34px; right: 0; height: 2px; background: #cf222e; z-index: 10; pointer-events: none; }.dsh-sched-tl-now::before { content: ""; position: absolute; left: -4px; top: -3px; width: 8px; height: 8px; border-radius: 50%; background: #cf222e; }.dsh-sched-tl-now-label { position: absolute; right: 8px; top: -14px; font-size: 9px; font-family: monospace; background: #cf222e; color: #fff; padding: 1px 4px; border-radius: 3px; font-weight: 600; }.dsh-sched-tl-drop-preview { position: absolute; left: 44px; right: 8px; background: rgba(9,105,218,.18); border: 2px dashed #0969da; border-radius: 6px; z-index: 8; pointer-events: none !important; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #0969da; font-weight: 600; }.dsh-sched-tl-card { position: absolute; left: 44px; right: 8px; border-radius: 6px; border: 1px solid rgba(127,127,127,.24); background: var(--dsw-alias-bg-base, rgba(127,127,127,.1)); padding: 4px 8px; cursor: grab; z-index: 6; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; transition: box-shadow .15s, transform .15s; font-size: 11px; box-sizing: border-box; }.dsh-sched-tl-card:hover { border-color: #0969da; box-shadow: 0 4px 12px rgba(0,0,0,.15); z-index: 7; }.dsh-sched-tl-card:active { cursor: grabbing; }.dsh-sched-tl-card.done { opacity: .55; text-decoration: line-through; border-style: dashed; }.dsh-sched-tl-card .t-head { display: flex; align-items: center; justify-content: space-between; gap: 4px; }.dsh-sched-tl-card .t-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }.dsh-sched-tl-card .t-span { font-size: 9px; font-family: monospace; opacity: .8; flex: none; }.dsh-sched-tl-card .t-note { font-size: 10px; opacity: .75; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.dsh-sched-tl-unplaced { border-top: 1px solid rgba(127,127,127,.18); padding-top: 8px; margin-top: 8px; flex: none; max-height: 140px; overflow-y: auto; }.dsh-sched-tl-unplaced-title { font-size: 11px; font-weight: 600; color: rgba(127,127,127,.8); margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between; }.dsh-sched-tl-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; background: rgba(127,127,127,.1); border: 1px solid rgba(127,127,127,.25); border-radius: 6px; font-size: 11px; margin-right: 6px; margin-bottom: 6px; cursor: grab; user-select: none; }.dsh-sched-tl-chip:hover { border-color: #0969da; background: rgba(9,105,218,.1); }.dsh-sched-tl-hint { font-size: 10px; color: rgba(127,127,127,.65); }.dsh-sched-tl-scroll { pointer-events: auto !important; }.dsh-sched-tl-grid { pointer-events: auto !important; }.dsh-sched-tl-card { pointer-events: auto !important; }.dsh-sched-tl-hour { pointer-events: none !important; }.dsh-sched-tl-drop-preview { pointer-events: none !important; }.dsh-sched-quick-set { font-size: 10px; color: #0969da; cursor: pointer; padding: 2px 6px; border-radius: 4px; background: rgba(9,105,218,.12); border: 1px solid rgba(9,105,218,.25); margin-left: auto; }.dsh-sched-quick-set:hover { background: rgba(9,105,218,.22); }.dsh-sched-goalsbar{display:flex;align-items:center;gap:6px;padding:6px 14px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.18));flex:none;min-width:0;}.dsh-sched-goals-track{flex:1;min-width:0;display:flex;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-ms-overflow-style:none;touch-action:pan-y;overscroll-behavior-x:contain;user-select:none;}.dsh-sched-goals-track::-webkit-scrollbar{display:none;}.dsh-sched-goals-track.marquee{cursor:grab;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 18px,#000 calc(100% - 18px),transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 18px,#000 calc(100% - 18px),transparent 100%);}.dsh-sched-goals-track.dragging{cursor:grabbing;}.dsh-sched-goals-seq{display:flex;align-items:center;gap:6px;flex:none;padding-right:6px;}.dsh-sched-goalsbar::-webkit-scrollbar{height:4px;}.dsh-sched-goalsbar::-webkit-scrollbar-thumb{background:rgba(127,127,127,.3);border-radius:2px;}.dsh-sched-goalchip.idle{border-style:dashed;}.dsh-sched-goalchip-warn{font-size:10px;color:#d97706;flex:none;}.dsh-sched-add-hint{font-size:10px;color:rgba(127,127,127,.8);flex:none;display:inline-flex;align-items:center;gap:3px;}.dsh-sched-add-hint.warn{color:#d97706;}.dsh-sched-goalchip{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:14px;border:1px solid rgba(127,127,127,.28);background:rgba(127,127,127,.07);font-size:11px;cursor:pointer;white-space:nowrap;flex:none;transition:border-color .15s,background .15s;}.dsh-sched-goalchip:hover{border-color:rgba(127,127,127,.55);background:rgba(127,127,127,.13);}.dsh-sched-goalchip.done{opacity:.62;}.dsh-sched-goalchip.dropped{opacity:.42;text-decoration:line-through;}.dsh-sched-goalchip .gt{max-width:140px;overflow:hidden;text-overflow:ellipsis;font-weight:600;}.dsh-sched-goalchip .gp{font-family:monospace;font-size:10px;opacity:.85;flex:none;}.dsh-sched-goalbar{width:40px;height:5px;border-radius:3px;background:rgba(127,127,127,.22);overflow:hidden;flex:none;}.dsh-sched-goalbar>i{display:block;height:100%;border-radius:3px;background:#0969da;transition:width .3s;}.dsh-sched-goalbar.done>i{background:#2da44e;}.dsh-sched-goals-empty{font-size:11px;color:rgba(127,127,127,.7);cursor:pointer;padding:3px 9px;border-radius:8px;border:1px dashed rgba(127,127,127,.3);}.dsh-sched-goals-empty:hover{border-color:#0969da;color:#0969da;}.dsh-sched-goals-add{margin-left:auto;flex:none;font-size:11px;padding:3px 9px;border-radius:8px;border:1px solid rgba(9,105,218,.5);background:rgba(9,105,218,.08);color:#0969da;cursor:pointer;white-space:nowrap;}.dsh-sched-goals-add:hover{background:rgba(9,105,218,.16);}.dsh-sched-goalhead-btn{border:none;background:transparent;border-radius:6px;padding:3px 7px;font-size:13px;line-height:1.2;cursor:pointer;color:inherit;flex:none;}.dsh-sched-goalhead-btn:hover{background:rgba(127,127,127,.14);}.dsh-sched-goalhead-btn.on{background:rgba(9,105,218,.14);}.dsh-sched-goaldetail{padding:12px 14px 16px;display:flex;flex-direction:column;gap:12px;}.dsh-sched-goaldetail-title{font-size:16px;font-weight:600;line-height:1.5;word-break:break-word;}.dsh-sched-goaldetail-bar{height:9px;border-radius:5px;background:rgba(127,127,127,.2);overflow:hidden;}.dsh-sched-goaldetail-bar>i{display:block;height:100%;background:#0969da;transition:width .35s;}.dsh-sched-goaldetail-nums{display:flex;justify-content:space-between;align-items:baseline;font-size:12px;gap:8px;}.dsh-sched-goaldetail-nums .big{font-size:20px;font-weight:700;line-height:1;}.dsh-sched-goalsub{display:flex;gap:5px;flex-wrap:wrap;align-items:center;font-size:11px;}.dsh-sched-goalitem{display:flex;align-items:center;gap:7px;padding:5px 7px;border-radius:7px;}.dsh-sched-goalitem:hover{background:rgba(127,127,127,.1);}.dsh-sched-goalitem .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;}.dsh-sched-goalitem .t.done{text-decoration:line-through;opacity:.5;}.dsh-sched-goalbadge{display:inline-flex;align-items:center;gap:3px;max-width:118px;padding:0 6px;border-radius:9px;font-size:10px;line-height:16px;background:rgba(9,105,218,.1);color:#0969da;border:1px solid rgba(9,105,218,.25);cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.dsh-sched-goalbadge:hover{background:rgba(9,105,218,.2);}.dsh-sched-goal-gauge{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}.dsh-sched-tt{flex:none;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.18));padding:8px 14px 9px;max-height:40vh;overflow-y:auto;scrollbar-gutter:stable;}.dsh-sched-tt-head{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:rgba(127,127,127,.85);margin-bottom:7px;}.dsh-sched-tt-head .sum{margin-left:auto;font-weight:400;color:rgba(127,127,127,.65);}.dsh-sched-tt-bar{display:flex;gap:3px;margin-bottom:6px;}.dsh-sched-tt-cell{flex:1;height:3px;border-radius:2px;background:rgba(127,127,127,.22);}.dsh-sched-tt-cell.on{background:rgba(108,176,245,.55);}.dsh-sched-tt-cell.busy{background:#6cb0f5;}.dsh-sched-tt-cell.today{box-shadow:0 0 0 1px rgba(108,176,245,.9);}.dsh-sched-tt-day{display:flex;align-items:center;gap:8px;padding:3px 6px;border-radius:6px;}.dsh-sched-tt-day.today{background:rgba(108,176,245,.08);}.dsh-sched-tt-dl{flex:none;width:74px;font-size:11px;font-weight:600;color:rgba(127,127,127,.9);font-variant-numeric:tabular-nums;}.dsh-sched-tt-day.today .dsh-sched-tt-dl{color:#6cb0f5;}.dsh-sched-tt-cnt{font-size:11px;color:rgba(127,127,127,.6);}.dsh-sched-tt-off{font-size:11px;color:rgba(127,127,127,.35);}.dsh-sched-tt-slot{display:flex;align-items:center;gap:8px;padding:3px 6px;border-radius:6px;font-size:12px;cursor:pointer;}.dsh-sched-tt-slot:hover{background:rgba(127,127,127,.1);}.dsh-sched-tt-t{flex:none;width:74px;font-size:11px;color:rgba(127,127,127,.9);font-variant-numeric:tabular-nums;}.dsh-sched-tt-title{flex:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.dsh-sched-tt-slot.done .dsh-sched-tt-title{text-decoration:line-through;opacity:.45;}.dsh-sched-tt-slot.conflict .dsh-sched-tt-t,.dsh-sched-tt-warn{color:#e5534b;}.dsh-sched-tt-empty{padding:14px 6px;text-align:center;font-size:11px;color:rgba(127,127,127,.6);}.dsh-sched-row.soon{box-shadow:inset 3px 0 0 0 #6cb0f5;}.dsh-sched-row.soon .dsh-sched-title{color:#6cb0f5;}'

const FOCUS_SHIELD_CSS = `
.dsh-sched-hero{background:linear-gradient(180deg,#1f242e 0%,#171a21 100%);border:1px solid rgba(74,163,255,.35);border-radius:16px;padding:16px 18px;margin-bottom:14px;box-shadow:0 10px 28px rgba(0,0,0,.35),0 0 20px rgba(74,163,255,.07);display:flex;flex-direction:column;gap:12px;position:relative;overflow:hidden;}
.dsh-sched-hero::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#4aa3ff,#79c0ff,#58a6ff);}
.dsh-sched-hero-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;}
.dsh-sched-hero-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;}
.dsh-sched-hero-tag{font-size:11px;font-weight:600;color:#4aa3ff;background:rgba(74,163,255,.12);padding:2px 8px;border-radius:10px;display:inline-flex;align-items:center;gap:3px;border:1px solid rgba(74,163,255,.2);align-self:flex-start;}
.dsh-sched-hero-title{font-size:18px;font-weight:700;color:#fff;line-height:1.3;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsh-sched-hero-note{font-size:11px;color:rgba(127,127,127,.9);line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}
.dsh-sched-companion{width:84px;height:112px;border-radius:12px;overflow:hidden;position:relative;flex:none;box-shadow:0 6px 16px rgba(0,0,0,.45);border:1.5px solid rgba(74,163,255,.4);background:#0d0f12;cursor:pointer;transition:transform .2s;}
.dsh-sched-companion:hover{transform:scale(1.05);border-color:#79c0ff;}
.dsh-sched-companion video{width:100%;height:100%;object-fit:cover;object-position:center 18%;display:block;}
.dsh-sched-companion-badge{position:absolute;bottom:3px;left:50%;transform:translateX(-50%);background:rgba(13,15,18,.88);backdrop-filter:blur(4px);padding:1px 6px;border-radius:6px;font-size:9px;font-weight:600;color:#79c0ff;border:1px solid rgba(74,163,255,.3);white-space:nowrap;cursor:pointer;display:flex;align-items:center;gap:2px;}
.dsh-sched-companion-badge:hover{background:#0969da;color:#fff;}
.dsh-sched-dialogue{background:rgba(74,163,255,.08);border:1px solid rgba(74,163,255,.2);border-radius:8px;padding:6px 10px;font-size:11px;color:#dcebfa;display:flex;align-items:center;gap:6px;}
.dsh-sched-hero-btns{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.dsh-sched-hero-btn-main{border:none;border-radius:8px;padding:8px 10px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;background:#0969da;color:#fff;box-shadow:0 3px 10px rgba(9,105,218,.35);transition:all .15s;}
.dsh-sched-hero-btn-main:hover{background:#1177ee;}
.dsh-sched-hero-btn-micro{border:1px solid rgba(63,185,80,.35);border-radius:8px;padding:8px 10px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;background:rgba(63,185,80,.12);color:#7ee787;transition:all .15s;}
.dsh-sched-hero-btn-micro:hover{background:rgba(63,185,80,.2);}
.dsh-sched-drawer{background:rgba(127,127,127,.05);border:1px solid rgba(127,127,127,.15);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px;margin-bottom:12px;}
.dsh-sched-drawer-head{display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none;font-size:12px;font-weight:600;color:rgba(127,127,127,.9);}
.dsh-sched-drawer-cnt{background:rgba(255,255,255,.08);font-size:10px;padding:1px 5px;border-radius:8px;margin-left:4px;}
.dsh-sched-star-btn{background:transparent;border:1px solid rgba(255,255,255,.15);color:rgba(127,127,127,.9);font-size:10px;padding:2px 6px;border-radius:6px;cursor:pointer;}
.dsh-sched-star-btn:hover{border-color:#f1e05a;color:#f1e05a;}
.dsh-sched-quick-input{width:100%;background:rgba(0,0,0,.2);border:1px dashed rgba(127,127,127,.25);border-radius:8px;padding:6px 10px;font-size:11px;color:inherit;outline:none;box-sizing:border-box;}
.dsh-sched-quick-input:focus{border-style:solid;border-color:#0969da;}
.dsh-sched-wins{background:rgba(63,185,80,.05);border:1px solid rgba(63,185,80,.18);border-radius:8px;padding:8px 12px;display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#7ee787;margin-top:6px;}
.dsh-sched-resources{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:4px;}
.dsh-sched-resource-pill{display:inline-flex;align-items:center;gap:4px;background:rgba(74,163,255,.1);border:1px solid rgba(74,163,255,.3);color:#79c0ff;border-radius:12px;padding:3px 9px;font-size:11px;font-weight:500;cursor:pointer;transition:all .15s;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;user-select:none;}
.dsh-sched-resource-pill:hover{background:rgba(74,163,255,.22);border-color:#79c0ff;transform:translateY(-1px);color:#fff;}
.dsh-sched-resource-icon{font-size:12px;flex:none;}
`

const STYLE_ID = "@dsh-schedule/panel.css"

function ensureStyle() {
  const doc = globalThis.document
  if (doc === undefined) return
  if (doc.querySelector('style[data-plugin-css="' + STYLE_ID + '"]') !== null) return
  const el = doc.createElement('style')
  el.dataset.plugin = "dsh-schedule"
  el.dataset.pluginCss = STYLE_ID
  el.textContent = CSS + '\n' + FOCUS_SHIELD_CSS
  doc.head.appendChild(el)
}

function apply(ctx) {
  ensureStyle()
  const slots = ctx.slots
  if (slots === undefined) return
  const sessionsSvc = ctx.sessions
  // timer 不是 DSH 提供的服务(全环境无提供者),必须用 ctx.get 可选读取;
  // 直接读 ctx.timer 会因未声明 inject 而抛 "cannot get property without inject"。
  const timerSvc = ctx.get('timer')
  const sidebarRight = ctx.sidebarRight
  const sidebarRightTabs = ctx.sidebarRightTabs

  // 浏览器半身没有 timer 服务(ctx.get('timer') 恒为 undefined,DSH 只在宿主侧
  // 提供 cordis-plugin-timer),所以周期任务必须自带 window 定时器兜底:
  // 否则面板不会自刷新、"现在"红线不会走、tab 角标永远是旧值。
  // 统一返回一个 disposer,React 的 effect 清理和 ctx.effect 都能直接吃。
  function every(ms, fn) {
    if (timerSvc !== undefined && typeof timerSvc.interval === 'function') {
      const dispose = timerSvc.interval(fn, ms)
      return typeof dispose === 'function' ? dispose : () => {}
    }
    const id = setInterval(() => { try { fn() } catch (e) { console.error('[dsh-schedule] interval task failed', e) } }, ms)
    return () => clearInterval(id)
  }

  function after(ms, fn) {
    if (timerSvc !== undefined && typeof timerSvc.timeout === 'function') {
      const dispose = timerSvc.timeout(fn, ms)
      return typeof dispose === 'function' ? dispose : () => {}
    }
    const id = setTimeout(() => { try { fn() } catch (e) { console.error('[dsh-schedule] timeout task failed', e) } }, ms)
    return () => clearTimeout(id)
  }

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
    linker: false,
    data: null,
    subs: [],
    emit() { const list = store.subs.slice(); for (let i = 0; i < list.length; i++) { try { list[i]() } catch (e) {} } },
    subscribe(fn) { store.subs.push(fn); return () => { store.subs = store.subs.filter((f) => f !== fn) } },
    setLinker(v) { store.linker = v; store.emit() },
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

  function titleOf(id) {
    if (sessionsSvc !== undefined && sessionsSvc.list !== undefined) {
      try {
        const snap = sessionsSvc.list.getSnapshot()
        if (snap !== null && snap !== undefined && snap.byId !== undefined && snap.byId[id] !== undefined) {
          const row = snap.byId[id]
          if (row !== undefined) return row.displayTitle || row.title || String(id).slice(0, 8)
        }
      } catch (e) {}
    }
    return String(id || '').slice(0, 8)
  }

  function getActiveSessionId(props) {
    if (props !== null && props !== undefined && props.sessionId) return props.sessionId
    if (sessionsSvc !== undefined && sessionsSvc.list !== undefined) {
      try {
        const snap = sessionsSvc.list.getSnapshot()
        if (snap !== null && snap !== undefined && snap.current) return snap.current
      } catch (e) {}
    }
    return undefined
  }

  function openSession(id) {
    if (sessionsSvc !== undefined) {
      try { sessionsSvc.open(id) } catch (e) { console.error('[dsh-schedule] open session failed', e) }
    }
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

  // ---- 行 ----
  /** 距离开始还有 leadMinutes 分钟以内 —— 「即将开始」高亮用。 */
  function isStartingSoon(block, leadMinutes, now) {
    if (block === null || block === undefined || block.hasTime !== true) return false
    const d = now === undefined ? new Date() : now
    const nowM = d.getHours() * 60 + d.getMinutes()
    const diff = block.startMinutes - nowM
    return diff >= 0 && diff <= leadMinutes
  }

  // ---- 任务倒计时（每行右侧 ▶）：把一条日程当番茄钟来跑 ----
  // 时长优先取该条自己的时间块（endTime - startTime）；没有块就落回默认 25 分钟。
  // 状态落在 localStorage，所以刷新页面、切标签、关掉面板都不会把正在跑的倒计时弄丢。
  const CD_PREFIX = 'dsh-schedule:cd:v1:'
  const CD_DEFAULT_MIN = 25

  function cdRead(key) {
    try {
      const raw = window.localStorage.getItem(key)
      if (!raw) return null
      const t = JSON.parse(raw)
      if (!t || typeof t !== 'object' || typeof t.endsAt !== 'number') return null
      if (t.done) return { endsAt: t.endsAt, remainMs: 0, paused: false, done: true }
      if (t.paused) return { endsAt: t.endsAt, remainMs: typeof t.remainMs === 'number' ? t.remainMs : 0, paused: true, done: false }
      const remain = t.endsAt - Date.now()
      if (remain <= 0) return { endsAt: t.endsAt, remainMs: 0, paused: false, done: true }
      return { endsAt: t.endsAt, remainMs: remain, paused: false, done: false }
    } catch (e) {
      return null
    }
  }

  function cdWrite(key, value) {
    try {
      if (value) window.localStorage.setItem(key, JSON.stringify(value))
      else window.localStorage.removeItem(key)
    } catch (e) {
      // 隐私模式 / 配额满：倒计时仍可用，只是不跨刷新保存
    }
  }

  function cdMinutesOf(item) {
    const a = String(item.startTime || '').split(':')
    const b = String(item.endTime || '').split(':')
    if (a.length === 2 && b.length === 2) {
      const s = Number(a[0]) * 60 + Number(a[1])
      const e = Number(b[0]) * 60 + Number(b[1])
      if (Number.isFinite(s) && Number.isFinite(e) && e > s) return e - s
    }
    return CD_DEFAULT_MIN
  }

  function cdText(ms) {
    const total = Math.max(0, Math.round(ms / 1000))
    const m = Math.floor(total / 60)
    const s = total % 60
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s
  }

  function cdNotify(item) {
    try {
      if (typeof Notification === 'undefined') return
      if (Notification.permission === 'granted') {
        new Notification('时间到：' + item.title, { body: '这一轮倒计时结束了' })
      }
    } catch (e) {
      // 没有通知权限就不提醒，界面上的 ⏰ 仍然是可见的
    }
  }

  const CD_STYLE_IDLE = {
    flex: 'none', border: '1px solid rgba(127,127,127,0.55)', background: 'transparent',
    color: 'inherit', opacity: 0.8, borderRadius: '8px', padding: '0 6px', fontSize: '12px',
    lineHeight: '20px', cursor: 'pointer', fontVariantNumeric: 'tabular-nums',
  }
  const CD_STYLE_RUN = {
    flex: 'none', display: 'inline-flex', alignItems: 'center', gap: '2px',
    border: '1px solid #0969da', color: '#0969da', borderRadius: '8px', padding: '0 4px',
    fontSize: '12px', lineHeight: '20px', fontVariantNumeric: 'tabular-nums',
  }
  const CD_STYLE_PAUSED = {
    flex: 'none', display: 'inline-flex', alignItems: 'center', gap: '2px',
    border: '1px solid rgba(127,127,127,0.55)', color: 'rgba(127,127,127,0.95)', borderRadius: '8px',
    padding: '0 4px', fontSize: '12px', lineHeight: '20px', fontVariantNumeric: 'tabular-nums',
  }
  const CD_STYLE_DONE = {
    flex: 'none', border: '1px solid #bf8700', background: 'transparent', color: '#bf8700',
    borderRadius: '8px', padding: '0 6px', fontSize: '12px', lineHeight: '20px', cursor: 'pointer',
  }
  const CD_STYLE_ICO = {
    border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer',
    fontSize: '11px', padding: '0 2px', lineHeight: '20px',
  }

  // ---- 倒计时的全局状态 ----
  // localStorage 是唯一真相来源，内存里加一层订阅：行内的小秒表和 shell.overlay 里的
  // 大面板读同一份状态，所以在哪边暂停都一样。关掉大面板只是把它转成 paused，
  // 下次点行内的秒数、或再点 ▶，都从真实剩余时间接着走（不从 0 重来）。
  const cdSubs = []
  const cdFocusSubs = []
  let cdMem = null
  let cdTickDispose = null
  let cdFocused = null

  function cdAll() {
    if (cdMem) return cdMem
    cdMem = {}
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i)
        if (!k || k.indexOf(CD_PREFIX) !== 0) continue
        const st = cdRead(k)
        if (st) cdMem[k] = st
      }
    } catch (e) {
      cdMem = {}
    }
    return cdMem
  }

  function cdRunning(st) {
    return !!st && !st.done && !st.paused
  }

  function cdState(key) {
    return cdAll()[key] || null
  }

  function cdRemain(st) {
    if (!st || st.done) return 0
    if (st.paused) return Math.max(0, st.remainMs || 0)
    return Math.max(0, st.endsAt - Date.now())
  }

  function cdSyncTicker() {
    const all = cdAll()
    const anyRunning = Object.keys(all).some(function (k) { return cdRunning(all[k]) })
    if (anyRunning && !cdTickDispose) {
      cdTickDispose = every(1000, cdTick)
    } else if (!anyRunning && cdTickDispose) {
      cdTickDispose()
      cdTickDispose = null
    }
  }

  function cdEmit() {
    for (const fn of cdSubs.slice()) { try { fn() } catch (e) { /* 单个订阅失败不影响其它 */ } }
    for (const fn of cdFocusSubs.slice()) { try { fn() } catch (e) { /* ignore */ } }
    cdSyncTicker()
  }

  function cdTick() {
    const all = cdAll()
    let finished = null
    Object.keys(all).forEach(function (k) {
      const st = all[k]
      if (!cdRunning(st)) return
      if (st.endsAt - Date.now() <= 0) {
        all[k] = { endsAt: st.endsAt, totalMs: st.totalMs, remainMs: 0, paused: false, done: true, title: st.title }
        cdWrite(k, all[k])
        finished = all[k]
      }
    })
    if (finished) cdNotify({ title: finished.title || '任务' })
    cdEmit()
  }

  function cdSubscribe(fn) {
    cdSubs.push(fn)
    cdSyncTicker()
    return function () {
      const i = cdSubs.indexOf(fn)
      if (i >= 0) cdSubs.splice(i, 1)
    }
  }

  function cdSet(key, st) {
    cdAll()
    if (st) cdMem[key] = st
    else delete cdMem[key]
    cdWrite(key, st)
    cdEmit()
  }

  function cdFocus(key) {
    cdFocused = key
    for (const fn of cdFocusSubs.slice()) { try { fn() } catch (e) { /* ignore */ } }
  }

  function cdStart(key, item, customMinutes) {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission()
    } catch (e) { /* 通知不可用就只靠界面提示 */ }
    const mins = typeof customMinutes === 'number' && customMinutes > 0 ? customMinutes : cdMinutesOf(item)
    const ms = mins * 60000
    cdSet(key, { endsAt: Date.now() + ms, totalMs: ms, remainMs: ms, paused: false, done: false, title: item.title, isMicro: mins === 5 })
    cdFocus(key)
  }

  function cdPauseResume(key) {
    const st = cdState(key)
    if (!st || st.done) return
    if (st.paused) {
      const ms = Math.max(1000, st.remainMs || 0)
      cdSet(key, { endsAt: Date.now() + ms, totalMs: st.totalMs || ms, remainMs: ms, paused: false, done: false, title: st.title })
    } else {
      cdSet(key, { endsAt: st.endsAt, totalMs: st.totalMs, remainMs: Math.max(0, st.endsAt - Date.now()), paused: true, done: false, title: st.title })
    }
  }

  function cdStop(key) {
    cdSet(key, null)
    if (cdFocused === key) cdFocus(null)
  }

  // 大面板里点「完成」：直接落库 set-done，再收掉倒计时（key 就是 id|日期）
  function cdMarkDone(key) {
    const parts = String(key).split('|')
    const id = parts[0]
    const date = parts[1] || ''
    cdStop(key)
    if (!id) return
    api('set-done', { id: id, date: date, done: true }).catch(function () { /* 失败就留给人手点 */ })
  }

  function useCountdown(key, item) {
    const [, bump] = React.useReducer(function (x) { return x + 1 }, 0)
    React.useEffect(function () { return cdSubscribe(bump) }, [])
    const state = cdState(key)
    return {
      key: key,
      state: state,
      minutes: cdMinutesOf(item),
      remain: cdRemain(state),
      start: function (customMinutes) { cdStart(key, item, customMinutes) },
      toggle: function () { cdPauseResume(key) },
      stop: function () { cdStop(key) },
      open: function () { cdFocus(key) },
    }
  }

  // ---- 大倒计时面板（挂在 shell.overlay，全屏浮层）----
  const CD_FS = {
    position: 'fixed', inset: '0', zIndex: 4000, background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  const CD_ICONBTN = {
    flex: 'none', border: '1px solid rgba(127,127,127,0.45)', background: 'transparent',
    color: 'inherit', opacity: 0.85, borderRadius: '8px', width: '28px', height: '26px',
    fontSize: '13px', lineHeight: '24px', cursor: 'pointer', padding: 0,
  }
  const CD_BTN_MAIN = {
    flex: '1', border: '1px solid #0969da', background: 'rgba(9,105,218,0.12)', color: '#4aa3ff',
    borderRadius: '10px', padding: '9px 14px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
  }
  const CD_BTN_SUB = {
    flex: 'none', border: '1px solid rgba(127,127,127,0.45)', background: 'transparent',
    color: 'inherit', opacity: 0.85, borderRadius: '10px', padding: '9px 14px', fontSize: '14px', cursor: 'pointer',
  }

  function CountdownOverlay() {
    const focused = (function () {
      const [, force] = React.useReducer(function (x) { return x + 1 }, 0)
      React.useEffect(function () {
        cdFocusSubs.push(force)
        return function () {
          const i = cdFocusSubs.indexOf(force)
          if (i >= 0) cdFocusSubs.splice(i, 1)
        }
      }, [])
      return cdFocused
    })()
    const [, bump] = React.useReducer(function (x) { return x + 1 }, 0)
    const [expanded, setExpanded] = React.useState(false)
    React.useEffect(function () { return cdSubscribe(bump) }, [])

    if (!focused) return null
    const st = cdState(focused)
    if (!st) return null

    const remain = cdRemain(st)
    const total = st.totalMs || 1
    const ratio = Math.max(0, Math.min(1, remain / total))
    const accent = st.done ? '#bf8700' : st.paused ? 'rgba(150,150,150,1)' : '#4aa3ff'
    const R = 84
    const CIRC = 2 * Math.PI * R
    const ringSize = expanded ? 320 : 190

    function close() {
      const cur = cdState(focused)
      // 「退出」= 暂停并保留进度：以后点行内秒数或 ▶ 都能接着走
      if (cur && cdRunning(cur)) cdPauseResume(focused)
      cdFocus(null)
    }

    const card = {
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: expanded ? '22px' : '14px',
      width: expanded ? '100%' : '100%', maxWidth: expanded ? 'none' : '380px',
      height: expanded ? '100%' : 'auto',
      justifyContent: expanded ? 'center' : 'flex-start',
      padding: expanded ? '32px' : '18px 18px 16px',
      background: expanded ? 'rgba(20,22,27,0.98)' : 'rgba(26,28,34,0.99)',
      border: expanded ? 'none' : '1px solid rgba(127,127,127,0.35)',
      borderRadius: expanded ? '0' : '16px',
      boxShadow: expanded ? 'none' : '0 20px 56px rgba(0,0,0,0.5)',
      color: 'inherit',
    }

    const header = React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%' } },
      React.createElement('div', {
        style: {
          flex: '1', minWidth: 0, fontSize: expanded ? '22px' : '14px', fontWeight: 600,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        },
        title: st.title || '',
      }, st.title || '倒计时'),
      React.createElement('button', {
        style: CD_ICONBTN,
        title: expanded ? '还原窗口大小' : '放大占满整个界面',
        onClick: function () { setExpanded(!expanded) },
      }, expanded ? '⤡' : '⤢'),
      React.createElement('button', {
        style: CD_ICONBTN,
        title: '关闭（暂停并保留进度，随时可继续）',
        onClick: close,
      }, '✕'),
    )

    const ring = React.createElement('div', {
      style: {
        position: 'relative', width: ringSize + 'px', height: ringSize + 'px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      },
    },
      React.createElement('svg', {
        width: ringSize, height: ringSize, viewBox: '0 0 200 200',
        style: { position: 'absolute', inset: 0, transform: 'rotate(-90deg)' },
      },
        React.createElement('circle', { cx: 100, cy: 100, r: R, fill: 'none', stroke: 'rgba(127,127,127,0.22)', strokeWidth: 9 }),
        React.createElement('circle', {
          cx: 100, cy: 100, r: R, fill: 'none', stroke: accent, strokeWidth: 9, strokeLinecap: 'round',
          strokeDasharray: CIRC.toFixed(2), strokeDashoffset: (CIRC * (1 - ratio)).toFixed(2),
        }),
      ),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' } },
        React.createElement('div', {
          style: {
            fontSize: expanded ? '76px' : '34px', fontWeight: 700, letterSpacing: '1px',
            fontVariantNumeric: 'tabular-nums', color: accent, lineHeight: 1.05,
          },
        }, st.done ? '时间到' : cdText(remain)),
        React.createElement('div', { style: { fontSize: expanded ? '14px' : '12px', opacity: 0.65 } },
          st.done ? '这一轮结束了' : st.paused ? '已暂停 · 随时继续' : '坚持'),
      ),
    )

    const controls = React.createElement('div', { style: { display: 'flex', gap: '10px', width: '100%' } },
      st.done
        ? React.createElement('button', { style: CD_BTN_MAIN, onClick: function () { cdMarkDone(focused) } }, '✓ 完成')
        : React.createElement('button', { style: CD_BTN_MAIN, onClick: function () { cdPauseResume(focused) } },
            st.paused ? '▶ 继续' : '⏸ 暂停'),
      st.done
        ? React.createElement('button', { style: CD_BTN_SUB, onClick: function () { cdStop(focused) } }, '✕ 收掉')
        : React.createElement('button', { style: CD_BTN_SUB, onClick: function () { cdStop(focused) } }, '⏹ 结束'),
    )

    // 尝试在底层日程里找到该条目的完整数据(展示关联资料)
    const activeItem = (function () {
      if (!focused || !store || !store.data || !Array.isArray(store.data.items)) return null
      const idPart = focused.replace(CD_PREFIX, '').split('|')[0]
      return store.data.items.find((it) => it.id === idPart) || null
    })()

    const resourcePillBar = activeItem && getResourcesOfItem(activeItem).length > 0
      ? React.createElement('div', { style: { display: 'flex', justifyContent: 'center', width: '100%', margin: '4px 0' } },
          React.createElement(ResourcePills, { resources: getResourcesOfItem(activeItem) })
        )
      : null

    return React.createElement('div', {
      style: CD_FS,
      onClick: function (e) { if (e.target === e.currentTarget) close() },
    }, React.createElement('div', { style: card }, header, ring, resourcePillBar, controls))
  }

  // ---- 伴工 (大肥鱼) 存储与组件 ----
  const COMPANION_KEY = 'dsh-schedule:companion:name'
  function getCompanionName() {
    try {
      const n = window.localStorage.getItem(COMPANION_KEY)
      if (n && n.trim()) return n.trim()
    } catch (e) {}
    return DEFAULT_COMPANION_NAME
  }

  function setCompanionName(val) {
    const clean = normalizeCompanionName(val)
    try { window.localStorage.setItem(COMPANION_KEY, clean) } catch (e) {}
    return clean
  }

  function CompanionBox(props) {
    const name = props.name || DEFAULT_COMPANION_NAME
    const onRename = props.onRename
    const onInteract = props.onInteract

    return React.createElement('div', {
      className: 'dsh-sched-companion',
      onClick: onInteract,
      title: '点击互动，点底部徽章可改名',
    },
      React.createElement('video', {
        src: typeof COMPANION_VIDEO_SRC !== 'undefined' ? COMPANION_VIDEO_SRC : '/api/dailytask/companion-video',
        autoPlay: true,
        loop: true,
        muted: true,
        playsInline: true,
      }),
      React.createElement('div', {
        className: 'dsh-sched-companion-badge',
        onClick: (e) => {
          e.stopPropagation()
          if (typeof onRename === 'function') onRename()
        },
        title: '点我为伴工自定义改名',
      },
        React.createElement('span', null, name),
        ' ✎',
      )
    )
  }

  function openResourceItem(res) {
    if (!res || !res.uri) return
    const uri = String(res.uri).trim()
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      try {
        window.open(uri, '_blank', 'noopener,noreferrer')
        return
      } catch (e) {}
    }
    // 本地文件或浏览器拦截弹窗时由宿主端打开
    call('open-resource', { uri }).catch((err) => {
      alert('打开资料失败: ' + (err && err.message ? err.message : String(err)))
    })
  }

  function getResourcesOfItem(item) {
    if (!item) return []
    if (Array.isArray(item.resources) && item.resources.length > 0) {
      return item.resources
    }
    // 兼容宿主端旧进程尚未完全重启时，从扩展字段 resources_cache 读取
    try {
      if (store && store.data && store.data.resources_cache && store.data.resources_cache[item.id]) {
        return store.data.resources_cache[item.id]
      }
    } catch (e) {}
    // 本地缓存备份
    try {
      const raw = window.localStorage.getItem('dsh-schedule:res:' + item.id)
      if (raw) return JSON.parse(raw)
    } catch (e) {}
    return []
  }

  function ResourcePills(props) {
    const list = Array.isArray(props.resources) ? props.resources : []
    if (list.length === 0) return null
    const pills = []
    for (let i = 0; i < list.length; i++) {
      const r = list[i]
      if (!r || !r.uri) continue
      const icon = inferResourceIcon(r.uri)
      const title = r.title || inferResourceTitle(r.uri, '')
      pills.push(React.createElement('div', {
        key: r.uri + '_' + i,
        className: 'dsh-sched-resource-pill',
        onClick: (e) => {
          e.stopPropagation()
          openResourceItem(r)
        },
        title: '点一下打开：' + r.uri,
      },
        React.createElement('span', { className: 'dsh-sched-resource-icon' }, icon),
        React.createElement('span', null, title),
        React.createElement('span', { style: { fontSize: '9px', opacity: 0.6 } }, '↗'),
      ))
    }
    return React.createElement('div', { className: 'dsh-sched-resources' }, pills)
  }

  function FocusShieldHero(props) {
    const { item, today, companionName, onRenameCompanion, onMutate, onOpenDetail } = props
    if (!item) {
      return React.createElement('div', { className: 'dsh-sched-hero' },
        React.createElement('div', { className: 'dsh-sched-hero-top' },
          React.createElement('div', { className: 'dsh-sched-hero-info' },
            React.createElement('div', { className: 'dsh-sched-hero-tag' }, '✨ 今日清爽'),
            React.createElement('div', { className: 'dsh-sched-hero-title' }, '今天所有核心怪兽已击倒！'),
            React.createElement('div', { className: 'dsh-sched-hero-note' }, companionName + '正在旁边优哉游哉休息，享受当下的轻松时光吧。')
          ),
          React.createElement(CompanionBox, { name: companionName, onRename: onRenameCompanion })
        ),
        React.createElement('div', { className: 'dsh-sched-dialogue' },
          '今天表现超神！' + companionName + '随时陪你开启下一个新挑战。'
        )
      )
    }

    const cdKey = CD_PREFIX + item.id + '|' + today
    const cd = useCountdown(cdKey, item)
    const mins = cdMinutesOf(item)

    const qThemeTags = {
      q1: '⚡ #硬核攻坚 · 今日主角',
      q2: '🌱 #关键突破 · 今日主角',
      q3: '🏃 #敏捷清理 · 今日主角',
      q4: '☕ #随性拾遗 · 今日主角',
    }
    const tag = qThemeTags[item.quadrant] || '⚡ #今日主角'

    const dialogueText = cd.state && !cd.state.done
      ? (cd.state.paused
          ? '进度帮你封存好啦，喝口水伸个懒腰，' + companionName + '等你回来～'
          : (cd.state.isMicro
              ? '冲 5 分钟就撤！' + companionName + '戴好拳套陪你并肩破冰！'
              : '深海心流护盾开启！外面吵吵闹闹的都交给我挡着！'))
      : ('我在呢，今天想先攻哪一小步？' + companionName + '陪你。')

    return React.createElement('div', { className: 'dsh-sched-hero' },
      React.createElement('div', { className: 'dsh-sched-hero-top' },
        React.createElement('div', { className: 'dsh-sched-hero-info' },
          React.createElement('div', { className: 'dsh-sched-hero-tag' }, tag),
          React.createElement('div', {
            className: 'dsh-sched-hero-title',
            style: { cursor: 'pointer' },
            onClick: () => onOpenDetail(item.id),
            title: '点击查看详情',
          }, item.title),
          React.createElement('div', { className: 'dsh-sched-hero-note' },
            item.note || (companionName + '已就位，陪你一起啃下这块硬骨头。')
          ),
          React.createElement(ResourcePills, { resources: getResourcesOfItem(item) })
        ),
        React.createElement(CompanionBox, { name: companionName, onRename: onRenameCompanion })
      ),
      React.createElement('div', { className: 'dsh-sched-dialogue' }, dialogueText),
      cd.state !== null
        ? React.createElement('div', {
            style: {
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(0,0,0,0.25)', padding: '8px 12px', borderRadius: '10px',
              border: '1px solid ' + (cd.state.done ? '#bf8700' : cd.state.paused ? 'rgba(127,127,127,0.4)' : '#0969da'),
            }
          },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              React.createElement('span', {
                style: {
                  fontSize: '22px', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                  color: cd.state.done ? '#bf8700' : cd.state.paused ? 'rgba(127,127,127,0.9)' : '#4aa3ff',
                }
              }, cd.state.done ? '时间到！🎉' : cdText(cd.remain)),
              React.createElement('span', { style: { fontSize: '11px', opacity: 0.7 } },
                cd.state.done ? '大胜拿下！' : cd.state.paused ? '已暂停' : (cd.state.isMicro ? '微破冰中' : '专注心流中')
              )
            ),
            React.createElement('div', { style: { display: 'flex', gap: '6px' } },
              cd.state.done
                ? React.createElement('button', {
                    className: 'dsh-sched-hero-btn-main',
                    style: { padding: '5px 12px', background: '#2da44e' },
                    onClick: () => {
                      cd.stop()
                      onMutate('set-done', { id: item.id, date: today, done: true })
                    }
                  }, '✓ 击倒怪物')
                : React.createElement('button', {
                    className: 'dsh-sched-hero-btn-main',
                    style: { padding: '5px 10px' },
                    onClick: () => cd.toggle()
                  }, cd.state.paused ? '▶ 继续' : '⏸ 暂停'),
              cd.state.done ? null : React.createElement('button', {
                className: 'dsh-sched-hero-btn-micro',
                style: { padding: '5px 8px', color: 'inherit', borderColor: 'rgba(127,127,127,0.3)' },
                onClick: () => cd.open(),
                title: '打开大面板',
              }, '⤢ 放大'),
              React.createElement('button', {
                className: 'dsh-sched-hero-btn-micro',
                style: { padding: '5px 8px', color: 'inherit', borderColor: 'rgba(127,127,127,0.3)' },
                onClick: () => cd.stop(),
                title: '结束倒计时',
              }, '⏹')
            )
          )
        : React.createElement('div', { className: 'dsh-sched-hero-btns' },
            React.createElement('button', {
              className: 'dsh-sched-hero-btn-main',
              onClick: () => cd.start(),
              title: '开启深度专注倒计时',
            },
              React.createElement('span', null, '▶'),
              ' 开始专注 (' + mins + 'm)'
            ),
            React.createElement('button', {
              className: 'dsh-sched-hero-btn-micro',
              onClick: () => cd.start(5),
              title: '5 分钟微破冰点火：毫无压力，只看一眼题目就放行！',
            },
              React.createElement('span', null, '🌱'),
              ' 先做5分钟 (微破冰)'
            )
          )
    )
  }

  function ScheduleRow(props) {
    const { item, dateStr, done, currentSessionId, onMutate, onOpenDetail, onOpenEdit } = props
    const [confirmDel, setConfirmDel] = React.useState(false)
    React.useEffect(() => {
      if (!confirmDel) return undefined
      return after(3000, () => setConfirmDel(false))
    }, [confirmDel])
    // 倒计时：按「这一条 + 这一天」存，同一任务的不同日期互不干扰
    const cd = useCountdown(CD_PREFIX + item.id + '|' + (dateStr || ''), item)
    const links = Array.isArray(item.linkedSessions) ? item.linkedSessions : []
    const linkedHere = links.indexOf(currentSessionId) !== -1
    const chips = []
    for (let i = 0; i < links.length; i++) {
      const sid = links[i]
      chips.push(React.createElement('span', {
        key: sid, className: 'dsh-sched-chip' + (sid === currentSessionId ? ' current' : ''),
        title: '打开会话: ' + sid,
        onClick: () => openSession(sid),
      }, titleOf(sid)))
    }
    const meta = []
    const qLabels = { q1: '🔴 重要紧急', q2: '🟡 重要不紧急', q3: '🔵 紧急不重要', q4: '🟢 不重要不紧急' }
    if (item.quadrant && qLabels[item.quadrant]) {
      meta.push(React.createElement('span', { key: 'q', className: 'dsh-sched-pill' }, qLabels[item.quadrant]))
    }
    // 目标归属徽标:点一下直接跳到该目标详情
    const goalOfItem = (function () {
      if (!item.goalId) return null
      const d = store.data
      if (d === null || d === undefined || !Array.isArray(d.goals)) return null
      return d.goals.find((g) => g.id === item.goalId) || null
    })()
    if (goalOfItem !== null) {
      meta.push(React.createElement('span', {
        key: 'goal',
        className: 'dsh-sched-goalbadge',
        title: '归属目标: ' + goalOfItem.title + '(点击查看)',
        onClick: (e) => {
          e.stopPropagation()
          if (typeof store.openGoal === 'function') store.openGoal(goalOfItem.id)
        },
      }, '🎯 ' + goalOfItem.title))
    }
    const tb = parseTimeBlock(item)
    if (tb.hasTime) {
      meta.push(React.createElement('span', { key: 't', className: 'dsh-sched-pill' }, tb.startTime + (tb.isRange ? ' - ' + tb.endTime : '')))
    } else if (item.time) {
      meta.push(React.createElement('span', { key: 't', className: 'dsh-sched-pill' }, item.time))
    }
    const rl = recurringLabel(item)
    if (rl) meta.push(React.createElement('span', { key: 'r', className: 'dsh-sched-pill' }, rl))
    if (item.carryOver && item.recurring === 'once') {
      meta.push(React.createElement('span', {
        key: 'co', className: 'dsh-sched-pill', title: '未完成时自动顺延到第二天',
      }, '顺延'))
    }
    if (item.note) meta.push(React.createElement('span', { key: 'n', className: 'dsh-sched-note' }, item.note))
    const titleCls = 'dsh-sched-title' + (done ? ' done' : '') + (links.length > 0 ? ' linked' : '')
    // 10 分钟内即将开始 —— 提醒的视觉侧,与邮件同时生效
    const soon = !done && isStartingSoon(tb, 10)
    return React.createElement('div', { className: 'dsh-sched-row' + (soon ? ' soon' : '') },
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
      cd.state === null
        ? React.createElement('button', {
            style: CD_STYLE_IDLE,
            title: '开始倒计时（' + cd.minutes + ' 分钟）',
            onClick: () => cd.start(),
          }, '▶')
        : React.createElement('button', {
            style: cd.state.done ? CD_STYLE_DONE : (cd.state.paused ? CD_STYLE_PAUSED : CD_STYLE_RUN),
            title: cd.state.done
              ? '时间到 —— 点开大面板标记完成'
              : cd.state.paused ? '已暂停 · 点开继续' : '倒计时中 · 点开大面板',
            onClick: () => cd.open(),
          }, cd.state.done ? '⏰✓' : cdText(cd.remain) + (cd.state.paused ? ' ⏸' : '')),
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
    const { onMutate, onCancel, initialStartTime, initialEndTime, goals, initialGoalId } = props
    const [title, setTitle] = React.useState('')
    const [date, setDate] = React.useState('')
    const [recurring, setRecurring] = React.useState('once')
    const [weekdays, setWeekdays] = React.useState([])
    const [startTime, setStartTime] = React.useState(initialStartTime || '')
    const [endTime, setEndTime] = React.useState(initialEndTime || '')
    const [quadrant, setQuadrant] = React.useState('q2')
    const [note, setNote] = React.useState('')
    const [carryOver, setCarryOver] = React.useState(false)
    // 归属目标:允许在**新建时**就挂上,不必等建完再进详情改
    const [goalId, setGoalId] = React.useState(initialGoalId || '')
    function toggleWd(n) {
      setWeekdays(weekdays.indexOf(n) === -1 ? weekdays.concat([n]).sort() : weekdays.filter((x) => x !== n))
    }
    async function add() {
      const t = title.trim()
      if (t === '') return
      const s = startTime.trim()
      const e = endTime.trim()
      const timeVal = s ? (e ? s + '-' + e : s) : undefined
      await onMutate('add', {
        title: t,
        recurring,
        date: date || undefined,
        weekdays: recurring === 'weekly' ? weekdays.slice() : undefined,
        time: timeVal,
        startTime: s || undefined,
        endTime: e || undefined,
        quadrant,
        goalId: goalId || undefined,
        note: note || undefined,
        carryOver: recurring === 'once' ? carryOver : undefined,
      })
      setTitle(''); setDate(''); setRecurring('once'); setWeekdays([]); setStartTime(''); setEndTime(''); setQuadrant('q2'); setNote(''); setCarryOver(false); setGoalId('')
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
    
    // 起止时间排程输入框
    opts.push(React.createElement('input', {
      key: 'st', type: 'time', className: 'dsh-sched-input', style: { flex: 'none', width: 95 },
      title: '起始时间', value: startTime, onChange: (e) => setStartTime(e.target.value),
    }))
    opts.push(React.createElement('span', { key: 't_sep', style: { fontSize: 11, opacity: .7 } }, '~'))
    opts.push(React.createElement('input', {
      key: 'et', type: 'time', className: 'dsh-sched-input', style: { flex: 'none', width: 95 },
      title: '结束时间(可选)', value: endTime, onChange: (e) => setEndTime(e.target.value),
    }))

    // 象限选择
    opts.push(React.createElement('select', {
      key: 'quad', className: 'dsh-sched-input', style: { flex: 'none' },
      value: quadrant, onChange: (e) => setQuadrant(e.target.value),
    },
      React.createElement('option', { value: 'q1' }, '🔴 重要 · 紧急'),
      React.createElement('option', { value: 'q2' }, '🟡 重要 · 不紧急'),
      React.createElement('option', { value: 'q3' }, '🔵 紧急 · 不重要'),
      React.createElement('option', { value: 'q4' }, '🟢 不重要 · 不紧急'),
    ))

    // 目标归属:有目标才显示选择器;没归属时给一句轻提示(提醒而不是拦着)
    const pickableGoals = Array.isArray(goals) ? goals.filter((g) => g.status !== 'dropped') : []
    if (pickableGoals.length > 0) {
      opts.push(React.createElement('select', {
        key: 'goal', className: 'dsh-sched-input', style: { flex: 'none', maxWidth: 168 },
        title: '把这条日程归属到长期目标 —— 归属后可在目标详情里看到它,也能按目标统计推进',
        value: goalId, onChange: (e) => setGoalId(e.target.value),
      },
        React.createElement('option', { value: '' }, '🎯 不归属目标'),
        pickableGoals.map((g) => React.createElement('option', { key: g.id, value: g.id }, g.title)),
      ))
      if (goalId === '') {
        opts.push(React.createElement('span', {
          key: 'goal_hint', className: 'dsh-sched-add-hint warn',
          title: '挂到目标上之后,这条日程的完成会算进该目标的进度,也更容易在回顾里看到它服务的是什么',
        }, '未归属目标'))
      }
    }

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
    const { data, item, currentSessionId, onMutate, onBack, onEdit } = props
    const [confirmDel, setConfirmDel] = React.useState(false)
    React.useEffect(() => {
      if (!confirmDel) return undefined
      return after(3000, () => setConfirmDel(false))
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
    const qLabels = { q1: '🔴 重要紧急', q2: '🟡 重要不紧急', q3: '🔵 紧急不重要', q4: '🟢 不重要不紧急' }
    if (item.quadrant && qLabels[item.quadrant]) {
      pills.push(React.createElement('span', { key: 'q', className: 'dsh-sched-pill' }, qLabels[item.quadrant]))
    }
    const rl = recurringLabel(item)
    pills.push(React.createElement('span', { key: 'r', className: 'dsh-sched-pill' },
      rl || '一次性' + (item.recurring === 'once' && item.date ? ' · ' + item.date : '')))
    if (item.recurring === 'once' && rl) pills.push(React.createElement('span', { key: 'd', className: 'dsh-sched-pill' }, item.date))
    const tb = parseTimeBlock(item)
    if (tb.hasTime) {
      pills.push(React.createElement('span', { key: 't', className: 'dsh-sched-pill' },
        tb.startTime + (tb.isRange ? ' - ' + tb.endTime : '') + ' (' + formatDuration(tb.durationMinutes) + ')'))
    } else if (item.time) {
      pills.push(React.createElement('span', { key: 't', className: 'dsh-sched-pill' }, item.time))
    }
    if (item.carryOver && item.recurring === 'once') pills.push(React.createElement('span', { key: 'co', className: 'dsh-sched-pill' }, '未完成自动顺延'))
    const chips = []
    for (let i = 0; i < links.length; i++) {
      const sid = links[i]
      chips.push(React.createElement('span', {
        key: sid, className: 'dsh-sched-chip' + (sid === currentSessionId ? ' current' : ''),
        title: '打开会话: ' + sid,
        onClick: () => openSession(sid),
      }, titleOf(sid)))
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
        React.createElement('div', { className: 'dsh-sched-section-label' }, '📎 关联资料(网课/文件)'),
        Array.isArray(item.resources) && item.resources.length > 0
          ? React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
              item.resources.map((r, idx) => React.createElement('div', {
                key: r.uri + '_' + idx,
                style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '5px 8px', borderRadius: '8px' }
              },
                React.createElement('div', {
                  style: { display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', flex: 1, overflow: 'hidden' },
                  onClick: () => openResourceItem(r),
                  title: '点击打开: ' + r.uri
                },
                  React.createElement('span', null, inferResourceIcon(r.uri)),
                  React.createElement('span', { style: { fontSize: '12px', color: '#79c0ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.title || r.uri),
                  React.createElement('span', { style: { fontSize: '10px', opacity: 0.6 } }, '↗')
                ),
                React.createElement('button', {
                  className: 'dsh-sched-del',
                  title: '移除该资料',
                  onClick: () => {
                    const next = (item.resources || []).filter((_, i) => i !== idx)
                    onMutate('update', { id: item.id, resources: next })
                  }
                }, '✕')
              ))
            )
          : React.createElement('div', { className: 'dsh-sched-note-empty' }, '尚未关联任何资料'),
        React.createElement('div', { style: { display: 'flex', gap: '6px', marginTop: '4px' } },
          React.createElement('input', {
            className: 'dsh-sched-input',
            style: { fontSize: '12px', padding: '4px 8px' },
            placeholder: '粘贴网页网址 (如 B站) 或 本地文件路径 (如 D:\\大物.pptx)',
            id: 'dsh_new_res_input_' + item.id,
            onKeyDown: (e) => {
              if (e.key === 'Enter' && e.target.value.trim()) {
                const u = e.target.value.trim()
                const next = (item.resources || []).concat([{ title: inferResourceTitle(u, ''), uri: u }])
                onMutate('update', { id: item.id, resources: next })
                e.target.value = ''
              }
            }
          }),
          React.createElement('button', {
            className: 'dsh-sched-abtn',
            style: { padding: '4px 8px', fontSize: '11px', flex: 'none' },
            onClick: () => {
              const inp = document.getElementById('dsh_new_res_input_' + item.id)
              if (inp && inp.value.trim()) {
                const u = inp.value.trim()
                const next = (item.resources || []).concat([{ title: inferResourceTitle(u, ''), uri: u }])
                onMutate('update', { id: item.id, resources: next })
                inp.value = ''
              }
            }
          }, '+ 添加')
        )
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
        (data !== null && data !== undefined && Array.isArray(data.goals) && data.goals.length > 0)
          ? React.createElement('select', {
              className: 'dsh-sched-input',
              style: { flex: 'none', maxWidth: 158, fontSize: 12 },
              title: '把这条日程归属到长期目标',
              value: item.goalId || '',
              onChange: (e) => onMutate('link-goal', { id: item.id, goalId: e.target.value }),
            },
              React.createElement('option', { value: '' }, '🎯 不归属目标'),
              data.goals.map((g) => React.createElement('option', { key: g.id, value: g.id }, g.title)),
            )
          : null,
        doneToday
          ? React.createElement('button', {
              className: 'dsh-sched-abtn',
              onClick: () => onMutate('set-done', { id: item.id, date: relDate, done: false }),
            }, '取消今日完成')
          : React.createElement('button', {
              className: 'dsh-sched-abtn',
              onClick: () => onMutate('set-done', { id: item.id, date: relDate, done: true }),
            }, '✓ 标记完成'),
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
    const tb = parseTimeBlock(item)
    const [title, setTitle] = React.useState(item.title || '')
    const [date, setDate] = React.useState(item.recurring === 'once' ? (item.date || '') : '')
    const [recurring, setRecurring] = React.useState(item.recurring || 'once')
    const [weekdays, setWeekdays] = React.useState(Array.isArray(item.weekdays) ? item.weekdays.slice().sort() : [])
    const [startTime, setStartTime] = React.useState(item.startTime || tb.startTime || '')
    const [endTime, setEndTime] = React.useState(item.endTime || (tb.isRange ? tb.endTime : '') || '')
    const [quadrant, setQuadrant] = React.useState(item.quadrant || 'q2')
    const [note, setNote] = React.useState(item.note || '')
    const [carryOver, setCarryOver] = React.useState(item.carryOver === true)
    function toggleWd(n) {
      setWeekdays(weekdays.indexOf(n) === -1 ? weekdays.concat([n]).sort() : weekdays.filter((x) => x !== n))
    }
    async function save() {
      const t = title.trim()
      if (t === '') return
      const s = startTime.trim()
      const e = endTime.trim()
      const timeVal = s ? (e ? s + '-' + e : s) : undefined
      const payload = {
        id: item.id,
        title: t,
        recurring,
        weekdays: recurring === 'weekly' ? weekdays.slice() : undefined,
        startTime: s || undefined,
        endTime: e || undefined,
        time: timeVal,
        quadrant,
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
    
    // 起止时间输入
    opts.push(React.createElement('input', {
      key: 'st', type: 'time', className: 'dsh-sched-input', style: { flex: 'none', width: 95 },
      title: '起始时间', value: startTime, onChange: (e) => setStartTime(e.target.value),
    }))
    opts.push(React.createElement('span', { key: 't_sep', style: { fontSize: 11, opacity: .7 } }, '~'))
    opts.push(React.createElement('input', {
      key: 'et', type: 'time', className: 'dsh-sched-input', style: { flex: 'none', width: 95 },
      title: '结束时间(可选)', value: endTime, onChange: (e) => setEndTime(e.target.value),
    }))

    // 象限选择
    opts.push(React.createElement('select', {
      key: 'quad', className: 'dsh-sched-input', style: { flex: 'none' },
      value: quadrant, onChange: (e) => setQuadrant(e.target.value),
    },
      React.createElement('option', { value: 'q1' }, '🔴 重要 · 紧急'),
      React.createElement('option', { value: 'q2' }, '🟡 重要 · 不紧急'),
      React.createElement('option', { value: 'q3' }, '🔵 紧急 · 不重要'),
      React.createElement('option', { value: 'q4' }, '🟢 不重要 · 不紧急'),
    ))

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
    const { data, currentSessionId, onMutate, onOpenDetail, onOpenEdit } = props
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
        currentSessionId: currentSessionId, onMutate: onMutate,
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

  
  const QUADRANTS = [
    { id: 'q1', title: '重要 · 紧急', subtitle: '立即执行', color: '#cf222e', dot: '🔴' },
    { id: 'q2', title: '重要 · 不紧急', subtitle: '规划推进', color: '#0969da', dot: '🟡' },
    { id: 'q3', title: '紧急 · 不重要', subtitle: '快速交付', color: '#d97706', dot: '🔵' },
    { id: 'q4', title: '不重要 · 不紧急', subtitle: '归档消减', color: '#1a7f37', dot: '🟢' },
  ]

  function MatrixView(props) {
    const data = props.data
    const today = props.today
    const onMutate = props.onMutate
    const onOpenDetail = props.onOpenDetail
    const [draggingId, setDraggingId] = React.useState(null)
    const [dropTarget, setDropTarget] = React.useState(null)

    const rows = rowsFor(data, today)
    const buckets = { q1: [], q2: [], q3: [], q4: [] }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const q = r.item.quadrant && buckets[r.item.quadrant] ? r.item.quadrant : 'q2'
      buckets[q].push(r)
    }

    return React.createElement('div', { className: 'dsh-sched-matrix' },
      QUADRANTS.map((q) => {
        const isOver = dropTarget === q.id
        const items = buckets[q.id]
        return React.createElement('div', {
          key: q.id,
          className: 'dsh-sched-qbox' + (isOver ? ' dragover' : ''),
          onDragOver: (e) => {
            e.preventDefault()
            e.stopPropagation()
            e.dataTransfer.dropEffect = 'move'
            if (dropTarget !== q.id) setDropTarget(q.id)
          },
          onDragEnter: (e) => {
            e.preventDefault()
            e.stopPropagation()
            if (dropTarget !== q.id) setDropTarget(q.id)
          },
          onDragLeave: (e) => {
            e.stopPropagation()
            if (e.currentTarget.contains(e.relatedTarget)) return
            if (dropTarget === q.id) setDropTarget(null)
          },
          onDrop: async (e) => {
            e.preventDefault()
            e.stopPropagation()
            setDropTarget(null)
            const id = e.dataTransfer.getData('text/plain') || draggingId
            if (id) {
              await onMutate('update', { id, quadrant: q.id })
            }
          },
        },
          React.createElement('div', { className: 'dsh-sched-qhead' },
            React.createElement('span', { className: 'dsh-sched-qtitle', style: { color: q.color } },
              q.dot + ' ' + q.title,
              React.createElement('span', { className: 'dsh-sched-qsubtitle' }, q.subtitle),
            ),
            React.createElement('span', { className: 'dsh-sched-qcnt' }, String(items.length)),
          ),
          React.createElement('div', { className: 'dsh-sched-qlist' },
            items.length === 0
              ? React.createElement('div', { className: 'dsh-sched-qempty' }, '拖拽任务到此象限')
              : items.map((r) => {
                  const isDragging = draggingId === r.item.id
                  return React.createElement('div', {
                    key: r.item.id,
                    className: 'dsh-sched-qcard' + (r.done ? ' done' : '') + (isDragging ? ' dragging' : ''),
                    draggable: true,
                    onDragStart: (e) => {
                      e.stopPropagation()
                      setDraggingId(r.item.id)
                      e.dataTransfer.setData('text/plain', r.item.id)
                      e.dataTransfer.effectAllowed = 'move'
                    },
                    onDragEnd: (e) => {
                      e.stopPropagation()
                      setDraggingId(null)
                      setDropTarget(null)
                    },
                  },
                    React.createElement('span', { className: 'qhandle', title: '按住拖动' }, '⋮⋮'),
                    React.createElement('button', {
                      className: 'dsh-sched-circle' + (r.done ? ' done' : ''),
                      title: r.done ? '标记未完成' : '标记已完成',
                      onClick: (e) => {
                        e.stopPropagation()
                        onMutate('set-done', { id: r.item.id, date: today, done: !r.done })
                      },
                    }, r.done ? '✓' : ''),
                    React.createElement('span', {
                      className: 'qtitle',
                      title: r.item.title + (r.item.note ? ' · ' + r.item.note : ''),
                      onClick: (e) => {
                        e.stopPropagation()
                        onOpenDetail(r.item.id)
                      },
                    }, r.item.title),
                    r.item.time ? React.createElement('span', { className: 'qtime' }, r.item.time) : null,
                  )
                }),
          ),
        )
      }),
    )
  }

  // ---- 垂直时间轴 (Time-blocking) ----
  
    function TimelineView(props) {
    const data = props.data
    const today = props.today
    const onMutate = props.onMutate
    const onOpenDetail = props.onOpenDetail

    const [isDragging, setIsDragging] = React.useState(false)
    const [draggingItem, setDraggingItem] = React.useState(null)
    const [previewSlot, setPreviewSlot] = React.useState(null)
    const [selectedChipId, setSelectedChipId] = React.useState(null)
    const [nowTime, setNowTime] = React.useState(() => {
      const d = new Date()
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
    })

    const hourHeight = 68
    const totalHeight = hourHeight * 24
    const scrollContainerRef = React.useRef(null)
    const gridRef = React.useRef(null)
    const autoScrollTimerRef = React.useRef(null)
    const draggingItemRef = React.useRef(null)

    function timeToMinutes(t) {
      if (!t || !t.includes(':')) return 0
      const [h, m] = t.split(':').map(Number)
      return (h || 0) * 60 + (m || 0)
    }

    function minutesToTime(m) {
      const clamped = Math.max(0, Math.min(24 * 60 - 15, m))
      const h = Math.floor(clamped / 60)
      const min = clamped % 60
      return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0')
    }

    // 初始化时自动平滑滚动到当前时间附近
    React.useEffect(() => {
      const scrollEl = scrollContainerRef.current
      if (scrollEl) {
        const currentM = timeToMinutes(nowTime)
        const targetScrollTop = Math.max(0, (currentM / 60) * hourHeight - 140)
        scrollEl.scrollTop = targetScrollTop
      }
    }, [])

    // 实时更新当前时间红线
    React.useEffect(() => {
      const timer = setInterval(() => {
        const d = new Date()
        setNowTime(String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'))
      }, 30000)
      return () => clearInterval(timer)
    }, [])

    const stopAutoScroll = () => {
      if (autoScrollTimerRef.current) {
        clearInterval(autoScrollTimerRef.current)
        autoScrollTimerRef.current = null
      }
    }

    const handleAutoScroll = (clientY) => {
      const el = scrollContainerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const topThreshold = rect.top + 70
      const bottomThreshold = rect.bottom - 70

      stopAutoScroll()
      if (clientY < topThreshold) {
        const intensity = Math.min(20, Math.max(4, Math.floor((topThreshold - clientY) / 3)))
        autoScrollTimerRef.current = setInterval(() => {
          if (el.scrollTop > 0) el.scrollTop -= intensity
        }, 16)
      } else if (clientY > bottomThreshold) {
        const intensity = Math.min(20, Math.max(4, Math.floor((clientY - bottomThreshold) / 3)))
        autoScrollTimerRef.current = setInterval(() => {
          el.scrollTop += intensity
        }, 16)
      }
    }

    function yToSnappedRange(y, durationMinutes = 45) {
      const rawMin = (Math.max(0, y) / hourHeight) * 60
      const snappedStartMin = Math.round(rawMin / 15) * 15
      const snappedEndMin = Math.min(24 * 60, snappedStartMin + durationMinutes)
      return {
        start: minutesToTime(snappedStartMin),
        end: minutesToTime(snappedEndMin),
        top: (snappedStartMin / 60) * hourHeight,
        height: (durationMinutes / 60) * hourHeight,
      }
    }

    const rows = rowsFor(data, today)
    const placedTasks = []
    const unplacedTasks = []

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const item = r.item
      const st = item.startTime || (item.time && !item.time.includes('-') ? item.time : (item.time ? item.time.split('-')[0].trim() : ''))
      if (st && st.includes(':')) {
        let et = item.endTime || (item.time && item.time.includes('-') ? item.time.split('-')[1].trim() : '')
        if (!et) {
          const [sh, sm] = st.split(':').map(Number)
          const totalM = (sh || 0) * 60 + (sm || 0) + 45
          et = minutesToTime(totalM)
        }
        placedTasks.push({ ...r, calculatedStart: st, calculatedEnd: et })
      } else {
        unplacedTasks.push(r)
      }
    }

    const nowMinutes = timeToMinutes(nowTime)
    const nowTop = (nowMinutes / 60) * hourHeight

    // 核心保存逻辑
    const applyTaskSchedule = async (id, start, end) => {
      if (!id || !start || !end) return
      try {
        await onMutate('update', {
          id: id,
          time: start + '-' + end,
          startTime: start,
          endTime: end,
          date: today,
        })
        if (typeof refresh === 'function') await refresh()
      } catch (err) {
        console.error('[dsh-schedule] applyTaskSchedule error:', err)
      }
    }

    return React.createElement('div', { className: 'dsh-sched-tl-container' },
      React.createElement('div', { className: 'dsh-sched-tl-toolbar' },
        React.createElement('div', { className: 'dsh-sched-tl-badge' },
          '⏱️ 24小时时间轴' + (previewSlot ? (' · 🎯 吸附至 ' + previewSlot.start) : (selectedChipId ? ' · 👆 点击网格直接安排' : ''))
        ),
        React.createElement('span', { className: 'dsh-sched-tl-hint' },
          selectedChipId ? '已选任务，点击网格任意时间即可直接排期' : (isDragging ? '拖到目标刻度松开' : '按住卡片直接拖入时间轴')
        ),
      ),
      React.createElement('div', {
        className: 'dsh-sched-tl-scroll',
        ref: scrollContainerRef,
        onDragOver: (e) => {
          e.preventDefault()
          handleAutoScroll(e.clientY)
        },
      },
        React.createElement('div', {
          className: 'dsh-sched-tl-grid',
          ref: gridRef,
          style: { height: totalHeight + 'px', position: 'relative', cursor: selectedChipId ? 'pointer' : 'default' },
          // 直接在网格上监听拖放，坐标计算 100% 绝对精确
          onDragOver: (e) => {
            e.preventDefault()
            e.stopPropagation()
            e.dataTransfer.dropEffect = 'move'
            handleAutoScroll(e.clientY)
            const gridRect = e.currentTarget.getBoundingClientRect()
            const relY = e.clientY - gridRect.top
            const curItem = draggingItemRef.current || draggingItem
            const dur = curItem && curItem.duration ? curItem.duration : 45
            const snap = yToSnappedRange(relY, dur)
            setPreviewSlot(snap)
          },
          onDrop: async (e) => {
            e.preventDefault()
            e.stopPropagation()
            stopAutoScroll()

            const gridRect = e.currentTarget.getBoundingClientRect()
            const relY = e.clientY - gridRect.top
            
            let id = e.dataTransfer.getData('text/plain')
            let dur = 45
            const curItem = draggingItemRef.current || draggingItem || window.__DSH_DRAG_ITEM__
            if (curItem) {
              if (!id) id = curItem.id
              if (curItem.duration) dur = curItem.duration
            }

            const slot = previewSlot || yToSnappedRange(relY, dur)
            setIsDragging(false)
            setDraggingItem(null)
            draggingItemRef.current = null
            window.__DSH_DRAG_ITEM__ = null
            setPreviewSlot(null)

            if (id && slot) {
              await applyTaskSchedule(id, slot.start, slot.end)
            }
          },
          // 点击时间网格任意位置：如果有选中的任务，直接安排到点击时间！
          onClick: async (e) => {
            if (!selectedChipId) return
            const gridRect = e.currentTarget.getBoundingClientRect()
            const relY = e.clientY - gridRect.top
            const slot = yToSnappedRange(relY, 45)
            const taskId = selectedChipId
            setSelectedChipId(null)
            await applyTaskSchedule(taskId, slot.start, slot.end)
          },
        },
          // 24 小时刻度
          Array.from({ length: 24 }).map((_, h) => {
            const hTop = h * hourHeight
            return React.createElement('div', {
              key: h,
              className: 'dsh-sched-tl-hour' + (isDragging ? ' zoomed' : ''),
              style: { top: hTop + 'px', height: hourHeight + 'px', pointerEvents: 'none' },
            },
              React.createElement('span', { className: 'dsh-sched-tl-hour-label' },
                String(h).padStart(2, '0') + ':00'
              ),
              React.createElement('div', {
                className: 'dsh-sched-tl-sub-hour',
                style: { top: (hourHeight / 2) + 'px', pointerEvents: 'none' },
              }),
            )
          }),

          // 当前时间指示红线与红点
          React.createElement('div', { className: 'dsh-sched-tl-now', style: { top: nowTop + 'px', pointerEvents: 'none' } },
            React.createElement('span', { className: 'dsh-sched-tl-now-label' }, nowTime)
          ),

          // 磁吸附落点半透明高亮预览框
          previewSlot ? React.createElement('div', {
            className: 'dsh-sched-tl-drop-preview',
            style: { top: previewSlot.top + 'px', height: Math.max(32, previewSlot.height) + 'px', pointerEvents: 'none' },
          }, '📍 ' + previewSlot.start + ' - ' + previewSlot.end) : null,

          // 已排期色块
          placedTasks.map((r) => {
            const startM = timeToMinutes(r.calculatedStart)
            const endM = timeToMinutes(r.calculatedEnd)
            const dur = Math.max(20, endM - startM)
            const top = (startM / 60) * hourHeight
            const height = Math.max(32, (dur / 60) * hourHeight)

            return React.createElement('div', {
              key: r.item.id,
              className: 'dsh-sched-tl-card' + (r.done ? ' done' : ''),
              style: {
                top: top + 'px',
                height: height + 'px',
                borderLeft: '4px solid ' + (r.item.quadrant === 'q1' ? '#cf222e' : r.item.quadrant === 'q3' ? '#d97706' : '#0969da'),
                pointerEvents: 'auto',
              },
              draggable: true,
              onDragStart: (e) => {
                e.stopPropagation()
                setIsDragging(true)
                const dObj = { id: r.item.id, duration: dur }
                setDraggingItem(dObj)
                draggingItemRef.current = dObj
                window.__DSH_DRAG_ITEM__ = dObj
                e.dataTransfer.setData('text/plain', r.item.id)
                e.dataTransfer.effectAllowed = 'move'
              },
              onDragEnd: () => {
                stopAutoScroll()
                setIsDragging(false)
                setDraggingItem(null)
                draggingItemRef.current = null
                window.__DSH_DRAG_ITEM__ = null
                setPreviewSlot(null)
              },
              onClick: (e) => {
                e.stopPropagation()
                onOpenDetail(r.item.id)
              },
            },
              React.createElement('div', { className: 't-head' },
                React.createElement('span', { className: 't-title' }, r.item.title),
                React.createElement('span', { className: 't-span' }, r.calculatedStart + '-' + r.calculatedEnd),
              ),
              height >= 48 && r.item.note ? React.createElement('div', { className: 't-note' }, r.item.note) : null,
            )
          }),
        ),
      ),

      // 待排期任务池
      unplacedTasks.length > 0 ? React.createElement('div', { className: 'dsh-sched-tl-unplaced' },
        React.createElement('div', { className: 'dsh-sched-tl-unplaced-title' },
          React.createElement('span', null, '📋 待排期待办 (' + unplacedTasks.length + ')'),
          React.createElement('span', { style: { fontSize: '10px', opacity: 0.6 } }, '拖拽或点击后点网格快速排期'),
        ),
        React.createElement('div', null,
          unplacedTasks.map((r) => {
            const isSelected = selectedChipId === r.item.id
            return React.createElement('div', {
              key: r.item.id,
              className: 'dsh-sched-tl-chip' + (isSelected ? ' selected' : ''),
              style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                border: isSelected ? '1px solid #0969da' : '',
                background: isSelected ? 'rgba(9,105,218,.15)' : '',
              },
              draggable: true,
              onDragStart: (e) => {
                e.stopPropagation()
                setIsDragging(true)
                const dObj = { id: r.item.id, duration: 45 }
                setDraggingItem(dObj)
                draggingItemRef.current = dObj
                window.__DSH_DRAG_ITEM__ = dObj
                e.dataTransfer.setData('text/plain', r.item.id)
                e.dataTransfer.effectAllowed = 'move'
              },
              onDragEnd: () => {
                stopAutoScroll()
                setIsDragging(false)
                setDraggingItem(null)
                draggingItemRef.current = null
                window.__DSH_DRAG_ITEM__ = null
                setPreviewSlot(null)
              },
            },
              React.createElement('span', {
                style: { cursor: 'pointer', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                onClick: () => setSelectedChipId(isSelected ? null : r.item.id),
                title: '点击选中后点击上方时间轴任意位置直接安排，或按住拖拽'
              }, (isSelected ? '👉 ' : '⋮⋮ ') + r.item.title),
              React.createElement('button', {
                type: 'button',
                className: 'dsh-sched-quick-set',
                title: '一键将此任务排到当前时间',
                onClick: async (e) => {
                  e.stopPropagation()
                  const currentM = timeToMinutes(nowTime)
                  const st = minutesToTime(Math.round(currentM / 15) * 15)
                  const et = minutesToTime(Math.round(currentM / 15) * 15 + 45)
                  await applyTaskSchedule(r.item.id, st, et)
                },
              }, '⏱️ 排到当前')
            )
          }),
        ),
      ) : null,
    )
  }
  // ==================== 课表层:时间占用视图 ====================

  /** 课表展开状态持久化(默认折叠 —— 它回答的是"我被占用了哪些时段",需要时才看)。 */
  const TT_KEY = 'dsh-schedule:timetable'
  function readTtVisible() {
    try {
      const v = window.localStorage.getItem(TT_KEY)
      return v === null ? false : v === '1'
    } catch (e) { return false }
  }
  function writeTtVisible(v) {
    try { window.localStorage.setItem(TT_KEY, v ? '1' : '0') } catch (e) {}
  }

  /**
   * 本周课表 —— 与「今天/本周」视图分工不同:
   *   那些视图回答"要做什么"(含无时间的待办),这里只回答"哪段时间被占了"。
   * 因此只收有 startTime/endTime/time 的条目,纯待办不进来,才是课表该有的样子。
   * weekly 课程由 rowsFor 自动展开到每一天,所以课程录一次就会出现整整一学期。
   */
  function WeekTimetable(props) {
    const data = props.data
    const today = props.today
    const monday = mondayOf(today !== undefined && today !== null ? today : todayStr())
    const days = []
    let slotCount = 0
    let totalMinutes = 0
    for (let i = 0; i < 7; i++) {
      const ds = addDays(monday, i)
      const rows = rowsFor(data, ds)
      const timed = []
      for (let j = 0; j < rows.length; j++) {
        const block = parseTimeBlock(rows[j].item)
        if (!block.hasTime) continue
        timed.push({ row: rows[j], block, overlap: false })
      }
      timed.sort((a, b) => a.block.startMinutes - b.block.startMinutes)
      // 同一天内的区间重叠:排课撞车必须一眼看得见,不能等真撞上才发现
      for (let j = 0; j < timed.length; j++) {
        for (let k = j + 1; k < timed.length; k++) {
          if (timed[j].block.startMinutes < timed[k].block.endMinutes
              && timed[k].block.startMinutes < timed[j].block.endMinutes) {
            timed[j].overlap = true
            timed[k].overlap = true
          }
        }
        slotCount += 1
        totalMinutes += timed[j].block.durationMinutes
      }
      days.push({ date: ds, timed: timed, isToday: ds === today })
    }

    // 迷你周密度条:七个小格,颜色越深当天被占的时段越多,今天带描边
    const barCells = []
    for (let i = 0; i < 7; i++) {
      const n = days[i].timed.length
      barCells.push(React.createElement('span', {
        key: 'b' + i,
        className: 'dsh-sched-tt-cell' + (n > 0 ? ' on' : '') + (n >= 3 ? ' busy' : '')
          + (days[i].isToday ? ' today' : ''),
        title: WEEKDAY_NAMES[i] + ' · ' + n + ' 段',
      }))
    }

    const rows = []
    for (let i = 0; i < 7; i++) {
      const d = days[i]
      rows.push(React.createElement('div', {
        key: 'd' + i,
        className: 'dsh-sched-tt-day' + (d.isToday ? ' today' : ''),
      },
        React.createElement('span', { className: 'dsh-sched-tt-dl' },
          WEEKDAY_NAMES[i] + ' ' + Number(d.date.slice(5, 7)) + '/' + Number(d.date.slice(8, 10))),
        React.createElement('span', {
          className: d.timed.length === 0 ? 'dsh-sched-tt-off' : 'dsh-sched-tt-cnt',
        }, d.timed.length === 0 ? '无时段' : d.timed.length + ' 段'),
      ))
      for (let j = 0; j < d.timed.length; j++) {
        const t = d.timed[j]
        const it = t.row.item
        rows.push(React.createElement('div', {
          key: 'd' + i + 's' + it.id,
          className: 'dsh-sched-tt-slot' + (t.row.done ? ' done' : '') + (t.overlap ? ' conflict' : ''),
          title: it.title + '\n' + t.block.startTime + ' ~ ' + t.block.endTime
            + ' · ' + formatDuration(t.block.durationMinutes)
            + (t.row.done ? ' · 已完成' : '')
            + (t.overlap ? '\n⚠ 与同一天另一条时间重叠' : ''),
          onClick: () => props.onOpenDetail(it.id),
        },
          React.createElement('span', { className: 'dsh-sched-tt-t' }, t.block.startTime),
          React.createElement('span', { className: 'dsh-sched-tt-title' }, it.title),
          t.overlap ? React.createElement('span', { className: 'dsh-sched-tt-warn' }, '⚠') : null,
        ))
      }
    }

    return React.createElement('div', { className: 'dsh-sched-tt' },
      React.createElement('div', { className: 'dsh-sched-tt-head' },
        React.createElement('span', null, '本周课表'),
        React.createElement('span', { className: 'sum' },
          slotCount > 0 ? slotCount + ' 段 · ' + formatDuration(totalMinutes) : '暂无定时日程'),
      ),
      React.createElement('div', { className: 'dsh-sched-tt-bar' }, barCells),
      slotCount === 0
        ? React.createElement('div', { className: 'dsh-sched-tt-empty' },
            '给日程加上时间(或建 weekly 课程),这里就会自动长出课表')
        : rows,
    )
  }

  // ==================== 目标层(Goal) UI ====================

  /** 目标条展开状态持久化(默认展开;按钮可一键隐藏)。 */
  const GOALS_BAR_KEY = 'dsh-schedule:goals-bar'
  function readGoalsBarVisible() {
    try {
      const v = window.localStorage.getItem(GOALS_BAR_KEY)
      return v === null ? true : v === '1'
    } catch (e) { return true }
  }
  function writeGoalsBarVisible(v) {
    try { window.localStorage.setItem(GOALS_BAR_KEY, v ? '1' : '0') } catch (e) {}
  }

  /** 单条目标胶囊:圆点 + 标题 + 迷你进度条 + 数值。 */
  function GoalChip(props) {
    const goal = props.goal
    const prog = goalProgressOf(goal, props.data, props.today)
    const meta = goalHorizonMeta(goal.horizon)
    // 空转:进行中却一条日程都没挂 —— 这正是需要提醒的情况
    const isIdle = goal.status === 'active' && prog.linkedTotal === 0
    const tip = meta.label + ' · ' + goal.startDate + ' ~ ' + goal.endDate
      + ' · ' + formatGoalMetric(goal, prog)
      + (prog.remainingDays > 0 ? ' · 剩 ' + prog.remainingDays + ' 天' : '')
      + (prog.linkedTotal > 0 ? ' · 关联 ' + prog.linkedDone + '/' + prog.linkedTotal + ' 条日程' : '')
    return React.createElement('div', {
      className: 'dsh-sched-goalchip'
        + (goal.status === 'done' ? ' done' : '')
        + (goal.status === 'dropped' ? ' dropped' : '')
        + (isIdle ? ' idle' : ''),
      title: tip + (goal.note ? ' ｜ ' + goal.note : ''),
      onClick: () => props.onOpen(goal.id),
    },
      React.createElement('span', null, meta.dot),
      React.createElement('span', { className: 'gt' }, goal.title),
      React.createElement('span', { className: 'dsh-sched-goalbar' + (prog.percent >= 100 ? ' done' : '') },
        React.createElement('i', { style: { width: prog.percent + '%' } }),
      ),
      React.createElement('span', { className: 'gp' }, formatGoalMetric(goal, prog)),
      isIdle
        ? React.createElement('span', {
            className: 'dsh-sched-goalchip-warn',
            title: '这个目标还没有任何日程支撑,给它排一条吧',
          }, '无日程')
        : null,
    )
  }

  /** 跑马灯速度(px/s)。慢到能读清,快到不拖沓。 */
  const GOALS_MARQUEE_SPEED = 22

  /** 拖拽阈值(px):小于它一律当点击,不抢走 chip 的 onClick。 */
  const GOALS_DRAG_SLOP = 4

  /**
   * 常驻目标条(新闻跑马灯式)。
   *
   * 三个设计点:
   *   1. **只在内容溢出时才启动跑马灯** —— 目标少的时候静止排列,不然一条目标来回滚很傻;
   *   2. **复制 3 份首尾相接,视口锚在中间那份** —— 左右都能无限滚,不会撞到边界;
   *   3. **悬停/拖拽时暂停** —— 想看清或想点某条时,它不该继续跑。
   *
   * 手动划动同时支持:滚轮/触控板原生滚动 + 指针拖拽 + 触屏滑动。
   */
  function GoalsBar(props) {
    const goals = props.goals
    const trackRef = React.useRef(null)
    const seqRef = React.useRef(null)
    const reseatingRef = React.useRef(false)
    const dragRef = React.useRef(null)
    const suppressClickRef = React.useRef(false)
    const [marquee, setMarquee] = React.useState(false)
    const [dragging, setDragging] = React.useState(false)
    const [hovering, setHovering] = React.useState(false)

    const order = { active: 0, done: 1, dropped: 2 }
    const sorted = goals.slice().sort((a, b) => (order[a.status] || 0) - (order[b.status] || 0))
    const titleSig = sorted.map((g) => g.id + ':' + g.status + ':' + g.title).join('|')

    // ---- 测量:需要跑马灯吗?顺便把视口锚到中间那份 ----
    React.useEffect(() => {
      const track = trackRef.current
      const seq = seqRef.current
      if (!track || !seq) return undefined
      const measure = () => {
        const w = seq.offsetWidth
        if (w <= 0) return
        const over = w > track.clientWidth + 2
        setMarquee(over)
        // 溢出时把滚动位置锚在第二份的起点:左边还有一整份可滚,右边也是
        if (over) {
          if (track.scrollLeft < w || track.scrollLeft >= w * 2) track.scrollLeft = w
        } else if (track.scrollLeft !== 0) {
          track.scrollLeft = 0
        }
      }
      measure()
      if (typeof ResizeObserver === 'undefined') return undefined
      const ro = new ResizeObserver(measure)
      ro.observe(track)
      ro.observe(seq)
      return () => ro.disconnect()
    }, [titleSig, marquee])

    // ---- 自动推进 ----
    React.useEffect(() => {
      if (!marquee || hovering || dragging) return undefined
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
          && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
      let raf = 0
      let last = performance.now()
      let acc = 0
      const tick = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000)
        last = now
        acc += GOALS_MARQUEE_SPEED * dt
        if (acc >= 1) {
          const step = Math.floor(acc)
          acc -= step
          const track = trackRef.current
          if (track) track.scrollLeft += step
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(raf)
    }, [marquee, hovering, dragging])

    /**
     * 无缝重定位:把 scrollLeft 收回 [w, 2w) 这个"中间份"窗口。
     * 因为内容是周期为 w 的重复序列,加减一个 w 视觉上完全等价 —— 这就是无限循环的全部秘密。
     */
    const reseat = () => {
      const track = trackRef.current
      const seq = seqRef.current
      if (!track || !seq || reseatingRef.current) return
      const w = seq.offsetWidth
      if (w <= 0) return
      const s = track.scrollLeft
      let next = s
      if (s < w) next = s + w
      else if (s >= w * 2) next = s - w
      if (next !== s) {
        reseatingRef.current = true
        track.scrollLeft = next
        // 赋值 scrollLeft 会异步再派发一次 scroll,下一帧才解锁
        requestAnimationFrame(() => { reseatingRef.current = false })
      }
    }

    const openChip = (id) => {
      // 刚拖拽过就别把这次 click 当成"点开目标"
      if (suppressClickRef.current) return
      props.onOpen(id)
    }

    function onPointerDown(e) {
      if (!marquee) return
      const track = trackRef.current
      if (!track) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      dragRef.current = { x: e.clientX, left: track.scrollLeft, moved: 0, id: e.pointerId }
      setDragging(true)
    }

    function onPointerMove(e) {
      const d = dragRef.current
      const track = trackRef.current
      if (!d || !track || d.id !== e.pointerId) return
      const dx = e.clientX - d.x
      if (Math.abs(dx) > d.moved) d.moved = Math.abs(dx)
      if (d.moved <= GOALS_DRAG_SLOP) return
      e.preventDefault()
      try { track.setPointerCapture(e.pointerId) } catch (err) { /* 忽略 */ }
      track.scrollLeft = d.left - dx
    }

    function onPointerUp(e) {
      const d = dragRef.current
      if (!d || d.id !== e.pointerId) return
      dragRef.current = null
      setDragging(false)
      if (d.moved > GOALS_DRAG_SLOP) {
        suppressClickRef.current = true
        setTimeout(() => { suppressClickRef.current = false }, 0)
      }
    }

    if (goals.length === 0) {
      return React.createElement('div', { className: 'dsh-sched-goalsbar' },
        React.createElement('span', { className: 'dsh-sched-goals-empty', onClick: props.onAdd }, '+ 立一个长期目标（跨月 / 学期）'),
      )
    }

    const renderSeq = (prefix) => sorted.map((g) => React.createElement(GoalChip, {
      key: prefix + g.id, goal: g, data: props.data, today: props.today, onOpen: openChip,
    }))

    const seqs = [
      React.createElement('div', { key: 's0', ref: seqRef, className: 'dsh-sched-goals-seq' }, renderSeq('s0-')),
    ]
    if (marquee) {
      // 再多两份,凑成三份周期 —— 左右各有整整一份的缓冲
      seqs.push(React.createElement('div', { key: 's1', className: 'dsh-sched-goals-seq', 'aria-hidden': 'true' }, renderSeq('s1-')))
      seqs.push(React.createElement('div', { key: 's2', className: 'dsh-sched-goals-seq', 'aria-hidden': 'true' }, renderSeq('s2-')))
    }

    return React.createElement('div', {
      className: 'dsh-sched-goalsbar',
      onMouseEnter: () => setHovering(true),
      onMouseLeave: () => setHovering(false),
    },
      React.createElement('div', {
        ref: trackRef,
        className: 'dsh-sched-goals-track'
          + (marquee ? ' marquee' : '')
          + (dragging ? ' dragging' : ''),
        onScroll: reseat,
        onPointerDown: onPointerDown,
        onPointerMove: onPointerMove,
        onPointerUp: onPointerUp,
        onPointerCancel: onPointerUp,
        onMouseEnter: () => setHovering(true),
        onMouseLeave: () => setHovering(false),
      }, seqs),
      React.createElement('button', {
        type: 'button', className: 'dsh-sched-goals-add', onClick: props.onAdd,
      }, '+ 目标'),
    )
  }

  /** 目标详情:进度大条 + 快捷推进 + 关联日程清单 + 状态切换。 */
  function GoalDetailView(props) {
    const goal = props.goal
    const data = props.data
    const today = props.today
    const onMutate = props.onMutate
    const prog = goalProgressOf(goal, data, today)
    const meta = goalHorizonMeta(goal.horizon)
    const st = goalStatusMeta(goal.status)
    const [confirmDel, setConfirmDel] = React.useState(false)
    const doneMap = data !== null && data.done ? data.done : {}
    const items = (data !== null && Array.isArray(data.items) ? data.items : []).filter((i) => i.goalId === goal.id)

    async function bump(delta) {
      const next = Math.max(0, Math.min(prog.target, prog.current + delta))
      await onMutate('goal-update', { id: goal.id, metric: { current: next } })
    }
    async function setStatus(s) {
      await onMutate('goal-update', { id: goal.id, status: s })
    }

    const step = prog.target >= 100 ? 10 : Math.max(1, Math.round(prog.target / 10))
    const itemEls = items.map((it) => {
      const rec = doneMap[it.id]
      const isDone = rec !== undefined && Object.keys(rec).length > 0
      return React.createElement('div', { key: it.id, className: 'dsh-sched-goalitem' },
        React.createElement('button', {
          className: 'dsh-sched-circle' + (isDone ? ' done' : ''),
          title: isDone ? '取消完成' : '标记完成',
          onClick: () => onMutate('set-done', { id: it.id, date: today, done: !isDone }),
        }, isDone ? '✓' : ''),
        React.createElement('span', {
          className: 't' + (isDone ? ' done' : ''),
          title: it.title,
          onClick: () => props.onOpenItem(it.id),
        }, it.title),
        React.createElement('button', {
          className: 'dsh-sched-del',
          title: '解除与该目标的关联',
          onClick: () => onMutate('link-goal', { id: it.id, goalId: '' }),
        }, '⊘'),
      )
    })

    return React.createElement('div', { className: 'dsh-sched-goaldetail' },
      React.createElement('div', { className: 'dsh-sched-goaldetail-title' }, goal.title),
      React.createElement('div', { className: 'dsh-sched-goalsub' },
        React.createElement('span', { className: 'dsh-sched-pill' }, meta.dot + ' ' + meta.label),
        React.createElement('span', { className: 'dsh-sched-pill', style: { color: st.color } }, st.label),
        React.createElement('span', { className: 'dsh-sched-pill' }, goal.startDate + ' ~ ' + goal.endDate),
        prog.remainingDays > 0
          ? React.createElement('span', { className: 'dsh-sched-pill' }, '剩 ' + prog.remainingDays + ' 天')
          : React.createElement('span', { className: 'dsh-sched-pill' }, '已到期'),
      ),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        React.createElement('div', { className: 'dsh-sched-goaldetail-bar' },
          React.createElement('i', { style: { width: prog.percent + '%', background: prog.percent >= 100 ? '#2da44e' : '#0969da' } }),
        ),
        React.createElement('div', { className: 'dsh-sched-goaldetail-nums' },
          React.createElement('span', { className: 'big' }, prog.percent + '%'),
          React.createElement('span', null, formatGoalMetric(goal, prog)
            + (prog.derived ? '（按关联日程推导）' : '')
            + (prog.linkedTotal > 0 ? ' · 关联日程 ' + prog.linkedDone + '/' + prog.linkedTotal : '')),
        ),
      ),

      // 快捷推进
      React.createElement('div', { className: 'dsh-sched-goal-gauge' },
        React.createElement('button', {
          className: 'dsh-sched-abtn', type: 'button', disabled: prog.current <= 0,
          style: prog.current <= 0 ? { opacity: .45 } : null,
          onClick: () => bump(-step),
        }, '−' + step + ' ' + (goal.metric && goal.metric.unit ? goal.metric.unit : '')),
        React.createElement('button', {
          className: 'dsh-sched-abtn primary', type: 'button',
          onClick: () => bump(step),
        }, '+' + step + ' ' + (goal.metric && goal.metric.unit ? goal.metric.unit : '')),
        React.createElement('button', {
          className: 'dsh-sched-abtn', type: 'button',
          title: '直接把进度拉满(标记达成)',
          onClick: () => onMutate('goal-update', { id: goal.id, metric: { current: prog.target }, status: 'done' }),
        }, '拉满'),
      ),

      goal.note ? React.createElement('div', { className: 'dsh-sched-section' },
        React.createElement('div', { className: 'dsh-sched-section-label' }, '备注'),
        React.createElement('div', { className: 'dsh-sched-note-full' }, goal.note),
      ) : null,

      // 关联日程
      React.createElement('div', { className: 'dsh-sched-section' },
        React.createElement('div', { className: 'dsh-sched-section-label' },
          '关联日程 (' + items.length + ')'),
        items.length === 0
          ? React.createElement('div', null,
              React.createElement('div', { className: 'dsh-sched-note-empty' },
                '还没有日程归属到这个目标 —— 没有日程支撑的目标很难推进。'),
              React.createElement('button', {
                className: 'dsh-sched-abtn primary',
                style: { marginTop: 8 },
                onClick: () => props.onAddSchedule(goal.id),
              }, '+ 照这个目标排一条日程'),
            )
          : React.createElement('div', null, itemEls),
      ),

      // 状态与操作
      React.createElement('div', { className: 'dsh-sched-actions' },
        goal.status === 'done'
          ? React.createElement('button', { className: 'dsh-sched-abtn', onClick: () => setStatus('active') }, '↺ 恢复进行中')
          : React.createElement('button', { className: 'dsh-sched-abtn primary', onClick: () => setStatus('done') }, '✓ 标记达成'),
        goal.status === 'dropped'
          ? React.createElement('button', { className: 'dsh-sched-abtn', onClick: () => setStatus('active') }, '↺ 恢复进行中')
          : React.createElement('button', {
              className: 'dsh-sched-abtn',
              onClick: () => setStatus('dropped'),
            }, '⏸ 暂停/放弃'),
        React.createElement('button', { className: 'dsh-sched-abtn', onClick: props.onEdit }, '✎ 编辑'),
        React.createElement('button', {
          className: 'dsh-sched-abtn danger' + (confirmDel ? ' confirm' : ''),
          style: confirmDel ? {} : { marginLeft: 'auto' },
          title: '删除目标会影响归属它的日程吗?不会 —— 只会解除归属',
          onClick: async () => {
            if (!confirmDel) { setConfirmDel(true); return }
            setConfirmDel(false)
            await onMutate('goal-remove', { id: goal.id })
            if (typeof props.onBack === 'function') props.onBack()
          },
        }, confirmDel ? '确认删除?' : '删除目标'),
      ),
    )
  }

  /** 目标的新建 / 编辑表单。 */
  function GoalForm(props) {
    const editing = props.goal !== null && props.goal !== undefined
    const g = editing ? props.goal : null
    const [title, setTitle] = React.useState(g ? g.title : '')
    const [horizon, setHorizon] = React.useState(g ? g.horizon : 'term')
    const [startDate, setStartDate] = React.useState(g ? g.startDate : '')
    const [endDate, setEndDate] = React.useState(g ? g.endDate : '')
    const [mtype, setMtype] = React.useState(g && g.metric ? g.metric.type : 'percent')
    const [target, setTarget] = React.useState(g && g.metric ? String(g.metric.target) : '100')
    const [current, setCurrent] = React.useState(g && g.metric ? String(g.metric.current) : '0')
    const [unit, setUnit] = React.useState(g && g.metric ? String(g.metric.unit || '') : '')
    const [note, setNote] = React.useState(g ? g.note : '')

    async function save() {
      const t = title.trim()
      if (t === '') return
      const metric = {
        type: mtype,
        target: mtype === 'milestone' ? 1 : (Number(target) || 1),
        current: Number(current) || 0,
        unit: unit.trim(),
      }
      if (editing) {
        await props.onMutate('goal-update', {
          id: g.id, title: t, horizon, startDate: startDate || undefined,
          endDate: endDate || undefined, metric, note,
        })
      } else {
        await props.onMutate('goal-add', {
          title: t, horizon, startDate: startDate || undefined,
          endDate: endDate || undefined, metric, note,
        })
      }
      props.onCancel()
    }

    const HINT = {
      percent: '百分比:target 通常 100',
      score: '数值型,如四级 600 分',
      count: '计数型,如 12 套真题',
      milestone: '里程碑:达成 / 未达成(进度自动归一)',
    }

    const rows = [
      React.createElement('div', { key: 'r1', className: 'dsh-sched-add-row' },
        React.createElement('input', {
          className: 'dsh-sched-input', placeholder: '目标标题,如「大学英语四级 600 分」',
          value: title, onChange: (e) => setTitle(e.target.value),
        }),
      ),
      React.createElement('div', { key: 'r2', className: 'dsh-sched-add-row' },
        React.createElement('select', {
          className: 'dsh-sched-input', value: horizon, onChange: (e) => setHorizon(e.target.value),
        },
          React.createElement('option', { value: 'term' }, '学期'),
          React.createElement('option', { value: 'year' }, '学年'),
          React.createElement('option', { value: 'custom' }, '自定义'),
        ),
        React.createElement('select', {
          className: 'dsh-sched-input', value: mtype,
          onChange: (e) => { setMtype(e.target.value); if (e.target.value === 'milestone') setTarget('1') },
        },
          React.createElement('option', { value: 'percent' }, '百分比'),
          React.createElement('option', { value: 'score' }, '数值'),
          React.createElement('option', { value: 'count' }, '计数'),
          React.createElement('option', { value: 'milestone' }, '里程碑'),
        ),
      ),
      React.createElement('div', { key: 'r3', className: 'dsh-sched-add-row' },
        React.createElement('input', {
          type: 'date', className: 'dsh-sched-input', style: { flex: 'none', width: 138 },
          value: startDate, onChange: (e) => setStartDate(e.target.value),
        }),
        React.createElement('span', { style: { fontSize: 11, opacity: .7 } }, '~'),
        React.createElement('input', {
          type: 'date', className: 'dsh-sched-input', style: { flex: 'none', width: 138 },
          value: endDate, onChange: (e) => setEndDate(e.target.value),
        }),
      ),
      React.createElement('div', { key: 'r4', className: 'dsh-sched-add-row' },
        React.createElement('input', {
          className: 'dsh-sched-input', placeholder: '目标值', style: { flex: 'none', width: 80 },
          disabled: mtype === 'milestone',
          value: mtype === 'milestone' ? '1' : target, onChange: (e) => setTarget(e.target.value),
        }),
        React.createElement('input', {
          className: 'dsh-sched-input', placeholder: '当前', style: { flex: 'none', width: 80 },
          value: current, onChange: (e) => setCurrent(e.target.value),
        }),
        React.createElement('input', {
          className: 'dsh-sched-input', placeholder: '单位(分/套/…)', style: { flex: 'none', width: 110 },
          value: unit, onChange: (e) => setUnit(e.target.value),
        }),
        React.createElement('span', { style: { fontSize: 10, opacity: .65, flex: 1 } }, HINT[mtype] || ''),
      ),
      React.createElement('div', { key: 'r5', className: 'dsh-sched-add-row' },
        React.createElement('textarea', {
          className: 'dsh-sched-textarea', placeholder: '备注(可选):推进方式,如「每周 2 套真题 + 每天 40 分钟听力」',
          value: note, onChange: (e) => setNote(e.target.value),
        }),
      ),
      React.createElement('div', { key: 'r6', className: 'dsh-sched-add-row' },
        React.createElement('button', { className: 'dsh-sched-addbtn', onClick: save },
          editing ? '保存' : '创建目标'),
        React.createElement('button', {
          className: 'dsh-sched-abtn', onClick: props.onCancel,
        }, '取消'),
        !editing ? React.createElement('span', { style: { fontSize: 10, opacity: .6 } },
          '结束日期留空则按跨度自动推导') : null,
      ),
    ]
    return React.createElement('div', { className: 'dsh-sched-add' }, rows)
  }

  function SchedulePanel(props) {
    const data = useStore(() => store.data)
    const [view, setView] = React.useState('today')
    const [doneCollapsed, setDoneCollapsed] = React.useState(false)
    const [mode, setMode] = React.useState({ type: 'list' })
    const [adding, setAdding] = React.useState(false)
    const [timeFill, setTimeFill] = React.useState(null)
    const [goalsBarOpen, setGoalsBarOpen] = React.useState(readGoalsBarVisible)
    const [ttOpen, setTtOpen] = React.useState(readTtVisible)
    const [goalPrefill, setGoalPrefill] = React.useState('')
    const [companionName, setCompanionNameState] = React.useState(getCompanionName)
    const [explicitHighlightId, setExplicitHighlightId] = React.useState(null)
    const [drawerCollapsed, setDrawerCollapsed] = React.useState(false)
    const [quickAddText, setQuickAddText] = React.useState('')

    function handleRenameCompanion() {
      const next = prompt('输入你喜欢的伴工名字：', companionName)
      if (next !== null && next.trim() !== '') {
        const saved = setCompanionName(next)
        setCompanionNameState(saved)
      }
    }
    const currentSessionId = getActiveSessionId(props)
    // 本面板只作为 better-sidebar 的侧边卡片渲染;visible 由宿主控制,
    // 面板可见期间每 30 秒拉一次数据(其他会话里 agent 工具改了日程也能看到)。
    const active = props.visible !== false
    // 高亮与「现在几点」有关,而 refresh 不保证重渲染 —— 用独立 tick 驱动。
    const [, setClockTick] = React.useState(0)
    React.useEffect(() => {
      if (!active) return undefined
      return every(30000, () => { setClockTick((n) => n + 1) })
    }, [active])
    React.useEffect(() => {
      if (!active) return undefined
      refresh()
      return every(30000, () => { refresh() })
    }, [active])
    async function onMutate(method, args) {
      try { await call(method, args) } catch (e) { console.error('[dsh-schedule] mutate failed', e) }
    }
    function openDetail(id) { setAdding(false); setMode({ type: 'detail', id }) }
    function openEdit(id) { setAdding(false); setMode({ type: 'edit', id }) }
    function backToList() { setMode({ type: 'list' }) }
    function onScheduleTime(st, et) {
      setTimeFill({ startTime: st, endTime: et })
      setAdding(true)
    }
    function openGoal(id) { setAdding(false); setMode({ type: 'goal', id }) }
    function openGoalAdd() { setAdding(false); setMode({ type: 'goal-add' }) }
    /** 从目标详情直接开新建表单,并预选该目标 —— "照这个目标排一条" 的落点。 */
    function addScheduleForGoal(goalId) {
      setGoalPrefill(goalId || '')
      setTimeFill(null)
      setMode({ type: 'list' })
      setAdding(true)
    }
    // 挂到共享 store 上,让任意层级的日程行也能点徽标跳到目标详情(避免逐层透传 props)
    store.openGoal = openGoal

    // 详情/编辑目标若已被删除(agent 侧改动),回落到列表。
    const itemOf = (id) => data !== null ? data.items.find((i) => i.id === id) : undefined
    const goalOf = (id) => (data !== null && Array.isArray(data.goals))
      ? data.goals.find((g) => g.id === id)
      : undefined
    const allGoals = (data !== null && Array.isArray(data.goals)) ? data.goals : []
    let m = mode
    // 目标相关的子视图要查 goals,不能拿日程的 itemOf 去判(否则会被误踢回列表)
    if (m.type === 'goal' || m.type === 'goal-edit') {
      if (goalOf(m.id) === undefined) m = { type: 'list' }
    } else if (m.type !== 'goal-add' && m.type !== 'list' && itemOf(m.id) === undefined) {
      m = { type: 'list' }
    }

    const today = todayStr()
    let body = null
    if (m.type === 'detail') {
      body = React.createElement(DetailView, {
        data: data, item: itemOf(m.id), currentSessionId: currentSessionId,
        onMutate: onMutate, onBack: backToList, onEdit: () => setMode({ type: 'edit', id: m.id }),
      })
    } else if (m.type === 'edit') {
      body = React.createElement(EditForm, {
        item: itemOf(m.id), onMutate: onMutate,
        onCancel: () => setMode({ type: 'detail', id: m.id }),
      })
    } else if (m.type === 'goal') {
      body = React.createElement(GoalDetailView, {
        goal: goalOf(m.id), data: data, today: today, onMutate: onMutate,
        onBack: backToList,
        onAddSchedule: addScheduleForGoal,
        onEdit: () => setMode({ type: 'goal-edit', id: m.id }),
        onOpenItem: (iid) => { setAdding(false); setMode({ type: 'detail', id: iid }) },
      })
    } else if (m.type === 'goal-edit') {
      body = React.createElement(GoalForm, {
        goal: goalOf(m.id), onMutate: onMutate,
        onCancel: () => setMode({ type: 'goal', id: m.id }),
      })
    } else if (m.type === 'goal-add') {
      body = React.createElement(GoalForm, {
        goal: null, onMutate: onMutate, onCancel: backToList,
      })
    } else if (view === 'today') {
      const rows = rowsFor(data, today)
      const todo = rows.filter((r) => !r.done)
      const done = rows.filter((r) => r.done)

      // 1. 今日主角 (Focus Shield)
      const highlight = pickDailyHighlight(todo.map((r) => r.item), data ? data.done : {}, today, explicitHighlightId)
      const heroEl = React.createElement(FocusShieldHero, {
        item: highlight,
        today: today,
        companionName: companionName,
        onRenameCompanion: handleRenameCompanion,
        onMutate: onMutate,
        onOpenDetail: openDetail,
      })

      // 2. 副任务与灵感仓 (Backlog Drawer)
      const backlog = todo.filter((r) => !highlight || r.item.id !== highlight.id)
      const backlogRowEls = []
      for (let i = 0; i < backlog.length; i++) {
        const bItem = backlog[i].item
        backlogRowEls.push(React.createElement('div', {
          key: bItem.id,
          style: {
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 8px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)',
            gap: '8px',
          }
        },
          React.createElement('span', {
            style: { flex: 1, minWidth: 0, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' },
            onClick: () => openDetail(bItem.id),
            title: bItem.title,
          }, bItem.title),
          React.createElement('div', { style: { display: 'flex', gap: '4px', flex: 'none' } },
            React.createElement('button', {
              className: 'dsh-sched-star-btn',
              title: '把这条设为今日主角',
              onClick: () => setExplicitHighlightId(bItem.id),
            }, '⭐ 设为主任务'),
            React.createElement('button', {
              className: 'dsh-sched-star-btn',
              title: '直接开启倒计时',
              onClick: () => cdStart(CD_PREFIX + bItem.id + '|' + today, bItem),
            }, '▶ ' + cdMinutesOf(bItem) + 'm')
          )
        ))
      }

      const drawerEl = React.createElement('div', { className: 'dsh-sched-drawer' },
        React.createElement('div', {
          className: 'dsh-sched-drawer-head',
          onClick: () => setDrawerCollapsed(!drawerCollapsed),
        },
          React.createElement('span', null,
            '📥 副任务与灵感仓',
            React.createElement('span', { className: 'dsh-sched-drawer-cnt' }, backlog.length),
          ),
          React.createElement('span', { style: { fontSize: '11px', color: 'rgba(127,127,127,0.7)' } },
            drawerCollapsed ? '展开 ▼' : '收纳中 ▲'
          )
        ),
        drawerCollapsed ? null : (
          backlogRowEls.length > 0 ? React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, backlogRowEls) : null
        ),
        React.createElement('input', {
          className: 'dsh-sched-quick-input',
          placeholder: '+ 记一个灵感或琐事 (按回车丢进仓里，不排时间，绝不催你)',
          value: quickAddText,
          onChange: (e) => setQuickAddText(e.target.value),
          onKeyDown: (e) => {
            if (e.key === 'Enter' && quickAddText.trim()) {
              onMutate('add', { title: quickAddText.trim(), recurring: 'once', date: today, quadrant: 'q4' })
              setQuickAddText('')
            }
          }
        })
      )

      // 3. 零羞耻战报 (Zero-Shame Wins)
      const winsEl = React.createElement('div', { className: 'dsh-sched-wins' },
        React.createElement('span', null, '🎉 今日战报：' + companionName + '为你点赞！已击倒 ' + done.length + ' 个目标'),
        React.createElement('span', { style: { fontSize: '10px', opacity: 0.8 } },
          done.length > 0 ? '最近：' + done[done.length - 1].item.title : '随时开始'
        )
      )

      // 4. 已完成折叠区
      const doneEls = []
      for (let i = 0; i < done.length; i++) {
        doneEls.push(React.createElement(ScheduleRow, {
          key: done[i].item.id, item: done[i].item, dateStr: today, done: true,
          currentSessionId: currentSessionId, onMutate: onMutate,
          onOpenDetail: openDetail, onOpenEdit: openEdit,
        }))
      }

      body = React.createElement('div', null,
        heroEl,
        drawerEl,
        winsEl,
        doneEls.length > 0 ? React.createElement('div', {
          className: 'dsh-sched-donesum',
          style: { marginTop: '8px' },
          onClick: () => setDoneCollapsed(!doneCollapsed)
        },
          React.createElement('span', null, doneCollapsed ? '▸' : '▾'),
          React.createElement('span', null, '已完成清单 (' + doneEls.length + ')'),
        ) : null,
        doneCollapsed ? null : doneEls,
      )
    } else if (view === 'timeline') {
        body = React.createElement(TimelineView, {
          data: data,
          today: today,
          onMutate: onMutate,
          onOpenDetail: openDetail,
        })
      } else if (view === 'matrix') {
        body = React.createElement(MatrixView, {
          data: data,
          today: today,
          onMutate: onMutate,
          onOpenDetail: openDetail,
        })
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
            currentSessionId: currentSessionId, onMutate: onMutate,
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
        data: data, currentSessionId: currentSessionId, onMutate: onMutate,
        onOpenDetail: openDetail, onOpenEdit: openEdit,
      })
    }
    // 空转目标数:进行中却没有任何日程支撑 —— 放在页脚做常驻提醒
    const idleGoalCount = allGoals.filter((g) => {
      if (g.status !== 'active') return false
      if (data === null || !Array.isArray(data.items)) return true
      return !data.items.some((i) => i !== null && typeof i === 'object' && i.goalId === g.id)
    }).length
    const todayRows = rowsFor(data, today)
    const doneCount = todayRows.filter((r) => r.done).length
    const todoCount = todayRows.length - doneCount
    const inSubView = m.type !== 'list'
    const headerKids = [
      inSubView ? React.createElement('button', { key: 'back', className: 'dsh-sched-backbtn', title: '返回列表', onClick: backToList }, '←') : null,
      !inSubView ? React.createElement('div', { key: 'tabs', className: 'dsh-sched-tabs' },
        React.createElement('button', { className: 'dsh-sched-tab' + (view === 'today' ? ' active' : ''), onClick: () => { setView('today'); setAdding(false); setTimeFill(null) } }, '今天'),
        React.createElement('button', { className: 'dsh-sched-tab' + (view === 'matrix' ? ' active' : ''), onClick: () => { setView('matrix'); setAdding(false); setTimeFill(null) } }, '四象限'),
        React.createElement('button', { className: 'dsh-sched-tab' + (view === 'timeline' ? ' active' : ''), onClick: () => { setView('timeline'); setAdding(false); setTimeFill(null) } }, '时间轴'),
        React.createElement('button', { className: 'dsh-sched-tab' + (view === 'week' ? ' active' : ''), onClick: () => { setView('week'); setAdding(false); setTimeFill(null) } }, '本周'),
        React.createElement('button', { className: 'dsh-sched-tab' + (view === 'history' ? ' active' : ''), onClick: () => { setView('history'); setAdding(false); setTimeFill(null) } }, '历史'),
      ) : null,
      !inSubView ? React.createElement('button', {
        key: 'add',
        className: 'dsh-sched-addtoggle' + (adding ? ' active' : ''),
        title: adding ? '收起添加表单' : '添加日程',
        onClick: () => {
          if (adding) setTimeFill(null)
          setAdding(!adding)
        },
      }, adding ? '收起' : '+ 添加') : null,
      !inSubView ? React.createElement('button', {
        key: 'goals',
        className: 'dsh-sched-goalhead-btn' + (goalsBarOpen ? ' on' : ''),
        type: 'button',
        title: goalsBarOpen ? '隐藏目标条' : '显示目标条',
        onClick: () => {
          const v = !goalsBarOpen
          setGoalsBarOpen(v)
          writeGoalsBarVisible(v)
        },
      }, '🎯') : null,
      !inSubView ? React.createElement('button', {
        key: 'tt',
        className: 'dsh-sched-goalhead-btn' + (ttOpen ? ' on' : ''),
        type: 'button',
        title: ttOpen ? '收起课表' : '展开本周课表',
        onClick: () => {
          const v = !ttOpen
          setTtOpen(v)
          writeTtVisible(v)
        },
      }, '📚') : null,
    ]
    return React.createElement('div', { className: 'dsh-sched-tabwrap' },
      React.createElement('div', { className: 'dsh-sched-header' }, headerKids),
      // 常驻目标条:默认展开,可用 header 的 🎯 一键隐藏(状态记在 localStorage)
      !inSubView && goalsBarOpen
        ? React.createElement(GoalsBar, {
            goals: allGoals, data: data, today: today,
            onOpen: openGoal, onAdd: openGoalAdd,
          })
        : null,
      // 课表区块:默认折叠(点 header 的 📚 展开),只呈现被时间占住的条目
      !inSubView && ttOpen
        ? React.createElement(WeekTimetable, {
            data: data, today: today, onOpenDetail: openDetail,
          })
        : null,
      adding && !inSubView ? React.createElement(AddForm, {
        onMutate: onMutate,
        onCancel: () => { setAdding(false); setTimeFill(null); setGoalPrefill('') },
        initialStartTime: timeFill ? timeFill.startTime : '',
        initialEndTime: timeFill ? timeFill.endTime : '',
        goals: allGoals,
        initialGoalId: goalPrefill,
      }) : null,
      React.createElement('div', { className: 'dsh-sched-body' }, body),
      React.createElement('div', { className: 'dsh-sched-footer' },
        React.createElement('span', null, '今天 ' + todoCount + ' 待办 · ' + doneCount + ' 已完成'
        + (idleGoalCount > 0 ? ' · 🎯 ' + idleGoalCount + ' 个目标无日程' : '')),
      ),
    )
  }

  // 输入框右侧 🔗 打开的"把当前会话关联到日程"选择弹层(挂在 shell.overlay)。
  function ScheduleLinker(props) {
    const linker = useStore(() => store.linker)
    const data = useStore(() => store.data)
    const currentSessionId = getActiveSessionId(props)
    React.useEffect(() => { if (linker && store.data === null) refresh() }, [linker])
    if (!linker) return null
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
    return React.createElement('div', { className: 'dsh-sched-overlay-wrap' },
      React.createElement('div', { className: 'dsh-sched-linker' },
        React.createElement('div', { className: 'dsh-sched-linker-head' },
          React.createElement('span', null, '把当前会话关联到日程'),
          React.createElement('button', { className: 'dsh-sched-close', onClick: () => store.setLinker(false) }, '✕'),
        ),
        React.createElement('div', { className: 'dsh-sched-linker-list' },
          items.length === 0 ? React.createElement('div', { className: 'dsh-sched-empty' }, '还没有日程,点侧边栏「+」打开「日程」面板添加') : list,
        ),
        React.createElement('div', { className: 'dsh-sched-linker-cancel' },
          React.createElement('button', { onClick: () => store.setLinker(false) }, '取消'),
        ),
      ),
    )
  }

  // 弹层级交互:Esc 关闭;点弹层之外关闭。
  // 注意把触发按钮自身排除,否则 mousedown 先关、click 再开,面板会闪住不关。
  function LinkerOverlay(props) {
    const linker = useStore(() => store.linker)
    React.useEffect(() => {
      if (!linker) return undefined
      const inside = '.dsh-sched-linker,.dsh-sched-linkbtn'
      function onKey(e) {
        if (e.key === 'Escape') store.setLinker(false)
      }
      function onDown(e) {
        const t = e.target
        if (t && typeof t.closest === 'function' && t.closest(inside)) return
        store.setLinker(false)
      }
      document.addEventListener('keydown', onKey)
      document.addEventListener('mousedown', onDown)
      return () => {
        document.removeEventListener('keydown', onKey)
        document.removeEventListener('mousedown', onDown)
      }
    }, [linker])
    if (!linker) return null
    return React.createElement(ScheduleLinker, { sessionId: props && props.sessionId })
  }

  // 输入框右侧 🔗:把当前会话关联到日程。
  slots.inject('conversation.input.right', () => slots.register(
    { name: 'conversation.input.right', id: 'dsh-schedule-link', order: 0 },
    () => React.createElement(ScheduleLinkButton),
  ))

  // 关联选择弹层(核心 shell.overlay 是 root list slot,始终可用)。
  slots.inject('shell.overlay', () => slots.register(
    { name: 'shell.overlay', id: 'dsh-schedule-linker' },
    (props) => React.createElement(LinkerOverlay, { sessionId: props && props.sessionId }),
  ))

  // 大倒计时面板:同样挂在 shell.overlay(root list slot),点行内 ▶ 或秒数即打开,
  // 右上角 ⤢ 放大到占满整个界面,✕ 关闭时转为暂停并保留进度。
  slots.inject('shell.overlay', () => slots.register(
    { name: 'shell.overlay', id: 'dsh-schedule-countdown' },
    () => React.createElement(CountdownOverlay),
  ))

  // 主形态:日程 = better-sidebar 侧边卡片的一个 tab。betterSidebar 已在
  // inject 中声明,apply 时必然可用;注册进 tab 注册表后会自动出现在
  // 侧边栏顶部「+」菜单(order 50),从那里即可添加/打开。
  const SCHEDULE_ID = "dsh-schedule";
  const SCHEDULE_KIND = "schedule";

  // 指南页胶囊的图标槽要一个 React 组件,这里用日历 emoji 顶位,
  // 免得和别的入口一样都显示成"方块占位符"。
  function ScheduleGuideIcon() {
    return React.createElement("span", { style: { fontSize: "15px", lineHeight: 1 }, "aria-hidden": "true" }, "📅");
  }

  function scheduleTabDefinition() {
    return {
      id: SCHEDULE_ID,
      kind: SCHEDULE_KIND,
      priority: "extension",
      title: () => "日程",
      // DSH 0.2.x 的右侧栏只有「新标签页」指南页能列出可打开的页面类型,
      // 而指南页的内容完全由各页面类型自己贡献的 guide 条目决定。
      // 不声明 guide 时,这个 tab 类型虽然注册成功,却没有任何入口能加到侧栏
      // (升级 DSH 后旧布局被重置,日程 tab 就是这样"消失"的)。
      guide: [
        {
          id: "schedule",
          order: 50,
          title: () => "日程",
          description: () => "今天 / 四象限 / 时间轴 / 本周 / 历史,含跨月长期目标",
          icon: ScheduleGuideIcon,
        },
      ],
    };
  }

  function openScheduleColumn() {
    if (sidebarRight === undefined || typeof sidebarRight.openTab !== "function") return false;
    try {
      sidebarRight.openTab(SCHEDULE_KIND);
      return true;
    } catch (e) {
      console.warn("[dsh-schedule] openTab failed:", e);
      return false;
    }
  }

  function ScheduleHeaderButton() {
    return React.createElement(
      "button",
      {
        className: "dsh-sched-header-btn",
        type: "button",
        title: "日程规划",
        "aria-label": "日程规划",
        onClick: () => openScheduleColumn(),
      },
      "📅"
    );
  }

  function SchedulePage(props) {
    ensureStyle()
    return React.createElement(SchedulePanel, {
      visible: true,
      sessionId: props && props.sessionId,
    })
  }

  // 1. 注册原生右侧栏 Tab 类型
  if (sidebarRightTabs && typeof sidebarRightTabs.register === "function") {
    ctx.effect(() => sidebarRightTabs.register(scheduleTabDefinition()), "dsh-schedule: tab type");
  }

  // 2. 注册右侧栏内容页 (注册到 id 与 kind 双 key,确保 TabSlot 与 renderSlot 均能无缝命中)
  slots.inject("sidebar.right.pane.tab", () => [
    slots.register(
      { name: "sidebar.right.pane.tab", key: SCHEDULE_ID },
      SchedulePage
    ),
    slots.register(
      { name: "sidebar.right.pane.tab", key: SCHEDULE_KIND },
      SchedulePage
    ),
  ]);

  // 3. 注册右上角会话顶栏图标按钮（并列在动画库/文件夹旁边）
  slots.inject("conversation.session.header.utilities", () =>
    slots.register(
      {
        name: "conversation.session.header.utilities",
        id: SCHEDULE_ID,
        order: 15,
        label: "日程",
      },
      ScheduleHeaderButton
    )
  );

  // 角标数据保底刷新:每 60 秒拉一次(面板没开时角标也能保持新鲜)。
  ctx.effect(() => every(60000, () => { refresh() }), 'dsh-schedule: badge refresher')

  refresh()
  console.log('[dsh-schedule] client ready, side-card tab registered')
}

module.exports = { name: 'dsh-schedule-client', inject: ['slots', 'sessions', 'sidebarRight', 'sidebarRightTabs'], apply }
