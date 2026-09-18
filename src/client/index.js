/**
 * dsh-schedule — 浏览器半身(CommonJS 形式,由 scripts/build.mjs 包装为
 * DSH client-modules C6 bundle;纯逻辑辅助在 logic.cjs 中先行内联)。
 *
 * 表面(仅一种形态):
 *   1. better-sidebar 侧边卡片「日程」tab(registerTab,order 50,
 *      由侧边栏顶部「+」菜单添加/打开;single:true 幂等)—— 今天 / 本周 /
 *      历史月历+统计、行内 ✎ 编辑、点标题进详情、添加表单折叠为「+ 添加」、
 *      tab 角标显示今天剩余待办
 *   2. 输入框右侧 🔗 关联按钮(conversation.input.right)+ shell.overlay
 *      里的关联选择弹层 —— 把当前会话关联到某条日程
 *
 * betterSidebar 是硬依赖(inject),Cordis 会等服务出现后再 apply,
 * 不再有"有时抽屉、有时侧边卡片"的竞态;因此不保留任何降级抽屉。
 *
 * 数据面:/api/dailytask/*。依赖 React(模块表 externals),无构建期依赖。
 */

const React = require('react')

// 注:CSS 全部展开为单行字符串(构建脚本只做文本内联,不做 CSS 压缩)。
const CSS = '.dsh-sched-linkbtn{display:inline-flex;align-items:center;justify-content:center;background:transparent;border:1px solid transparent;border-radius:8px;padding:3px 6px;font-size:14px;cursor:pointer;color:inherit;}.dsh-sched-linkbtn:hover,.dsh-sched-linkbtn.active{background:rgba(127,127,127,.14);}.dsh-sched-overlay-wrap{position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:1000;font-family:inherit;}.dsh-sched-header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(127,127,127,.2);font-weight:600;font-size:14px;}.dsh-sched-tabs{display:flex;gap:4px;margin-left:auto;}.dsh-sched-tab{border:1px solid rgba(127,127,127,.3);background:transparent;border-radius:8px;padding:3px 10px;font-size:12px;cursor:pointer;color:inherit;}.dsh-sched-tab.active{background:rgba(9,105,218,.12);border-color:rgba(9,105,218,.5);color:#0969da;}.dsh-sched-add{padding:10px 12px;border-bottom:1px solid rgba(127,127,127,.2);display:flex;flex-direction:column;gap:6px;}.dsh-sched-add-row{display:flex;gap:6px;align-items:center;}.dsh-sched-input{flex:1;min-width:0;background:rgba(127,127,127,.08);border:1px solid rgba(127,127,127,.3);border-radius:8px;padding:5px 9px;font-size:13px;color:inherit;}.dsh-sched-input:focus{outline:none;border-color:rgba(9,105,218,.6);}.dsh-sched-addbtn{background:#0969da;color:#fff;border:none;border-radius:8px;padding:5px 12px;font-size:13px;cursor:pointer;white-space:nowrap;}.dsh-sched-addbtn:hover{background:#0a5bb8;}.dsh-sched-add-opts{display:flex;gap:6px;flex-wrap:wrap;align-items:center;}.dsh-sched-weekdays{display:flex;gap:3px;}.dsh-sched-wd{border:1px solid rgba(127,127,127,.35);background:transparent;border-radius:50%;width:24px;height:24px;font-size:11px;cursor:pointer;color:inherit;display:flex;align-items:center;justify-content:center;padding:0;}.dsh-sched-wd.on{background:rgba(9,105,218,.18);border-color:#0969da;color:#0969da;}.dsh-sched-body{flex:1;overflow-y:auto;padding:8px 10px;}.dsh-sched-day{padding:6px 0;}.dsh-sched-dayhead{font-size:12px;font-weight:600;color:rgba(127,127,127,.9);margin:4px 2px 6px;display:flex;align-items:center;gap:6px;}.dsh-sched-dayhead.today{color:#0969da;}.dsh-sched-dayhead .cnt{font-weight:400;color:rgba(127,127,127,.7);}.dsh-sched-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;}.dsh-sched-row:hover{background:rgba(127,127,127,.1);}.dsh-sched-circle{width:18px;height:18px;border-radius:50%;border:2px solid rgba(127,127,127,.7);background:transparent;cursor:pointer;flex:none;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;padding:0;}.dsh-sched-circle.done{background:#2da44e;border-color:#2da44e;}.dsh-sched-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;}.dsh-sched-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:default;}.dsh-sched-title.linked{cursor:pointer;color:#0969da;}.dsh-sched-title.done{text-decoration:line-through;opacity:.5;}.dsh-sched-meta{display:flex;gap:5px;align-items:center;font-size:11px;color:rgba(127,127,127,.85);flex-wrap:wrap;}.dsh-sched-pill{background:rgba(127,127,127,.14);border-radius:5px;padding:0 5px;font-size:10px;line-height:16px;}.dsh-sched-note{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px;}.dsh-sched-chips{display:flex;gap:4px;flex-wrap:wrap;align-items:center;}.dsh-sched-chip{display:inline-flex;align-items:center;gap:2px;max-width:130px;background:rgba(9,105,218,.1);color:#0969da;border:1px solid rgba(9,105,218,.3);border-radius:10px;padding:1px 7px;font-size:11px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.dsh-sched-link{flex:none;width:20px;height:20px;border-radius:50%;border:1px dashed rgba(127,127,127,.6);background:transparent;font-size:11px;cursor:pointer;color:rgba(127,127,127,.8);display:flex;align-items:center;justify-content:center;padding:0;}.dsh-sched-link:hover{border-color:#0969da;color:#0969da;}.dsh-sched-link.on{border-color:rgba(127,127,127,.5);background:rgba(127,127,127,.12);color:rgba(127,127,127,.8);}.dsh-sched-del{flex:none;border:none;background:transparent;color:rgba(127,127,127,.65);font-size:13px;cursor:pointer;border-radius:6px;padding:0 4px;}.dsh-sched-del:hover{color:#d1242f;background:rgba(209,36,47,.1);}.dsh-sched-del.confirm{color:#fff;background:#d1242f;font-size:11px;border-radius:8px;padding:2px 6px;}.dsh-sched-donesum{padding:5px 8px;font-size:12px;color:rgba(127,127,127,.85);cursor:pointer;display:flex;align-items:center;gap:5px;border-radius:8px;}.dsh-sched-donesum:hover{background:rgba(127,127,127,.1);}.dsh-sched-empty{padding:18px 8px;text-align:center;color:rgba(127,127,127,.7);font-size:12px;}.dsh-sched-footer{padding:6px 12px;border-top:1px solid rgba(127,127,127,.2);font-size:11px;color:rgba(127,127,127,.75);display:flex;justify-content:space-between;gap:8px;}.dsh-sched-linker{position:fixed;bottom:86px;right:16px;width:300px;max-width:calc(100vw - 32px);background:#ffffff;color:#1f2328;border:1px solid rgba(127,127,127,.3);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.22);pointer-events:auto;font-size:13px;overflow:hidden;z-index:1001;}.dsh-sched-linker-head{padding:9px 12px;font-weight:600;font-size:13px;border-bottom:1px solid rgba(127,127,127,.2);display:flex;align-items:center;justify-content:space-between;}.dsh-sched-linker-list{max-height:280px;overflow-y:auto;padding:6px;}.dsh-sched-linker-item{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:8px;cursor:pointer;}.dsh-sched-linker-item:hover{background:rgba(127,127,127,.1);}.dsh-sched-linker-item .tag{margin-left:auto;font-size:10px;color:rgba(127,127,127,.7);flex:none;}.dsh-sched-linker-item.linked .tag{color:#2da44e;}.dsh-sched-linker-cancel{padding:7px;border-top:1px solid rgba(127,127,127,.2);text-align:center;}.dsh-sched-linker-cancel button{border:none;background:transparent;color:rgba(127,127,127,.8);cursor:pointer;font-size:12px;padding:2px 12px;border-radius:8px;}.dsh-sched-linker-cancel button:hover{background:rgba(127,127,127,.1);}.dsh-sched-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin:2px 0 6px;}.dsh-sched-calhead{text-align:center;font-size:10px;color:rgba(127,127,127,.7);padding:2px 0;}.dsh-sched-cald{border:1px solid rgba(127,127,127,.14);border-radius:6px;min-height:40px;padding:2px;cursor:pointer;text-align:center;font-size:11px;display:flex;flex-direction:column;align-items:center;gap:1px;background:transparent;color:inherit;}.dsh-sched-cald:hover{border-color:rgba(127,127,127,.45);}.dsh-sched-cald.empty{visibility:hidden;}.dsh-sched-cald.today{border-color:#0969da;}.dsh-sched-cald.sel{background:rgba(9,105,218,.16);border-color:#0969da;}.dsh-sched-cald .d{font-size:11px;line-height:1.3;}.dsh-sched-cald .s{font-size:9px;color:rgba(127,127,127,.8);line-height:1.2;}.dsh-sched-cald .s.doneall{color:#2da44e;font-weight:600;}.dsh-sched-calnav{display:flex;align-items:center;justify-content:space-between;margin:2px 2px 6px;}.dsh-sched-calnav button{border:1px solid rgba(127,127,127,.3);background:transparent;border-radius:6px;padding:2px 9px;font-size:12px;cursor:pointer;color:inherit;}.dsh-sched-calnav button:hover{background:rgba(127,127,127,.12);}.dsh-sched-calnav .t{font-weight:600;font-size:13px;}.dsh-sched-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:8px;}.dsh-sched-stat{background:rgba(127,127,127,.07);border:1px solid rgba(127,127,127,.15);border-radius:8px;padding:5px 4px;text-align:center;}.dsh-sched-stat .v{font-size:15px;font-weight:700;line-height:1.3;}.dsh-sched-stat .k{font-size:10px;color:rgba(127,127,127,.75);margin-top:1px;}.dsh-sched-histhead{font-size:12px;font-weight:600;color:rgba(127,127,127,.9);margin:4px 2px 6px;}.dsh-sched-backbtn{border:none;background:transparent;border-radius:8px;padding:2px 8px;font-size:15px;line-height:1;cursor:pointer;color:inherit;}.dsh-sched-backbtn:hover{background:rgba(127,127,127,.15);}.dsh-sched-addtoggle{border:1px solid rgba(9,105,218,.5);background:rgba(9,105,218,.08);color:#0969da;border-radius:8px;padding:3px 10px;font-size:12px;line-height:1.4;cursor:pointer;white-space:nowrap;}.dsh-sched-addtoggle:hover{background:rgba(9,105,218,.16);}.dsh-sched-addtoggle.active{background:#0969da;border-color:#0969da;color:#fff;}.dsh-sched-textarea{width:100%;min-height:56px;resize:vertical;background:rgba(127,127,127,.08);border:1px solid rgba(127,127,127,.3);border-radius:8px;padding:6px 9px;font-size:13px;color:inherit;font-family:inherit;box-sizing:border-box;}.dsh-sched-textarea:focus{outline:none;border-color:rgba(9,105,218,.6);}.dsh-sched-editbtn{flex:none;border:none;background:transparent;color:rgba(127,127,127,.75);font-size:13px;cursor:pointer;border-radius:6px;padding:0 4px;}.dsh-sched-editbtn:hover{color:#0969da;background:rgba(9,105,218,.08);}.dsh-sched-detail{padding:12px 14px 14px;display:flex;flex-direction:column;gap:10px;}.dsh-sched-detail-title{font-size:16px;font-weight:600;line-height:1.5;word-break:break-word;}.dsh-sched-detail-pills{display:flex;gap:5px;flex-wrap:wrap;align-items:center;}.dsh-sched-section{border-top:1px solid rgba(127,127,127,.16);padding-top:8px;display:flex;flex-direction:column;gap:6px;}.dsh-sched-section-label{font-size:11px;font-weight:600;color:rgba(127,127,127,.85);}.dsh-sched-note-full{white-space:pre-wrap;word-break:break-word;line-height:1.6;font-size:13px;background:rgba(127,127,127,.07);border-radius:8px;padding:8px 10px;}.dsh-sched-note-empty{font-size:12px;color:rgba(127,127,127,.7);}.dsh-sched-actions{margin-top:auto;display:flex;gap:6px;flex-wrap:wrap;padding-top:10px;border-top:1px solid rgba(127,127,127,.16);}.dsh-sched-abtn{display:inline-flex;align-items:center;gap:4px;border:1px solid rgba(127,127,127,.35);background:transparent;border-radius:8px;padding:5px 12px;font-size:12px;line-height:1.4;cursor:pointer;color:inherit;}.dsh-sched-abtn:hover{background:rgba(127,127,127,.1);}.dsh-sched-abtn.primary{background:#0969da;border-color:#0969da;color:#fff;}.dsh-sched-abtn.primary:hover{background:#0a5bb8;}.dsh-sched-abtn.danger{color:#d1242f;border-color:rgba(209,36,47,.5);}.dsh-sched-abtn.danger:hover{background:rgba(209,36,47,.08);}.dsh-sched-abtn.danger.confirm{background:#d1242f;border-color:#d1242f;color:#fff;}.dsh-sched-chip.static{cursor:default;}@media (prefers-color-scheme: dark){.dsh-sched-linker{background:#1b1e23;color:#e6e8eb;border-color:rgba(255,255,255,.16);}.dsh-sched-tab.active{background:rgba(86,155,235,.18);border-color:rgba(86,155,235,.55);color:#6cb0f5;}.dsh-sched-addbtn{background:#2f7be0;}.dsh-sched-title.linked,.dsh-sched-chip,.dsh-sched-dayhead.today{color:#6cb0f5;}.dsh-sched-chip{background:rgba(86,155,235,.14);border-color:rgba(86,155,235,.4);}.dsh-sched-wd.on{background:rgba(86,155,235,.2);border-color:#6cb0f5;color:#6cb0f5;}.dsh-sched-input:focus{border-color:rgba(86,155,235,.6);}.dsh-sched-cald.today,.dsh-sched-cald.sel{border-color:#6cb0f5;}.dsh-sched-cald.sel{background:rgba(86,155,235,.2);}.dsh-sched-calnav button{border-color:rgba(255,255,255,.25);}.dsh-sched-addtoggle{color:#6cb0f5;border-color:rgba(86,155,235,.55);background:rgba(86,155,235,.14);}.dsh-sched-addtoggle.active{background:#2f7be0;border-color:#2f7be0;color:#fff;}.dsh-sched-section,.dsh-sched-actions{border-top-color:rgba(255,255,255,.12);}.dsh-sched-note-full{background:rgba(255,255,255,.06);}.dsh-sched-abtn{border-color:rgba(255,255,255,.28);}.dsh-sched-abtn.primary{background:#2f7be0;border-color:#2f7be0;}.dsh-sched-editbtn:hover{color:#6cb0f5;background:rgba(86,155,235,.12);}.dsh-sched-textarea:focus{border-color:rgba(86,155,235,.6);}}.dsh-sched-tabwrap { display: flex; flex-direction: column; flex: auto; height: 100%; min-height: 0; background: transparent; color: inherit; box-sizing: border-box; overflow: hidden; }.dsh-sched-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.2)); flex: none; gap: 8px; }.dsh-sched-tabs { display: flex; gap: 4px; }.dsh-sched-tab { border: 1px solid rgba(127,127,127,.3); background: transparent; border-radius: 6px; padding: 3px 9px; font-size: 12px; cursor: pointer; color: inherit; }.dsh-sched-tab.active { background: rgba(9,105,218,.15); border-color: #0969da; color: #0969da; font-weight: 600; }.dsh-sched-addtoggle { border: 1px solid rgba(9,105,218,.5); background: rgba(9,105,218,.08); color: #0969da; border-radius: 6px; padding: 3px 9px; font-size: 12px; cursor: pointer; white-space: nowrap; }.dsh-sched-addtoggle.active { background: #0969da; color: #fff; }.dsh-sched-body { flex: auto; min-height: 0; overflow-y: auto !important; overflow-x: hidden; padding: 12px 14px; scrollbar-gutter: stable; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }.dsh-sched-body::-webkit-scrollbar { width: 6px; }.dsh-sched-body::-webkit-scrollbar-thumb { background: rgba(127,127,127,.3); border-radius: 3px; }.dsh-sched-body::-webkit-scrollbar-thumb:hover { background: rgba(127,127,127,.5); }.dsh-sched-footer { padding: 8px 14px; border-top: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.18)); font-size: 11px; color: rgba(127,127,127,.75); display: flex; justify-content: space-between; flex: none; }.dsh-sched-header-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; background: none; border: none; border-radius: 6px; color: var(--dsw-alias-label-secondary, inherit); cursor: pointer; font-size: 14px; }.dsh-sched-header-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); color: var(--dsw-alias-label-primary, inherit); }/* 四象限网格 */.dsh-sched-matrix { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 8px; height: 100%; min-height: 480px; box-sizing: border-box; }.dsh-sched-qbox { display: flex; flex-direction: column; border-radius: 8px; border: 1px dashed rgba(127,127,127,.3); background: rgba(127,127,127,.04); padding: 8px; min-height: 0; overflow: hidden; transition: border-color .15s, background .15s; }.dsh-sched-qbox.dragover { border-color: #0969da !important; border-style: solid !important; background: rgba(9,105,218,.12) !important; }.dsh-sched-qhead { display: flex; align-items: center; justify-content: space-between; padding-bottom: 4px; margin-bottom: 6px; border-bottom: 1px solid rgba(127,127,127,.15); flex: none; }.dsh-sched-qtitle { font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 4px; }.dsh-sched-qsubtitle { font-size: 9px; color: rgba(127,127,127,.7); margin-left: 3px; font-weight: 400; }.dsh-sched-qcnt { font-size: 10px; padding: 1px 5px; border-radius: 10px; background: rgba(127,127,127,.15); font-weight: 600; }.dsh-sched-qlist { display: flex; flex-direction: column; gap: 5px; flex: 1; overflow-y: auto; padding-right: 2px; min-height: 0; }.dsh-sched-qcard { display: flex; align-items: center; gap: 5px; padding: 6px 7px; background: rgba(127,127,127,.08); border: 1px solid rgba(127,127,127,.18); border-radius: 6px; cursor: grab; user-select: none; font-size: 11px; transition: box-shadow .15s, transform .1s; }.dsh-sched-qcard:hover { border-color: rgba(127,127,127,.45); background: rgba(127,127,127,.12); box-shadow: 0 2px 5px rgba(0,0,0,.08); }.dsh-sched-qcard:active { cursor: grabbing; }.dsh-sched-qcard.dragging { opacity: .35; transform: scale(0.98); }.dsh-sched-qcard.done { opacity: .5; text-decoration: line-through; }.dsh-sched-qcard .qhandle { color: rgba(127,127,127,.45); font-size: 12px; cursor: grab; flex: none; }.dsh-sched-qcard .qtitle { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }.dsh-sched-qcard .qtime { font-size: 9px; padding: 1px 4px; border-radius: 3px; background: rgba(127,127,127,.15); flex: none; }.dsh-sched-qempty { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 10px; color: rgba(127,127,127,.45); border: 1px dashed rgba(127,127,127,.18); border-radius: 5px; min-height: 40px; }/* 垂直时间轴排程样式 */.dsh-sched-timeline { display: flex; flex-direction: column; gap: 14px; min-height: 100%; height: auto; box-sizing: border-box; padding-bottom: 24px; }.dsh-sched-tl-statbar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 6px 10px; background: rgba(127,127,127,.08); border: 1px solid rgba(127,127,127,.18); border-radius: 8px; font-size: 11px; flex: none; }.dsh-sched-tl-pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 12px; background: rgba(127,127,127,.12); font-weight: 500; }.dsh-sched-tl-pill.warn { background: rgba(207,34,46,.15); color: #cf222e; font-weight: 600; }.dsh-sched-tl-axis { position: relative; display: flex; flex-direction: column; gap: 12px; padding-left: 18px; border-left: 2px solid rgba(127,127,127,.25); margin-left: 12px; margin-top: 6px; flex: none; }.dsh-sched-tl-node { position: relative; flex: none; width: 100%; box-sizing: border-box; }.dsh-sched-tl-dot { position: absolute; left: -24px; top: 12px; width: 10px; height: 10px; border-radius: 50%; background: #0969da; border: 2px solid var(--dsw-alias-bg-canvas, #1f2328); box-sizing: border-box; z-index: 2; }.dsh-sched-tl-dot.conflict { background: #cf222e; }.dsh-sched-tl-dot.free { background: rgba(127,127,127,.4); width: 8px; height: 8px; left: -23px; }.dsh-sched-tl-card { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; background: rgba(127,127,127,.08); border: 1px solid rgba(127,127,127,.2); border-radius: 8px; font-size: 12px; box-sizing: border-box; word-break: break-word; transition: all .15s; }.dsh-sched-tl-card:hover { border-color: rgba(127,127,127,.45); background: rgba(127,127,127,.12); box-shadow: 0 2px 8px rgba(0,0,0,.1); }.dsh-sched-tl-card.conflict { border-color: #cf222e; background: rgba(207,34,46,.08); }.dsh-sched-tl-card.done { opacity: .55; text-decoration: line-through; }.dsh-sched-tl-topline { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; }.dsh-sched-tl-time { font-family: monospace; font-weight: 700; font-size: 12px; color: #0969da; display: inline-flex; align-items: center; gap: 6px; }.dsh-sched-tl-dur { font-size: 10px; color: rgba(127,127,127,.75); font-weight: normal; }.dsh-sched-tl-warn { font-size: 10px; color: #cf222e; background: rgba(207,34,46,.12); padding: 4px 8px; border-radius: 4px; margin-top: 4px; font-weight: 600; display: flex; align-items: center; gap: 4px; word-break: break-word; }.dsh-sched-tl-free-box { display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; border: 1px dashed rgba(127,127,127,.3); border-radius: 6px; font-size: 11px; color: rgba(127,127,127,.75); background: rgba(127,127,127,.02); transition: all .15s; }.dsh-sched-tl-free-box.dragover { border-color: #0969da; border-style: solid; background: rgba(9,105,218,.14); box-shadow: 0 0 10px rgba(9,105,218,.25); color: #0969da; font-weight: 600; }.dsh-sched-tl-dot.free.dragover { background: #0969da; transform: scale(1.3); }.dsh-sched-tl-free-btn { border: none; background: transparent; color: #0969da; cursor: pointer; font-size: 10px; padding: 1px 6px; border-radius: 4px; flex: none; }.dsh-sched-tl-free-btn:hover { background: rgba(9,105,218,.12); text-decoration: underline; }.dsh-sched-tl-unscheduled { margin-top: 20px; padding: 10px 12px; background: rgba(127,127,127,.04); border: 1px solid rgba(127,127,127,.18); border-radius: 8px; flex: none; clear: both; }.dsh-sched-tl-un-header { font-size: 12px; font-weight: 600; color: inherit; display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none; margin-bottom: 6px; }.dsh-sched-tl-un-list { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }.dsh-sched-tl-now-wrap { display: flex; align-items: center; position: relative; margin: 4px 0; z-index: 3; }.dsh-sched-tl-now-dot { position: absolute; left: -25px; top: 50%; transform: translateY(-50%); width: 12px; height: 12px; border-radius: 50%; background: #cf222e; border: 2px solid var(--dsw-alias-bg-canvas, #1f2328); box-sizing: border-box; z-index: 4; box-shadow: 0 0 0 0 rgba(207,34,46,.7); animation: dsh-sched-pulse 2s infinite cubic-bezier(.45, 0, .55, 1); }@keyframes dsh-sched-pulse { 0% { box-shadow: 0 0 0 0 rgba(207,34,46,.7); } 70% { box-shadow: 0 0 0 6px rgba(207,34,46,0); } 100% { box-shadow: 0 0 0 0 rgba(207,34,46,0); } }.dsh-sched-tl-now-line { display: flex; align-items: center; position: relative; width: 100%; height: 2px; background: linear-gradient(90deg, #cf222e 0%, rgba(207,34,46,.4) 75%, transparent 100%); margin-left: -18px; padding-left: 24px; }.dsh-sched-tl-now-label { display: inline-flex; align-items: center; gap: 4px; background: #cf222e; color: #fff; font-size: 10px; font-weight: 700; font-family: monospace; padding: 1px 7px; border-radius: 10px; box-shadow: 0 1px 4px rgba(207,34,46,.35); white-space: nowrap; letter-spacing: .3px; user-select: none; }.dsh-sched-tl-dot.overdue:not(.conflict) { background: #d97706; }.dsh-sched-tl-card.overdue { border-color: rgba(217,119,6,.45); background: rgba(217,119,6,.06); }.dsh-sched-tl-overdue { font-size: 11px; color: #d97706; background: rgba(217,119,6,.12); padding: 3px 8px; border-radius: 4px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; align-self: flex-start; margin-top: 2px; }.dsh-sched-tl-dragcard { display: flex; align-items: center; gap: 4px; background: rgba(127,127,127,.06); border: 1px solid rgba(127,127,127,.18); border-radius: 8px; padding: 1px 6px; cursor: grab; user-select: none; transition: all .15s; }.dsh-sched-tl-dragcard:hover { background: rgba(127,127,127,.12); border-color: rgba(127,127,127,.4); box-shadow: 0 2px 6px rgba(0,0,0,.08); }.dsh-sched-tl-dragcard:active { cursor: grabbing; }.dsh-sched-tl-dragcard.dragging { opacity: .35; transform: scale(0.98); }.dsh-sched-tl-dragcard.done { opacity: .5; }.dsh-sched-tl-dragcard .qhandle { color: rgba(127,127,127,.45); font-size: 13px; cursor: grab; flex: none; padding: 2px; }.dsh-sched-tl-dragcard .dsh-sched-row { flex: 1; min-width: 0; padding: 4px 2px; background: transparent; }.dsh-sched-tl-dragcard .dsh-sched-row:hover { background: transparent; }.dsh-sched-tl-adjust-group { display: inline-flex; align-items: center; gap: 3px; margin-left: 4px; }.dsh-sched-tl-adjust-btn { display: inline-flex; align-items: center; justify-content: center; background: transparent; border: 1px solid rgba(127,127,127,.22); border-radius: 999px; padding: 0 5px; height: 16px; font-size: 10px; line-height: 1; cursor: pointer; color: inherit; opacity: .65; transition: all .15s; user-select: none; }.dsh-sched-tl-adjust-btn:hover { opacity: 1; background: rgba(9,105,218,.12); border-color: rgba(9,105,218,.4); color: #0969da; }'

