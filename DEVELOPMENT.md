# dsh-schedule 开发手册 (Development Guide)

> 本仓库是 `magicOF2/dsh-schedule` 的 fork，已全面重写为 **DSH 原生右侧栏 + 目标层** 架构。
> 上游主干（`773a857`）依赖第三方 `dsh-better-sidebar` 且会阻塞 DSH 启动；本 fork 不再依赖它。

---

## 一、技术主权与架构决策

| 决策 | 理由 |
| :--- | :--- |
| **只用 DSH 官方 `sidebarRightTabs`** | 上游把 `betterSidebar` 声明成硬依赖，未安装该插件时 Cordis 会一直 `pending`，直接导致 `web boot: 1 entry did not activate`。改用官方能力后零外部依赖。 |
| **`inject` 保持最小** | 只声明 `slots` + `sidebarRight` + `sidebarRightTabs`；`sessions` / `timer` 一律用**可选**方式取（`ctx.x || ctx.get('x')`），拿不到也不阻塞加载。 |
| **数据层向前兼容、单一写入路径** | 新增 `goals` 顶层与 `goalId` 字段都是**增量**；旧文件无字段时补缺省，保存时统一升 `version: 2`。 |
| **进度算法两端各一份但必须同语义** | `store.js`（宿主 / agent）与 `client/logic.cjs`（浏览器）无法共享模块，因此各实现一份，并用测试断言两者结果一致。 |
| **构建零依赖** | 不引入 Webpack/Vite，`scripts/build.mjs` 直接文本内联产出 C6 bundle，秒级完成。 |

---

## 二、目录结构

```
src/
├── index.js              # 宿主半身
│                         #  · 11 个 agent 工具（6 日程 + 5 目标）
│                         #  · /api/dailytask/* HTTP 数据面（12 条路由）
├── store.js              # 存储核心（纯 Node ESM，可单测）
│                         #  · 文件加载/原子保存/串行化变更
│                         #  · normalizeItem / normalizeGoal / goalProgress
│                         #  · 惰性顺延 reconcileCarryOver
└── client/
    ├── index.js          # 浏览器半身（CJS 形式，构建期内联）
    │                     #  · 右侧栏注册 + 会话顶栏 📅 按钮
    │                     #  · 今天 / 四象限 / 时间轴 / 本周 / 历史
    │                     #  · 目标层：常驻条 / 详情 / 表单 / 归属徽标
    └── logic.cjs         # 客户端纯逻辑（无 React / 无 DOM / 无 IO）
                          #  · 日期运算、排序、时间块解析、冲突检测
                          #  · goalProgressOf / formatGoalMetric（与 store 同语义）

lib/                      # 构建产物（DSH 实际加载这里；已 gitignore）
├── index.js  store.js  client.js

scripts/build.mjs         # 打包：Host 直拷 + Client 包成 window.__ModuleLoader__ 工厂
test/                     # 75 个用例（node:test，零框架）
```

---

## 三、核心机制

### 1. DSH 原生右侧栏注册

```js
// ① 注册页面类型（必须 eager，不能等 slot mount —— openTab 对未注册的 kind 会抛错）
ctx.effect(() => ctx.sidebarRightTabs.register({
  id: 'dsh-schedule', kind: 'schedule',
  priority: 'extension', title: () => '日程',
}), 'dsh-schedule: tab type')

// ② 页面本体
slots.inject('sidebar.right.pane.tab', () => slots.register(
  { name: 'sidebar.right.pane.tab', key: 'dsh-schedule' }, SchedulePage))

// ③ 会话顶栏入口（与「文件」「动画库」同级）
slots.inject('conversation.session.header.utilities', () => slots.register(
  { name: 'conversation.session.header.utilities', id: 'dsh-schedule', order: 15 }, ScheduleHeaderButton))
```

**踩坑记录**：`ctx.get('slots')` 跨作用域查不到兄弟插件的服务，会静默返回 `undefined`。必须用 `ctx.slots`，或把依赖写进 `inject` 让 Cordis 保证就绪。

### 2. 艾森豪威尔四象限

`quadrant` 字段取 `q1`~`q4`，缺省 `q2`。卡片 `draggable`，象限容器接 `onDragOver` / `onDragLeave` / `onDrop`，落下即 `onMutate('update', { id, quadrant })`。象限内保留打勾圆圈（走 `set-done`）。

### 3. 垂直时间轴（Time-blocking / Snap Drag / Auto-scroll）

