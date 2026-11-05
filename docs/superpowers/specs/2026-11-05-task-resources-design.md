# Task Resources (任务关联资料) 设计规范 (Design Spec)

- **作者 / 架构**：DSH 团队 / toustifer
- **日期**：2026-11-05
- **版本**：v1.0
- **适用插件**：`dsh-schedule` (v0.5.1)

---

## 1. 目标与问题陈述 (Goals & Problem Statement)

### 1.1 现状与痛点
用户在执行任务（如“大物复习 40 分钟”、“物流作业”）时，需要频繁打开对应的网课（如 B站视频、MOOC）、课件（PDF/PPT）或本地代码文件。
目前日程任务只能在备注文本里手写说明，无法一键点击直达，更无法让 AI 在对话中直接把找好的资料挂载到任务上。

### 1.2 解决方案：结构化资源关联 (Task Resources) + 宿主直开 (Host Opener)
1. **数据模型扩展**：
   - 任务对象新增 `resources: Array<{ title: string, uri: string }>`；
   - 自动推导类型：`web` (以 http/https 开头) 与 `file` (本地路径)；
   - 自动推导默认标题（未给时提取文件名或主域名）。
2. **AI 工具全链路打通**：
   - `dailytask_add`、`dailytask_update`、`dailytask_batch` 支持 `resources`；
   - 新增专用快捷工具 `dailytask_add_resource({ id, uri, title? })`，AI 随手即可追加资料。
3. **宿主端跨平台打开端点**：
   - 新增路由 `POST /api/dailytask/open-resource`；
   - 网页：前端 `window.open` 或宿主端默认浏览器打开；
   - 本地文件：宿主端调用系统默认程序（Windows `cmd.exe /c start "" <path>`，macOS `open`，Linux `xdg-open`）秒开 PPT/PDF/Word。
4. **前端卡片直通胶囊**：
   - Focus Shield 今日主角卡片、大倒计时浮层、日程详情均呈现彩色可点药丸胶囊（带 📺/🌐/📄 图标）；
   - 任务详情中提供 `+ 添加资料` 的前端手动操作输入框。