const STYLE_ID = "@dsh-schedule/panel.css"

function ensureStyle() {
  const doc = globalThis.document
  if (doc === undefined) return
  if (doc.querySelector('style[data-plugin-css="' + STYLE_ID + '"]') !== null) return
  const el = doc.createElement('style')
  el.dataset.plugin = "dsh-schedule"
  el.dataset.pluginCss = STYLE_ID
  el.textContent = CSS
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
  function ScheduleRow(props) {
    const { item, dateStr, done, currentSessionId, onMutate, onOpenDetail, onOpenEdit } = props
    const [confirmDel, setConfirmDel] = React.useState(false)
    React.useEffect(() => {
      if (!confirmDel) return undefined
      if (timerSvc !== undefined && typeof timerSvc.timeout === 'function') return timerSvc.timeout(() => setConfirmDel(false), 3000)
      const t = setTimeout(() => setConfirmDel(false), 3000)
      return () => clearTimeout(t)
    }, [confirmDel])
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
    const { onMutate, onCancel, initialStartTime, initialEndTime } = props
    const [title, setTitle] = React.useState('')
    const [date, setDate] = React.useState('')
    const [recurring, setRecurring] = React.useState('once')
    const [weekdays, setWeekdays] = React.useState([])
    const [startTime, setStartTime] = React.useState(initialStartTime || '')
    const [endTime, setEndTime] = React.useState(initialEndTime || '')
    const [quadrant, setQuadrant] = React.useState('q2')
    const [note, setNote] = React.useState('')
    const [carryOver, setCarryOver] = React.useState(false)
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
        note: note || undefined,
        carryOver: recurring === 'once' ? carryOver : undefined,
      })
      setTitle(''); setDate(''); setRecurring('once'); setWeekdays([]); setStartTime(''); setEndTime(''); setQuadrant('q2'); setNote(''); setCarryOver(false)
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
      if (timerSvc !== undefined && typeof timerSvc.timeout === 'function') return timerSvc.timeout(() => setConfirmDel(false), 3000)
      const t = setTimeout(() => setConfirmDel(false), 3000)
      return () => clearTimeout(t)
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
                        onMutate('setDone', { id: r.item.id, date: today, done: !r.done })
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
    const { data, today, currentSessionId, onMutate, onOpenDetail, onOpenEdit, onScheduleTime, timerSvc } = props
    const [unscheduledOpen, setUnscheduledOpen] = React.useState(false)
    const [draggingId, setDraggingId] = React.useState(null)
    const [dropTargetFree, setDropTargetFree] = React.useState(null)
    const [selectedUnscheduledId, setSelectedUnscheduledId] = React.useState(null)
    const [nowMinutes, setNowMinutes] = React.useState(() => getCurrentMinutes())

    // 动态流动游标: 每 60 秒自动刷新
    React.useEffect(() => {
      const update = () => setNowMinutes(getCurrentMinutes())
      update()
      if (timerSvc && typeof timerSvc.interval === 'function') {
        return timerSvc.interval(update, 60000)
      }
      const timer = setInterval(update, 60000)
      return () => clearInterval(timer)
    }, [timerSvc])

    const isToday = today === todayStr()
    const rows = rowsFor(data, today)
    const schedule = computeTimeSchedule(rows, {
      startHour: 8,
      endHour: 22,
      nowMinutes: isToday ? nowMinutes : undefined,
    })
    const { nodes, unscheduled, stats } = schedule

    const QUADRANT_MAP = {
      q1: { title: '重要紧急', dot: '🔴', color: '#cf222e' },
      q2: { title: '重要不紧急', dot: '🟡', color: '#0969da' },
      q3: { title: '紧急不重要', dot: '🔵', color: '#d97706' },
      q4: { title: '不重要不紧急', dot: '🟢', color: '#1a7f37' },
    }

    const handleAssignToFree = async (startTime) => {
      if (!selectedUnscheduledId) return
      await onMutate('update', { id: selectedUnscheduledId, startTime: startTime, time: startTime })
      setSelectedUnscheduledId(null)
    }

    return React.createElement('div', { className: 'dsh-sched-timeline' },
      React.createElement('div', { className: 'dsh-sched-tl-statbar' },
        React.createElement('span', { className: 'dsh-sched-tl-pill' }, '⏱️ 专注 ' + stats.totalBusyText),
        React.createElement('span', { className: 'dsh-sched-tl-pill' }, '☕ 空闲 ' + stats.totalFreeText),
        stats.conflictCount > 0
          ? React.createElement('span', { className: 'dsh-sched-tl-pill warn' }, '⚠️ ' + stats.conflictCount + ' 处时段冲突')
          : React.createElement('span', { className: 'dsh-sched-tl-pill' }, '✅ 无冲突撞车'),
      ),
      selectedUnscheduledId ? React.createElement('div', {
        className: 'dsh-sched-tl-statbar',
        style: { background: 'rgba(9,105,218,.1)', borderColor: 'rgba(9,105,218,.3)', color: '#0969da' },
      },
        React.createElement('span', null, '👉 已选中待办，点击下方任意「☕ 空闲」卡片即可一键填入该时段排程'),
        React.createElement('button', {
          className: 'dsh-sched-tl-free-btn',
          onClick: () => setSelectedUnscheduledId(null),
        }, '取消选择'),
      ) : null,
      React.createElement('div', { className: 'dsh-sched-tl-axis' },
        nodes.length === 0
          ? React.createElement('div', { className: 'dsh-sched-empty' }, '今日暂无带具体时间的日程')
          : nodes.map((n, idx) => {
              if (n.type === 'now') {
                return React.createElement('div', { key: 'now_' + n.time, className: 'dsh-sched-tl-node dsh-sched-tl-now-wrap' },
                  React.createElement('div', { className: 'dsh-sched-tl-now-dot' }),
                  React.createElement('div', { className: 'dsh-sched-tl-now-line' },
                    React.createElement('span', { className: 'dsh-sched-tl-now-label' }, n.label || (n.time + ' 现在')),
                  ),
                )
              }
              if (n.type === 'free') {
                const isOver = dropTargetFree === idx
                const canAssign = !!selectedUnscheduledId
                return React.createElement('div', { key: 'free_' + idx, className: 'dsh-sched-tl-node' },
                  React.createElement('div', { className: 'dsh-sched-tl-dot free' + (isOver ? ' dragover' : '') }),
                  React.createElement('div', {
                    className: 'dsh-sched-tl-free-box' + (isOver ? ' dragover' : ''),
                    style: canAssign ? { borderColor: '#0969da', background: 'rgba(9,105,218,.08)', cursor: 'pointer' } : {},
                    onDragOver: (e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      e.dataTransfer.dropEffect = 'move'
                      if (dropTargetFree !== idx) setDropTargetFree(idx)
                    },
                    onDragEnter: (e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (dropTargetFree !== idx) setDropTargetFree(idx)
                    },
                    onDragLeave: (e) => {
                      e.stopPropagation()
                      if (e.currentTarget.contains(e.relatedTarget)) return
                      if (dropTargetFree === idx) setDropTargetFree(null)
                    },
                    onDrop: async (e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setDropTargetFree(null)
                      const id = e.dataTransfer.getData('text/plain') || draggingId
                      if (id) {
                        await onMutate('update', { id, startTime: n.startTime, time: n.startTime })
                      }
                    },
                    onClick: () => {
                      if (canAssign) handleAssignToFree(n.startTime)
                    },
                  },
                    React.createElement('span', null,
                      isOver
                        ? '✨ 松手排程至 ' + n.startTime
                        : (canAssign
                            ? '👉 点击将选中待办排入 ' + n.startTime + ' (' + n.durationText + ')'
                            : '☕ 空闲 ' + n.startTime + ' - ' + n.endTime + ' (' + n.durationText + ')')),
                    onScheduleTime && !canAssign ? React.createElement('button', {
                      className: 'dsh-sched-tl-free-btn',
                      onClick: (e) => {
                        e.stopPropagation()
                        onScheduleTime(n.startTime, n.endTime)
                      },
                    }, '+ 排程') : null,
                  ),
                )
              }
              const isConflict = n.conflicts && n.conflicts.length > 0
              const qInfo = QUADRANT_MAP[n.item.quadrant] || QUADRANT_MAP.q2
              const overdueMinutes = isToday ? getOverdueMinutes(n, nowMinutes) : 0
              const isOverdue = overdueMinutes > 0

              const handleQuickAdjust = async (delta, e) => {
                if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
                const adj = calculateQuickAdjust(n.block, delta)
                if (adj) {
                  await onMutate('update', { id: n.item.id, endTime: adj.newEndTime, time: adj.newTimeStr })
                }
              }

              return React.createElement('div', { key: n.item.id, className: 'dsh-sched-tl-node' },
                React.createElement('div', { className: 'dsh-sched-tl-dot' + (isConflict ? ' conflict' : '') + (isOverdue ? ' overdue' : '') }),
                React.createElement('div', { className: 'dsh-sched-tl-card' + (isConflict ? ' conflict' : '') + (isOverdue ? ' overdue' : '') + (n.done ? ' done' : '') },
                  React.createElement('div', { className: 'dsh-sched-tl-topline' },
                    React.createElement('div', { className: 'dsh-sched-tl-time' },
                      React.createElement('button', {
                        className: 'dsh-sched-circle' + (n.done ? ' done' : ''),
                        onClick: () => onMutate('setDone', { id: n.item.id, date: today, done: !n.done }),
                        title: n.done ? '标记未完成' : '标记已完成',
                      }, n.done ? '✓' : ''),
                      React.createElement('span', null, n.block.startTime + (n.block.isRange ? ' - ' + n.block.endTime : '')),
                      React.createElement('span', { className: 'dsh-sched-tl-dur' }, '(' + formatDuration(n.block.durationMinutes) + ')'),
                      React.createElement('span', { className: 'dsh-sched-tl-adjust-group' },
                        React.createElement('button', {
                          type: 'button',
                          className: 'dsh-sched-tl-adjust-btn',
                          title: '快捷延期 15 分钟',
                          onClick: (e) => handleQuickAdjust(15, e),
                        }, '+15m'),
                        React.createElement('button', {
                          type: 'button',
                          className: 'dsh-sched-tl-adjust-btn',
                          title: '快捷延期 30 分钟',
                          onClick: (e) => handleQuickAdjust(30, e),
                        }, '+30m'),
                      ),
                    ),
                    React.createElement('span', { style: { fontSize: 10, color: qInfo.color, fontWeight: 600 } }, qInfo.dot + ' ' + qInfo.title),
                  ),
                  React.createElement('div', {
                    className: 'dsh-sched-title' + (n.done ? ' done' : ''),
                    style: { cursor: 'pointer', fontWeight: 600, whiteSpace: 'normal', lineHeight: 1.4 },
                    onClick: () => onOpenDetail(n.item.id),
                  }, n.item.title),
                  n.item.note ? React.createElement('div', { className: 'dsh-sched-note', style: { maxWidth: '100%', whiteSpace: 'pre-wrap', lineHeight: 1.4 } }, n.item.note) : null,
                  isOverdue ? React.createElement('div', { className: 'dsh-sched-tl-overdue' },
                    formatOverdueText(overdueMinutes),
                  ) : null,
                  isConflict ? React.createElement('div', { className: 'dsh-sched-tl-warn' },
                    '⚠️ 与「' + n.conflicts.map((c) => c.title + ' ' + (c.time || c.startTime)).join(' / ') + '」时段撞车！',
                  ) : null,
                ),
              )
            }),
      ),
      unscheduled.length > 0 ? React.createElement('div', { className: 'dsh-sched-tl-unscheduled' },
        React.createElement('div', {
          className: 'dsh-sched-tl-un-header',
          onClick: () => setUnscheduledOpen(!unscheduledOpen),
          title: '点击展开/收起未安排具体时段的待办',
        },
          React.createElement('span', null, (unscheduledOpen ? '▾' : '▸') + ' 📋 待安排具体时段 (' + unscheduled.length + ')'),
          React.createElement('span', { style: { fontSize: 11, opacity: .7 } }, unscheduledOpen ? '收起' : '展开查看'),
        ),
        unscheduledOpen ? React.createElement('div', { className: 'dsh-sched-tl-un-list' },
          unscheduled.map((u) => {
            const isDragging = draggingId === u.item.id
            const isSelected = selectedUnscheduledId === u.item.id
            return React.createElement('div', {
              key: u.item.id,
              className: 'dsh-sched-tl-dragcard' + (isDragging ? ' dragging' : '') + (isSelected ? ' selected' : '') + (u.done ? ' done' : ''),
              style: isSelected ? { borderColor: '#0969da', background: 'rgba(9,105,218,.12)', outline: '2px solid rgba(9,105,218,.4)' } : {},
              draggable: true,
              onDragStart: (e) => {
                e.stopPropagation()
                setDraggingId(u.item.id)
                e.dataTransfer.setData('text/plain', u.item.id)
                e.dataTransfer.effectAllowed = 'move'
              },
              onDragEnd: (e) => {
                e.stopPropagation()
                setDraggingId(null)
                setDropTargetFree(null)
              },
              onClick: () => {
                setSelectedUnscheduledId(isSelected ? null : u.item.id)
              },
            },
              React.createElement('span', { className: 'qhandle', title: '按住拖动安排时段' }, '⋮⋮'),
              React.createElement(ScheduleRow, {
                item: u.item,
                dateStr: today,
                done: u.done,
                currentSessionId: currentSessionId,
                onMutate: onMutate,
                onOpenDetail: onOpenDetail,
                onOpenEdit: onOpenEdit,
              }),
            )
          })
        ) : null,
      ) : null,
    )
  }

  function SchedulePanel(props) {
    const data = useStore(() => store.data)
    const [view, setView] = React.useState('today')
    const [doneCollapsed, setDoneCollapsed] = React.useState(false)
    const [mode, setMode] = React.useState({ type: 'list' })
    const [adding, setAdding] = React.useState(false)
    const [timeFill, setTimeFill] = React.useState(null)
    const currentSessionId = getActiveSessionId(props)
    // 本面板只作为 better-sidebar 的侧边卡片渲染;visible 由宿主控制,
    // 面板可见期间每 30 秒拉一次数据(其他会话里 agent 工具改了日程也能看到)。
    const active = props.visible !== false
    React.useEffect(() => {
      if (!active) return undefined
      refresh()
      if (timerSvc === undefined || typeof timerSvc.interval !== 'function') return undefined
      return timerSvc.interval(() => { refresh() }, 30000)
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

    // 详情/编辑目标若已被删除(agent 侧改动),回落到列表。
    const itemOf = (id) => data !== null ? data.items.find((i) => i.id === id) : undefined
    let m = mode
    if (m.type !== 'list' && itemOf(m.id) === undefined) m = { type: 'list' }

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
    } else if (view === 'today') {
      const rows = rowsFor(data, today)
      const todo = rows.filter((r) => !r.done)
      const done = rows.filter((r) => r.done)
      const rowEls = []
      for (let i = 0; i < todo.length; i++) {
        rowEls.push(React.createElement(ScheduleRow, {
          key: todo[i].item.id, item: todo[i].item, dateStr: today, done: false,
          currentSessionId: currentSessionId, onMutate: onMutate,
          onOpenDetail: openDetail, onOpenEdit: openEdit,
        }))
      }
      const doneEls = []
      for (let i = 0; i < done.length; i++) {
        doneEls.push(React.createElement(ScheduleRow, {
          key: done[i].item.id, item: done[i].item, dateStr: today, done: true,
          currentSessionId: currentSessionId, onMutate: onMutate,
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
    } else if (view === 'matrix') {
        body = React.createElement(MatrixView, {
          data: data,
          today: today,
          onMutate: onMutate,
          onOpenDetail: openDetail,
        })
      } else if (view === 'timeline') {
        body = React.createElement(TimelineView, {
          data: data,
          today: today,
          currentSessionId: currentSessionId,
          onMutate: onMutate,
          onOpenDetail: openDetail,
          onOpenEdit: openEdit,
          onScheduleTime: onScheduleTime,
          timerSvc: timerSvc,
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
    ]
    return React.createElement('div', { className: 'dsh-sched-tabwrap' },
      React.createElement('div', { className: 'dsh-sched-header' }, headerKids),
      adding && !inSubView ? React.createElement(AddForm, {
        onMutate: onMutate,
        onCancel: () => { setAdding(false); setTimeFill(null) },
        initialStartTime: timeFill ? timeFill.startTime : '',
        initialEndTime: timeFill ? timeFill.endTime : '',
      }) : null,
      React.createElement('div', { className: 'dsh-sched-body' }, body),
      React.createElement('div', { className: 'dsh-sched-footer' },
        React.createElement('span', null, '今天 ' + todoCount + ' 待办 · ' + doneCount + ' 已完成'),
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

  // 主形态:日程 = better-sidebar 侧边卡片的一个 tab。betterSidebar 已在
  // inject 中声明,apply 时必然可用;注册进 tab 注册表后会自动出现在
  // 侧边栏顶部「+」菜单(order 50),从那里即可添加/打开。
  const SCHEDULE_ID = "dsh-schedule";
  const SCHEDULE_KIND = "schedule";

  function scheduleTabDefinition() {
    return {
      id: SCHEDULE_ID,
      kind: SCHEDULE_KIND,
      priority: "extension",
      title: () => "日程",
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
  if (timerSvc !== undefined && typeof timerSvc.interval === 'function') {
    ctx.effect(() => timerSvc.interval(() => { refresh() }, 60000), 'dsh-schedule: badge refresher')
  }

  refresh()
  console.log('[dsh-schedule] client ready, side-card tab registered')
}

module.exports = { name: 'dsh-schedule-client', inject: ['slots', 'sessions', 'sidebarRight', 'sidebarRightTabs'], apply }
