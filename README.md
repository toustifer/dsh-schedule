# dsh-schedule

DeepSeek Harness 本地日程 + 长期目标插件 —— 原生右侧栏五视图（今天 / 四象限 / 时间轴 / 本周 / 历史）、艾森豪威尔矩阵拖拽分类、24 小时时间轴（15 分钟磁吸 + 落点预览 + 边缘自动巡航）、跨月学期目标层与进度追踪、日程↔会话链接，以及 11 个 agent 工具。数据长期保存在本地文件。

A local schedule + long-term-goal plugin for DeepSeek Harness: a native right-sidebar workbench with five views, an Eisenhower matrix with drag-and-drop, a 24h timeline with 15-minute snapping, a cross-month goal layer with progress tracking, and 11 agent tools. Data persists in a local file.

## 功能 Features

### 界面

- 📅 **原生右侧栏（唯一形态）** — 注册进 DSH 官方右侧工作区（与「文件」「动画库」同级），不遮挡聊天区、不占会话标题栏。会话顶栏另有一个 📅 图标按钮，一键展开/收起日程栏。
- 🗂️ **五个视图** — `今天` / `四象限` / `时间轴` / `本周` / `历史`，随时切换。
- 🎯 **可隐藏的新闻式目标条** — 目标条以跑马灯形式**无缝循环滚动**（内容超出时才启动，悬停自动暂停）；用滚轮、触控板或按住拖拽都能手动划动查看。顶栏 🎯 按钮一键隐藏/显示，状态记在 `localStorage`（默认展开）。

### 日程（执行层）

- 🗓️ **今天** — 未完成 / 已完成分组，已完成区可折叠；顶部实时统计「今天 N 待办 · M 已完成」。
- 🔴🟡🔵🟢 **四象限** — 经典艾森豪威尔 2×2 矩阵（重要紧急 / 重要不紧急 / 紧急不重要 / 不重要不紧急），**按住卡片跨象限拖拽即改优先级**，自动落盘；象限内可直接打勾。
- ⏱️ **时间轴** — 24 小时垂直网格（每小时 68px 固定基准，拖拽时视口不突跳）：
  - **15 分钟磁吸**：落点自动吸附到 `:00 / :15 / :30 / :45`
  - **落点预览块**：松手前就能看到将落在哪一段
  - **当前时刻红线**：实时刷新，打开时视口自动对准此刻
  - **边缘自动巡航**：拖到视口上/下边缘，时间轴自动翻滚，越靠边越快
  - **三种排期方式**：① 拖拽卡片到刻度 ② 点选待办后点击网格任意位置 ③ 一键「⏱️ 排到当前」
  - **待排期待办池**：尚无时间的日程集中在此，拖入或点选即可排期
- ✅ **完成打勾** — 按天记录，重复日程每天独立；次日自动清空当日记录，历史永久保留。
- ➕ **折叠式添加表单** — 默认收起为「+ 添加」，点开才展开。
- ✏️ **行内编辑 / 详情视图** — 日程条 ✎ 直接改；点标题进详情（完整备注、完成统计、顺延历史、关联会话、**目标归属**）。
- 🔁 **重复日程** — 一次性 / 每天 / 每周（周一~周日多选）。
- ⏭️ **自动顺延（可选）** — 一次性日程到期未完成时自动顺延到今天，顺延经过的历史日期保留在月历中。
- 🔗 **日程 ↔ 会话链接** — 日程条 ⊕ 一键关联当前会话，点会话标签跳回；一个日程可关联多个会话。
- 📊 **历史回顾** — 月历 + 本周 / 本月 / 本年 / 连续完成天数统计，可点选任意历史日期回看当日日程。
- 🔄 **自动刷新** — 面板打开期间每 30 秒同步，其他会话里 agent 改的数据也会出现。

### 目标（长期层）