24 小时垂直网格 + 15 分钟磁吸 + 三种排期入口。**每小时固定 68px —— 这是踩过坑后的硬约束。**

```
hourHeight = 68                     // 固定值，绝不随拖拽变化
yToSnappedRange(y, dur)             // y(px) → 吸附到 :00/:15/:30/:45 的 {start,end,top,height}
handleAutoScroll(clientY)           // 视口上/下 70px 触发巡航，越靠边越快
stopAutoScroll()                    // 离开边缘或松手时刹停
applyTaskSchedule(id, start, end)   // 唯一写入路径：time / startTime / endTime 一起写
```

**三种排期入口**（容错率递增，互为兜底）：

| 方式 | 触发 | 适用 |
| :--- | :--- | :--- |
| 拖拽 | 按住卡片拖到刻度，松手 | 需要精确定位到某个空档 |
| 点选 + 点击网格 | 先点待办（变 `👉`），再点网格任意位置 | 窄侧边栏下比拖拽更好操作 |
| ⏱️ 排到当前 | 点待办右侧按钮 | 一键排到此刻（默认 45 分钟） |

**三个必须知道的坑（都已在代码里写死防线）：**

1. **拖拽时视口绝不能突变。** 早期版本让 `hourHeight` 在拖拽时从 52 弹到 110，结果按住鼠标的一瞬间整条时间轴被撑大、内容整体位移，光标对应的时间完全错乱。现在恒定 68px，网格 CSS **严禁出现 `transition`**（`bundle.test.mjs` 有断言守着）。
2. **落点不能只依赖 React state。** `onDragOver` 里 `setPreviewSlot` 是异步批处理的，`onDrop` 闭包可能读到 `null` → 卡片直接弹回。现在松手瞬间用 `e.clientY` 重算兜底：`const slot = previewSlot || yToSnappedRange(relY, dur)`。
3. **载荷要三级回退。** `dataTransfer` 在部分内核下会丢：`draggingItemRef.current || draggingItem || window.__DSH_DRAG_ITEM__`。

### 4. 目标层（Goals：跨月 / 学期目标）

日程是**执行层**（粒度为「天」），目标是**目标层**（粒度为「月 / 学期 / 学年」）。两层通过 `item.goalId` 单向归属。

```
horizon : term(学期) | year(学年) | custom(自定义)   -- 决定 endDate 缺省跨度 +140/+280/+90 天
metric  : score(数值) | count(计数) | percent(百分比) | milestone(里程碑，强制 target=1)
status  : active(进行中) | done(已达成) | dropped(已放弃)
```

**进度计算 `goalProgress(goal, data, today)`** —— `store.js` 与 `client/logic.cjs` 各一份，测试断言二者结果一致：

- 优先用手填的 `metric.current`；
- 当 `current === 0` **且**目标下挂了日程时，退化为「关联日程完成率」推导，并打上 `derived: true`（**仅展示，不写回数据** —— 避免把展示逻辑变成副作用）；
- `remainingDays` = `endDate - today`，夹取到非负。

**UI 形态：可一键隐藏的常驻条。** 目标层是**低频查看、高频归属**的操作，所以做成常驻条而非独立 tab（tab 栏已有 5 个，再挤会更难看）。但常驻条容易显眼，因此顶栏加了 🎯 按钮一键收起，状态存 `localStorage`（键 `dsh-schedule:goals-bar`），默认展开。

**删除安全性**：`removeGoal` 只删目标并把归属日程的 `goalId` 置 `null`，**绝不连带删除日程**。UI 上是二次确认按钮。

### 5. 目标条跑马灯（News-ticker Marquee）

目标条要做成「新闻滚动条」：自动循环滚动，同时允许用户手动划动。三个要点：

**① 只在内容溢出时启动。** 目标少的时候静止排列 —— 一条目标在空荡荡的条里来回滚很傻。用 `ResizeObserver` 量 `seq.offsetWidth > track.clientWidth` 来决定。

**② 三份拷贝 + 视口锚在中间份 = 双向无限。** 这是整个循环的关键：

```
[ seq ][ seq ][ seq ]      内容周期 = w（一份序列宽）
        ^^^^              视口初始锚在第二份起点（scrollLeft = w）

reseat():  scrollLeft ∈ [w, 2w)
           s <  w      →  s + w
           s >= 2w     →  s - w
```

