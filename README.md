# dsh-schedule

DeepSeek Harness 本地日程插件 —— better-sidebar 侧边卡片「日程」、日程-会话链接、行内编辑与详情视图、完成打勾、重复日程与 agent 工具。数据长期保存在本地文件,支持周/月/季度/年度回顾。

A local long-term schedule plugin for DeepSeek Harness: a "Schedule" tab in the better-sidebar side card (today / week / history calendar), schedule↔conversation links, inline editing with a detail view, completion checkmarks, recurring tasks, optional auto carry-over, and agent tools. Data persists in a local file for lifetime history review.

## 功能 Features

- 📅 **单入口(侧边卡片)** — 日程作为 better-sidebar 侧边栏的一个 tab;通过侧边栏顶部「+」菜单添加/打开,也可固定到侧边卡片。不占会话标题栏,也没有独立浮窗/抽屉(保证只有一种形态,不再有加载时序导致的"有时弹窗、有时侧边栏"问题)
- 🗓️ **侧边卡片面板** — 今天(未完成/已完成)/ 本周(按天分组)/ 历史(月历 + 本周/本月/本年/连续完成统计)
- ✏️ **行内编辑** — 日程条右侧 ✎ 直接编辑名称、日期、重复、时间、备注、顺延开关;详情页内也可编辑
- 🔍 **详情视图** — 点日程标题查看完整备注(自动换行不再截断)、完成统计、顺延历史日期与关联会话,支持在详情里打勾/关联/删除
- ➕ **添加表单折叠** — 面板内默认收起为「+ 添加」按钮,点开才展开表单(含备注输入),把更多空间留给日程列表
- ✅ **完成打勾** — 按天记录,重复日程每天独立;勾掉的进"已完成"区,次日自动清空当日记录但历史永久保留
- 🔁 **自动顺延(可选)** — 一次性日程可勾选"未完成自动顺延":到期未完成时,下次打开自动顺延到当天,顺延经过的历史日期保留在月历中,完成的当天会显示最终状态
- 🔗 **日程↔会话链接** — 日程条右侧 ⊕ 一键关联当前会话;输入框右侧 🔗 弹出日程列表;点击日程标题或会话标签跳转到关联会话;一个日程可关联多个会话
- 🔁 **重复日程** — 一次性 / 每天 / 每周(周一~周日多选)
- 🔄 **自动刷新** — 面板打开期间每 30 秒同步一次,其他会话里 agent 改的日程也会出现
- 🤖 **Agent 工具** — `dailytask_add/list/set_done/update/delete/link_session`,在任意对话里说"帮我记一条日程"即可
- 💾 **长期本地存储** — `~/.dsh/dsh-schedule-data.json`,完成历史永不删除,自动迁移旧版数据文件;文件损坏时先备份为 `.corrupt-时间戳` 再以空数据启动,绝不覆盖原文

## 安装 Install

```sh
# 从源码
git clone https://github.com/magicOF2/dsh-schedule.git
cd dsh-schedule
pnpm build
pnpm test

# 安装到 web profile
dsh plugin --profile web add /path/to/dsh-schedule

# 重启 DSH
dsh web
```

## 使用 Usage

1. 打开 DSH Web,点侧边栏顶部「+」→ 选择「📅 日程」(或在已打开的侧边卡片标签栏中点日程);之后可直接点侧边卡片上的 📅 tab 使用
2. 点面板内「+ 添加」展开表单:标题 + 日期/重复/时间 + 备注,再点"添加";一次性日程可勾选"未完成自动顺延"
3. 完成一项,点左侧圆圈打勾
4. 日程条 ✎ 直接编辑;点日程标题进入详情(完整备注、完成统计、顺延历史、关联会话管理)
5. 日程条 ⊕ 或详情页按钮把当前会话关联到该日程;输入框右侧 🔗 也可以;点会话标签跳转回关联会话
6. "历史"页签查看月历和统计;顺延过的日程会在历史日期上显示"顺"标记

> 前提:日程 UI 需要 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) 已安装(日程作为它的侧边卡片 tab 注册,并在其顶部「+」菜单里出现)。未安装时只有 Host 侧 agent 工具可用。

## 数据 Data

- 数据文件:`~/.dsh/dsh-schedule-data.json`
- 结构:`items`(日程定义)+ `done`(按 日程ID → 日期 累积的完成记录)
- 备份:拷贝该文件即可

## 开发 Develop

```sh
pnpm build   # 产出 lib/(Host ESM + Client C6 bundle)
pnpm test    # node --test:存储核心 + 客户端纯视图逻辑(src/client/logic.cjs)
```

测试跨平台可用(Windows/macOS/Linux);日期校验、顺延展开、排序与统计均有单元覆盖。

## License

MIT