- 🎓 **跨月目标** — 独立于日程的 `goals` 顶层，用于「本学期 GPA 4.0」「四级 600 分」「修满 122 学分」这类跨月 / 学期的目标。
- 📐 **三种时间跨度** — `学期 (term)` / `学年 (year)` / `自定义 (custom)`，结束日期可留空按跨度自动推导（+140 / +280 / +90 天）。
- 📈 **四种度量** — `数值 (score)`（如 600 分）/ `计数 (count)`（如 12 套）/ `百分比 (percent)` / `里程碑 (milestone)`。
- 🚦 **三态** — `进行中` / `已达成` / `已放弃`。
- 🔗 **日程归属** — 任意日程可归属到一个目标（`goalId`），日程行显示 🎯 徽标，点击直接跳到目标详情。
- 📊 **进度追踪** — 常驻目标条显示迷你进度条；详情页有进度大条、剩余天数、`±步进` 快捷推进、`拉满` 一键达成。**进度为 0 且挂了日程时，自动按「关联日程完成率」推导**（标记为派生态，不写回数据）。
- 🗑️ **删除安全** — 删除目标**不会**删除日程，只会解除归属。

### Agent

- 🤖 **11 个 agent 工具** — 任意对话里说一句就能操作：
  - 日程层：`dailytask_add` / `dailytask_list` / `dailytask_set_done` / `dailytask_update` / `dailytask_delete` / `dailytask_link_session`
  - 目标层：`dailytask_goal_add` / `dailytask_goal_list` / `dailytask_goal_update` / `dailytask_goal_delete` / `dailytask_link_goal`
- 💾 **长期本地存储** — `~/.dsh/dsh-schedule-data.json`，完成历史永不删除；自动迁移旧版数据文件；文件损坏时先备份为 `.corrupt-<时间戳>` 再以空数据启动，绝不覆盖原文。

## 安装 Install

```sh
git clone https://github.com/toustifer/dsh-schedule.git
cd dsh-schedule
node scripts/build.mjs     # 产出 lib/（Host ESM + Client C6 bundle）
node --test test/*.test.mjs

# 安装到 web profile
dsh plugin --profile web add /path/to/dsh-schedule

# 重启 DSH
dsh web
```

> 不需要 `dsh-better-sidebar` 等任何第三方侧边栏插件 —— 本插件直接使用 DSH 官方的 `sidebarRightTabs`。

## 使用 Usage

1. 打开 DSH Web，点会话右上角的 **📅** 图标（或直接展开右侧栏并切到「日程」）打开日程面板。
2. **今天** 视图直接打勾完成；点 ✎ 改，点标题进详情。
3. **四象限** 视图按住卡片拖到别的象限 → 优先级即时生效。
4. **时间轴** 视图：把待排期卡片拖到刻度上，或先点选待办再点网格，或直接点「⏱️ 排到当前」。
5. 在日程**详情**里用下拉框把它归属到某个**长期目标**；目标条上的胶囊点开可改进度/状态。
6. 想少点干扰？点顶栏 **🎯** 把目标条收起来。

## 数据 Data

- 数据文件：`~/.dsh/dsh-schedule-data.json`
- 结构（`version: 2`）：

```json
{
  "version": 2,
  "items": [
    { "id": "dt_x", "title": "背 30 个单词", "date": "2026-09-23",
      "startTime": "08:00", "endTime": "08:30", "quadrant": "q2",
      "goalId": "goal_x", "carryOver": true,
      "linkedSessions": [], "rolloverDates": [] }
  ],
  "done": { "dt_x": { "2026-09-23": true } },
  "goals": [
    { "id": "goal_x", "title": "大学英语四级 600 分", "horizon": "term",
      "startDate": "2026-09-01", "endDate": "2027-01-20",
      "metric": { "type": "score", "target": 600, "current": 420, "unit": "分" },
      "status": "active", "note": "每周 2 套真题 + 每天 40 分钟听力" }
  ]
}
```

- **`items`**：日程定义（执行层，粒度为「天」）
- **`done`**：按 `日程ID → 日期` 永久累积的完成记录，支撑周/月/季/年回顾
- **`goals`**：长期目标（目标层，粒度为「月 / 学期 / 学年」）
- **兼容性**：旧数据文件无 `goals` 字段时视为 `[]`；旧日程 `goalId` 自动补 `null`。
- 备份：拷贝该文件即可。

## 开发 Develop

```sh
node scripts/build.mjs     # 产出 lib/（Host ESM + Client C6 bundle）
node --test test/*.test.mjs # 75 个用例：存储核心 + 客户端纯逻辑 + 构建产物契约
```

改动后需重启 `dsh web` 并在浏览器 `Ctrl + F5` 强制刷新。

详见 [`DEVELOPMENT.md`](./DEVELOPMENT.md)。

## License

MIT