因为内容周期为 `w`，加减一个 `w` **视觉上完全等价**，所以这个"回绕"用户看不出来。只复制 2 份的话左边界会撞到 `scrollLeft = 0` 而卡住，必须 3 份才有左右各一份的缓冲。

注意 `reseat` 要加锁（`reseatingRef` + 下一帧解锁）—— 给 `scrollLeft` 赋值会**异步再派发一次 `scroll` 事件**，不锁就会递归。

**③ 手动划动三种输入都要接。** `overflow-x: auto` 负责滚轮/触控板，指针拖拽单独实现：

- 抖动阈值 `GOALS_DRAG_SLOP = 4px`：小于它一律当点击，**不抢走 chip 的 onClick**；
- 超过阈值才 `setPointerCapture` 并跟手 `scrollLeft = d.left - dx`；
- 拖过之后置 `suppressClickRef`，并让 chip 的 `openChip` 检查它 —— 否则"划完一下"会误开目标详情；
- 容器设 `touch-action: pan-y`：纵向照常翻页，横向归我们处理。

**暂停策略**：悬停或拖拽时停掉 rAF；另外尊重 `prefers-reduced-motion: reduce`（直接不启动自动滚动）。

**视觉**：滚动条隐藏（`scrollbar-width: none` + `::-webkit-scrollbar{display:none}`），跑马灯态加两端渐隐遮罩（`mask-image: linear-gradient(...)`）—— 遮罩作用在轨道盒上而不是滚动内容上，所以渐隐固定在条的两端。

### 6. 一次性任务惰性自动顺延（Carry-Over）

未完成的一次性日程（`recurring: 'once'` 且 `carryOver: true`）采用**读写时惰性计算**，无需常驻定时器：任何 `listForDate` / `snapshot` / 写入都会触发检测，把生效日期推进到 `today`，同时把历经的每一天写进 `rolloverDates`，让月历仍能追溯。

### 7. 数据模型（`version: 2`）

```json
{
  "version": 2,
  "items": [
    {
      "id": "dt_mu3os0np_2hx7im",
      "title": "思若宁公司：AI 补贴登记与领取",
      "recurring": "once",
      "date": "2026-09-23",
      "quadrant": "q3",
      "time": "15:00-15:45",
      "startTime": "15:00",
      "endTime": "15:45",
      "goalId": "goal_mujgjgeu_nrf32d",
      "note": "在线登记 + 材料提交 + 领取确认",
      "carryOver": true,
      "rolloverDates": ["2026-09-16", "2026-09-17"],
      "linkedSessions": ["session-95097218"]
    }
  ],
  "done": { "dt_mu3os0np_2hx7im": { "2026-09-23": true } },
  "goals": [
    {
      "id": "goal_mujgjgeu_nrf32d",
      "title": "大学英语四级 600 分",
      "horizon": "term",
      "startDate": "2026-09-01",
      "endDate": "2027-01-20",
      "metric": { "type": "score", "target": 600, "current": 420, "unit": "分" },
      "status": "active",
      "note": "每周 2 套真题 + 每天 40 分钟听力",
      "linkedSessions": [],
      "createdAt": 1789518887992
    }
  ]
}
```

**向后兼容**（`load()` 里实现，测试覆盖）：

- 旧文件无 `goals` → 视为 `[]`；
- 旧日程无 `goalId` → 补 `null`（`normalizeStoredItem`）；
- 旧日程只有 `time: "15:00"` → 自动推导 `startTime` / `endTime`；
- 保存时统一升到 `version: 2`。

**损坏自愈**：JSON 解析失败或 `items` 非数组时，先把原文备份为 `<文件>.corrupt-<时间戳>` 再以空数据启动；若连备份都失败，则设 `protectUnparsedFile` 暂停写盘，绝不覆盖用户原文。

---

## 四、Agent 工具与数据面

| 层 | 工具 | 说明 |
| :--- | :--- | :--- |
| 日程 | `dailytask_add` | 支持 `time` 单点或区间、`start_time`/`end_time`、`quadrant`、`goal_id` |
| 日程 | `dailytask_list` | 按日期列出（重复日程按日展开），带完成状态 |
| 日程 | `dailytask_set_done` | 按天打勾 / 取消 |
| 日程 | `dailytask_update` | 只更新提供的字段 |
| 日程 | `dailytask_delete` | 删除日程 |
| 日程 | `dailytask_link_session` | 关联 / 取消关联当前会话 |
| 目标 | `dailytask_goal_add` | 新建目标（`horizon` / `metric_type` / `metric_target` …） |
| 目标 | `dailytask_goal_list` | 列出目标 + 进度 + 关联日程，可按 `status` 过滤 |
| 目标 | `dailytask_goal_update` | 推进度 / 改状态 / 改跨度（`metric_current` 自动夹在 `0~target`） |
| 目标 | `dailytask_goal_delete` | 删除目标并解除日程归属 |
| 目标 | `dailytask_link_goal` | 把日程归属到目标（传空串 = 解除） |

