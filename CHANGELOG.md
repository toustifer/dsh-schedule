# v0.4.0 — 原生右侧栏 · 四象限 · 时间轴 · 目标层 · AI 内容接口

这是本 fork 第一个**成形**的版本，把上游 `773a857` 那份「依赖第三方 `dsh-better-sidebar`、未安装时直接阻塞 DSH 启动」的实现，整体重写为只使用 DSH 官方能力的完整工作台。

## ✨ 这一版有什么

### 界面

- **原生右侧栏（唯一形态）** — 注册进 DSH 官方 `sidebarRightTabs`（与「文件」「动画库」同级），不再依赖 `dsh-better-sidebar`。会话顶栏另有 📅 图标一键展开/收起。
- **五个视图** — 今天 / 四象限 / 时间轴 / 本周 / 历史。
- **可一键隐藏的新闻式目标条** — 溢出时自动跑马灯无缝循环（三份拷贝 + 视口锚中间份，双向无限），悬停/拖拽暂停；滚轮、触控板、指针拖拽都能手动划动。

### 日程（执行层）

- **四象限** — 艾森豪威尔 2×2 矩阵，按住卡片跨象限拖拽即改优先级，象限内可直接打勾。
- **时间轴** — 24 小时垂直网格（每小时固定 68px，拖拽时视口不突跳）、15 分钟磁吸、落点预览块、当前时刻红线、边缘自动巡航。**三种排期入口**：拖拽 / 点选待办后点网格 / 一键「⏱️ 排到当前」。
- 重复日程（一次性 / 每天 / 每周）、未完成自动顺延、日程↔会话双向跳转、月历与周/月/年完成统计。

### 目标（长期层）

- 跨月 / 学期 / 学年目标，`horizon` × `metric`（数值/计数/百分比/里程碑）× `status` 三态。
- 进度追踪：常驻条迷你进度条 + 详情页大进度条、剩余天数、`±步进`、`拉满`。手填进度为 0 且挂了日程时，自动按关联日程完成率推导（标记派生态，不写回）。
- 日程可归属到目标，日程行显示 🎯 徽标；删除目标只解除归属，**绝不连带删日程**。
- **新建时就能挂目标** — 新建表单里直接选长期目标，不必先建完再进详情改；未归属时给一句轻提示（提醒而不拦着）。目标的空列表页提供「+ 照这个目标排一条日程」，一键带目标预选开表单。
- **空转目标会主动提醒** — 进行中却一条日程都没挂的目标，胶囊转虚线并标「无日程」，页脚常驻统计「🎯 N 个目标无日程」。没有日程支撑的目标推不动，这类静默失速最该被看见。

### Agent 工具（14 个）

| 层 | 工具 |
| :--- | :--- |
| 日程 | `dailytask_add` / `_list` / `_set_done` / `_update` / `_delete` / `_link_session` |
| 目标 | `dailytask_goal_add` / `_goal_list` / `_goal_update` / `_goal_delete` / `_link_goal` |
| 通用 | `dailytask_batch`（一次最多 200 条 op，默认原子回滚）/ `_doc_get` / `_doc_patch`（读写扩展顶层字段） |

`dailytask_batch` 复用单条工具的同一套校验（`applyOne()` 派发到既有领域方法），所以批量路径和单条路径行为不会漂移。

## 🐛 修复

- **四象限打勾静默 404** —— 前端调 `/setDone`，宿主只注册了 `/set-done`。已补别名并写进文档防回归。
- **`load()`/`save()` 白名单重构导致丢数据**（issue #2）—— 原本用固定字段白名单重建整个文档，任何本版本不认识的顶层字段都会在 load 时被丢弃、save 时被写没；由于 Store 是「内存持有 + 全量覆写」，旧代码进程写一次盘就会抹掉新字段。现在以原文为基底展开保留未知字段，并在写盘时先读盘合并。附带 `writtenBy` 标记便于事后归因，`__proto__` 键做了原型污染防护。
- **跑马灯 `unset` 后字段复活** —— `serializeForDisk` 的「磁盘未知字段优先」与 `docPatch` 的删除语义冲突，删掉的字段会被从磁盘搬回来。新增 `removedKeys` 墓碑集合区分「没见过」与「明确删过」，墓碑在真正读盘与批次回滚时归零。
- **4 个长期变红的僵尸测试** —— `bundle.test.mjs` 里有一组断言指向已被移除的 Time Ruler 设计（`setPointerCapture` / `startRulerSlide` / `timeRulerShift` / 「严禁使用原生 HTML5 draggable」），已重写为对当前实现的契约测试。
- **`goal_id` 只存在于 schema，没写进工具描述** —— 模型只看得见 `description`，参数说明再全它也不会主动传。`dailytask_add` / `dailytask_update` 的描述现在明写 `goal_id` 的用途与解除语义。

## 🧪 测试

**98 个用例全绿**

| 文件 | 覆盖 |
| :--- | :--- |
| `test/store.test.mjs` | 存储核心：字段归一化、顺延算法、损坏自愈、边界日期 |
| `test/client-logic.test.mjs` | 客户端纯逻辑：日期运算、排序、时间块解析、冲突检测 |
| `test/bundle.test.mjs` | 构建产物契约：时间轴网格/吸附/稳定视口/三种排期入口、目标层 UI 与跑马灯显隐、新建即挂目标、空转目标提醒 |
| `test/goals.test.mjs` | 目标层：模型校验、CRUD、归属与解除、进度算法、旧数据兼容、工具描述含 `goal_id` |
| `test/persistence.test.mjs` | 持久化契约：未知字段不丢、多进程写入不互相覆盖、writer/version 标记、`__proto__` 防护 |
| `test/api.test.mjs` | 通用接口：batch 派发与原子回滚、扩展字段读写、墓碑语义 |

## 📦 安装

```sh
git clone https://github.com/toustifer/dsh-schedule.git
cd dsh-schedule
node scripts/build.mjs
dsh plugin --profile web add /path/to/dsh-schedule
dsh web          # 重启后生效
```

**不需要** `dsh-better-sidebar` 等任何第三方侧边栏插件。

## ⚠️ 升级提示

如果你的 DSH 里还跑着**旧版代码的宿主进程**，它会在任意一次写入时按旧白名单覆写数据文件，把 `goals` 等新字段抹掉。升级后请务必**重启 `dsh web`**（host 端插件不会因文件变化而重载，只有 client bundle 会）。

## 数据格式

`version: 2`，结构为 `{ version, writtenBy, items, done, goals, ...扩展字段 }`。旧文件无 `goals` 视为 `[]`、旧日程 `goalId` 补 `null`，保存时自动升级。
