# DSH Schedule 开发手册 (Development Guide)

> **项目仓库**：[toustifer/dsh-schedule](https://github.com/toustifer/dsh-schedule)  
> **核心定位**：专为 DeepSeek Harness (DSH) 打造的本地原生长期日程管理与个人精力调度中心。

---

## 一、架构设计理念与技术主权

本项目由 `toustifer` Fork 并全面自主掌控演进。区别于原版对第三方插件的偶合绑定，我们确立了以下核心架构原则：

1. **官方原生第一（Native-First）**：
   - 彻底摆脱第三方侧边栏束缚，全面接入 DSH 官方原生右侧栏规范（`sidebarRight` / `sidebarRightTabs` / `slots`）；
   - 在会话顶栏（`conversation.session.header.utilities`）注册原生入口按钮，与文件管理器、动画库并列，无缝呼出右侧看板，不遮挡聊天流。
2. **高阶生产力矩阵（Matrix & Focus）**：
   - 内置艾森豪威尔四象限（重要/紧急 2x2 看板），支持流畅拖拽分类，使任务不仅仅是“排期”，更是“精力管理”。
3. **数据主权与高容错存储（Local & Resilient）**：
   - 数据以标准 JSON 持久化在用户本地目录 `~/.dsh/dsh-schedule-data.json`；
   - 具备损坏自动隔离备份机制（`.corrupt-时间戳`）与平滑迁移策略，绝不丢数据。
4. **双端无缝协同（AI + Human）**：
   - Host 侧注册 6 个标准 Agent 模型工具，支持在任意对话中自然语言唤起增删改查；
   - Client 侧提供毫秒级响应的交互面板，状态双向实时同步。

---

## 二、目录结构与代码组织

```text
dsh-schedule/
├── package.json              # 插件元信息、DSH Bundle 配置及构建脚本
├── DEVELOPMENT.md            # 本开发手册
├── README.md                 # 面向用户的产品说明文档
├── LICENSE                   # MIT 开源协议
├── cordis.patch.yml          # DSH 插件 Bundle patch 声明
├── scripts/
│   └── build.mjs             # 双端编译打包脚本 (打包 Host ESM 与 Client Bundle)
├── src/
│   ├── index.js              # Host 端入口：注册 6 个 AI 模型工具与 HTTP API
│   ├── store.js              # 存储引擎：数据持久化、自动顺延、跨期计算与损坏自愈
│   └── client/
│       ├── index.js          # Web 客户端入口：Slot 注入、四象限看板、列表与详情 UI
│       └── logic.cjs         # 客户端纯函数：日期算法、行过滤与统计（可单测）
├── test/                     # 单元测试套件 (node:test 原生测试)
│   ├── bundle.test.mjs       # 打包规格测试
│   ├── client-logic.test.mjs # 客户端算法测试
│   └── store.test.mjs        # 存储引擎与跨期顺延测试
└── lib/                      # 编译目标产物 (运行时实际加载文件)
    ├── index.js              # Host ESM 产物
    ├── store.js              # 存储模块 ESM 产物
    └── client.js             # 客户端 CommonJS 打包产物
```

---

## 三、核心机制实现详解

### 1. DSH 官方原生右侧栏注册
客户端通过 `slots` 与 `sidebarRightTabs` 原生接口注入，不依赖任何第三方 UI 库：
```javascript
// 1. 注册右侧栏 Tab 规格
ctx.sidebarRightTabs.register({
  id: "dsh-schedule",
  kind: "schedule",
  priority: "extension",
  title: () => "日程",
});

// 2. 注入右侧栏主内容页面
slots.inject("sidebar.right.pane.tab", () =>
  slots.register({ name: "sidebar.right.pane.tab", key: "dsh-schedule" }, SchedulePage)
);

// 3. 注入会话顶栏快捷图标按钮 (order 15)
slots.inject("conversation.session.header.utilities", () =>
  slots.register({
    name: "conversation.session.header.utilities",
    id: "dsh-schedule",
    order: 15,
    label: "日程",
  }, ScheduleHeaderButton)
);
```

### 2. 艾森豪威尔四象限矩阵 (Eisenhower Matrix)
数据结构扩展了 `quadrant` 字段：
* `q1`: **重要 · 紧急**（立即执行 / 🔴 #cf222e）
* `q2`: **重要 · 不紧急**（规划推进 / 🟡 #0969da - 默认值）
* `q3`: **紧急 · 不重要**（快速交付 / 🔵 #d97706）
* `q4`: **不重要 · 不紧急**（归档消减 / 🟢 #1a7f37）

客户端利用 HTML5 原生 Drag and Drop API 实现流畅拖拽跨象限移动：
* `onDragStart`: 将 `item.id` 存入 `dataTransfer`；
* `onDrop`: 捕获目标象限并触发 `onMutate('update', { id, quadrant })` 异步更新落盘。

### 3. 垂直时间轴排程（Time-blocking & Conflict Detection）
全面支持现代精力管理工作流：
* **起止时间块**：支持 `startTime`（如 `09:00`）与 `endTime`（如 `10:30`），且向后兼容 `09:00-10:30` 或单点 `09:00` 格式；
* **中轴时序与空闲时段**：客户端算法 `computeTimeSchedule` 自动推导中轴排程，并在未重叠的任务空隙自动生成 `☕ 空闲时段` 节点，并支持一键 `+ 排程`；
* **智能冲突撞车预警**：检测 `startA < endB && startB < endA`，当发生时间撞车时，在卡片上自动高亮红色边框与 `⚠️ 与「...」时段重叠撞车` 告警徽标。

### 4. 一次性任务惰性自动顺延（Carry-Over）
对于未完成的一次性日程（`recurring: 'once'` 且 `carry_over: true`）：
- 采用**读写时惰性计算**（无需常驻定时器）：在任何调用 `listForDate`、`snapshot` 或写入时自动触发检测；
- 若日期已过期且未完成，将任务当前生效日期推进至 `today`；
- 同时在 `rolloverDates` 数组记录历经的未完成历史日期，月历仍可准确追溯。

### 4. 数据存储与持久化模型 (`store.js`)
数据统一保存在 `~/.dsh/dsh-schedule-data.json`：
```json
{
  "items": [
    {
      "id": "1726588800000-abc1234",
      "title": "系统重构",
      "recurring": "once",
      "date": "2026-09-17",
      "quadrant": "q1",
      "time": "14:30",
      "note": "完成右侧栏接入",
      "carry_over": true,
      "rolloverDates": ["2026-09-16"],
      "sessionIds": ["session-xyz"]
    }
  ],
  "done": {
    "1726588800000-abc1234": {
      "2026-09-17": true
    }
  }
}
```

---

## 四、本地构建与测试工作流

### 1. 编译构建
本项目构建脚本不引入臃肿的 Webpack/Vite 捆绑，采用原生 Node 脚本快速打包：
```bash
node scripts/build.mjs
```
产出位于 `lib/`，秒级完成。

### 2. 执行自动化测试
基于 Node 原生 `node:test` 运行，无需额外测试框架：
```bash
node scripts/build.mjs && node --test test/*.test.mjs
```
*包含 39 项完整单元测试，覆盖时间块解析、冲突检测、时间轴计算、边界日期计算、顺延算法、损坏自愈、字段归一化及打包规范。*

### 3. DSH 插件热生效与调试
在开发过程中更新代码后，重新执行 `node scripts/build.mjs`，在 DSH Web 界面刷新页面即可直接验证最新右侧栏与看板渲染效果。

---

## 五、后续路线演进规划 (Roadmap)

1. **⏱️ 垂直时间轴排程（Time-blocking）**：
   - 增加 `startTime`、`endTime`（或 `duration`）属性；
   - 呈现 24 小时或工作时段垂直中轴线，检测并标红冲突撞车时段，可视化直观查看精力空隙。
2. **🔗 任务前后因果依赖链（Dependencies / Blocker）**：
   - 支持 `depends_on: string[]`；
   - 前置任务未完成时卡片呈半透明等待态，完成后自动点亮触发 Next Action 提示。
3. **🎨 个性化视觉与设计打磨**：
   - 适配 DSH 暗黑与浅色模式的高对比度色卡；
   - 强化四象限卡片的折叠与精细化筛选标签。