工具入参统一是 `snake_case`，`goalArgsFrom()` 负责映射到 store 的 `camelCase`。

**HTTP 数据面**（浏览器面板用）：`/get` `/add` `/update` `/remove` `/setDone` `/set-done` `/link-session` `/goal-add` `/goal-list` `/goal-update` `/goal-remove` `/link-goal`

> `/setDone` 与 `/set-done` 是同一个处理器的两个别名 —— 历史上前端曾用驼峰调用而宿主只注册了连字符版本，导致四象限打勾静默 404。保留别名以免回归。

---

## 五、构建、测试与调试

### 1. 构建

```bash
node scripts/build.mjs        # → lib/index.js, lib/store.js, lib/client.js
```

### 2. 测试

```bash
node --test test/*.test.mjs   # 76 个用例
```

| 文件 | 覆盖 |
| :--- | :--- |
| `test/store.test.mjs` | 存储核心：字段归一化、顺延算法、损坏自愈、边界日期 |
| `test/client-logic.test.mjs` | 客户端纯逻辑：日期运算、排序、时间块解析、冲突检测 |
| `test/bundle.test.mjs` | **构建产物契约**：时间轴网格 / 吸附 / 稳定视口 / 三种排期入口、目标层 UI 与显隐持久化 |
| `test/goals.test.mjs` | 目标层：模型校验、CRUD、归属与解除、进度算法、旧数据兼容、**宿主 11 工具 + 5 路由契约** |

> **写 `bundle.test.mjs` 的两个坑：**
> 1. CSS 全部集中在文件顶部的 `const CSS`，**不在各组件区段内** —— 样式断言要用整个 bundle 匹配，只有逻辑断言才用 `timelineSection()` 切区段。
> 2. 断言必须对着**当前实现**写。仓库里曾有一组断言 `setPointerCapture` / `startRulerSlide` / `timeRulerShift` 的测试，那套 Time Ruler 设计早已被移除，于是 4 个用例长期变红、失去信号价值。

### 3. 生效与调试

```bash
node scripts/build.mjs
# 重启 dsh web（Ctrl+C 后重新运行），浏览器 Ctrl+F5 强制刷新
```

改完一定要**重启** `dsh web` —— 客户端 bundle 在启动时注入，热刷新拿不到新代码。

### 4. 提交

```bash
git add src/ test/ README.md DEVELOPMENT.md
git commit -m "feat: ..."
git push myfork main:feat-quadrant-view
```

---

## 六、Roadmap

### 已完成

- ✅ **原生右侧栏**（摆脱 `better-sidebar` 硬依赖，不再阻塞 DSH 启动）
- ✅ **艾森豪威尔四象限**（跨象限拖拽 + 象限内打勾）
- ✅ **垂直时间轴**（24h 网格 / 15 分钟磁吸 / 落点预览 / 边缘自动巡航 / 三种排期入口）
- ✅ **目标层 Goals**（跨月目标、进度追踪、可隐藏常驻条、归属徽章、删除安全）
- ✅ **目标条跑马灯**（溢出才启动 / 三份拷贝双向无限循环 / 悬停暂停 / 拖拽与滚轮划动）

### 待办

1. **☕ 空闲时段显式化**：相邻任务之间的空隙渲染为可点击的 `☕ 空闲 1h30m`，点击即在该时段快速新建日程。
2. **⚠️ 冲突检测可视化**：两个任务时段交叠时重叠区标红，并给「是否顺延下游」的一键调整。
3. **🔗 任务前后因果依赖（Blocker / Next Action）**：数据增加 `dependsOn: string[]`；前置未完成时下游呈半透明等待态，完成后自动点亮为 `🔥 Next Action`。
4. **🎨 视觉打磨**：暗/浅色模式高对比度色卡、四象限卡片折叠与筛选标签。
5. **📊 回顾页扩展**：周/月/季/年回顾除「完成 N 条」外，增加「本期各目标进度变化」。
