# Focus Shield (ADHD 专注盾牌) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Focus Shield (ADHD 专注盾牌) view for dsh-schedule with "Daily Highlight", micro-kickstart (5-minute timer), backlog drawer, zero-shame achievements, and an interactive 3D whale companion ("大肥鱼", customizable name).

**Architecture:** Extend Host HTTP server with video asset endpoint `/api/dailytask/companion-video`; extend client UI in `src/client/index.js` to render the Focus Shield hero card, companion window with custom name support, 5-minute micro-kickstart integration, and backlog drawer; persist companion name and highlight selection in local storage and store doc ui extensions.

**Tech Stack:** JavaScript (ESM on Host, CommonJS C6 bundle on Client), Node.js HTTP/fs, React (React.createElement without JSX), CSS keyframes & modern flex/grid styling, native `<video>` loop.

---

## File Structure

- **Assets:**
  - Create: `assets/companion-near.mp4` (copied from `docs/xiaodian-near.mp4`)
- **Host:**
  - Modify: `scripts/build.mjs` (copy assets directory to `lib/assets`)
  - Modify: `src/index.js` (add `/api/dailytask/companion-video` streaming route)
- **Client:**
  - Modify: `src/client/index.js` (add companion CSS, companion component with name change, hero card, 5m micro-timer support, drawer backlog)
- **Tests:**
  - Create: `test/focus-shield.test.mjs` (test companion endpoint, custom name persistence, and highlight selection)
  - Verify: `npm test` (all 140+ tests pass)

---

### Task 1: Asset Pipeline & Server Video Endpoint

**Files:**
- Create: `assets/companion-near.mp4`
- Modify: `scripts/build.mjs`
- Modify: `src/index.js`
- Test: `test/focus-shield.test.mjs`

- [ ] **Step 1: Copy asset and update `build.mjs` to copy `assets/` to `lib/assets`**

Copy `docs/xiaodian-near.mp4` to `assets/companion-near.mp4`.
In `scripts/build.mjs`, add `cpSync(join(root, 'assets'), join(lib, 'assets'), { recursive: true })`.

- [ ] **Step 2: Add `/companion-video` route to `src/index.js`**

In `src/index.js` inside `serverCtx.webServer.register`, add:
```javascript
route('/companion-video', (req, res) => {
  const videoPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'companion-near.mp4')
  if (!existsSync(videoPath)) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('Not Found')
    return
  }
  const stat = statSync(videoPath)
  res.writeHead(200, {
    'content-type': 'video/mp4',
    'content-length': stat.size,
    'cache-control': 'public, max-age=86400',
  })
  createReadStream(videoPath).pipe(res)
})
```

- [ ] **Step 3: Write test for video endpoint and build pipeline in `test/focus-shield.test.mjs`**

```javascript
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('companion asset exists in assets/ and has non-zero size', () => {
  const p = join(root, 'assets', 'companion-near.mp4')
  assert.equal(existsSync(p), true)
  assert.ok(statSync(p).size > 500000)
})
```

- [ ] **Step 4: Run test and build**

Run: `node --test test/focus-shield.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add assets/ scripts/build.mjs src/index.js test/focus-shield.test.mjs
git commit -m "feat(companion): 添加伴工视频资产与 /api/dailytask/companion-video 接口"
```

---

### Task 2: Store Support for Companion Name & Highlight ID

**Files:**
- Modify: `src/client/index.js`
- Test: `test/focus-shield.test.mjs`

- [ ] **Step 1: Write test for companion name and highlight helper logic in `test/focus-shield.test.mjs`**

Add unit tests verifying:
- Default companion name is `"大肥鱼"`.
- Validates user-provided names (trims whitespace, falls back to `"大肥鱼"` if empty).
- Formats companion dialogue replacing `{NAME}` placeholder.

- [ ] **Step 2: Implement helper functions in client logic**

In `src/client/index.js`:
```javascript
const COMPANION_NAME_KEY = 'dsh-schedule:companion:name'
const DEFAULT_COMPANION_NAME = '大肥鱼'

function getCompanionName() {
  try {
    const n = window.localStorage.getItem(COMPANION_NAME_KEY)
    if (n && n.trim()) return n.trim()
  } catch (e) {}
  return DEFAULT_COMPANION_NAME
}

function setCompanionName(name) {
  const val = (name && name.trim()) ? name.trim() : DEFAULT_COMPANION_NAME
  try { window.localStorage.setItem(COMPANION_NAME_KEY, val) } catch (e) {}
  return val
}
```

- [ ] **Step 3: Run test**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/client/index.js test/focus-shield.test.mjs
git commit -m "feat(focus-shield): 添加伴工自定义名称与状态持久化逻辑"
```

---

### Task 3: Focus Shield CSS & Companion Video Component

**Files:**
- Modify: `src/client/index.js`

- [ ] **Step 1: Add Focus Shield & Companion CSS to client styles**

Append modern styling to CSS in `src/client/index.js`:
- `.dsh-sched-hero`: gradient background, subtle glow, highlight styling.
- `.dsh-sched-companion`: 96x128px card with hover zoom, rounded corners, video styling.
- `.dsh-sched-companion-badge`: clickable name badge with pencil icon `✎`.
- `.dsh-sched-dialogue`: soft blue speech bubble with emoji.
- `.dsh-sched-micro-btn`: mint-green micro-kickstart button.

- [ ] **Step 2: Implement `CompanionBox` component**

Render the video element with `src="/api/dailytask/companion-video"`, badge for renaming, and click interaction.

- [ ] **Step 3: Build and verify no syntax errors**

Run: `npm run build`
Expected: `[dsh-schedule] build ok`

- [ ] **Step 4: Commit**

```bash
git add src/client/index.js
git commit -m "feat(ui): 增加 Focus Shield 英雄卡片与伴工视窗组件样式"
```

---

### Task 4: Focus Shield Hero Card & 5-Minute Micro-Kickstart

**Files:**
- Modify: `src/client/index.js`

- [ ] **Step 1: Support 5-minute micro-timer in `cdStart`**

In `src/client/index.js`:
Extend `cdStart(key, item, customMinutes)` to accept an explicit duration (e.g. 5 for micro-kickstart), setting `isMicro: true` and appropriate encouragement text.

- [ ] **Step 2: Render Hero Card at the top of the "Today" view**

When `view === 'today'`, render the `FocusShieldHero`:
- Highlighted Task: uses `highlightId` from state, or defaults to the first non-done Q1/Q2 task.
- Display title, theme tag (e.g. `#硬核攻坚`), companion video box, dialogue bubble.
- Action buttons:
  - `▶ 开始专注 (N分)`: starts full focus timer.
  - `🌱 先做5分钟 (微破冰)`: starts 5-minute zero-pressure timer.

- [ ] **Step 3: Build and test**

Run: `npm run build && npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/client/index.js
git commit -m "feat(hero): 整合今日主角卡片与 5 分钟微破冰启动"
```

---

### Task 5: Backlog Drawer, Task Swapping & Zero-Shame Wins

**Files:**
- Modify: `src/client/index.js`

- [ ] **Step 1: Render remaining tasks in collapsible Backlog Drawer**

- Non-highlighted tasks render inside a collapsible drawer: `📥 副任务与灵感仓 (N)`.
- Each row contains a `⭐ 设为主任务` button.
- Clicking `⭐ 设为主任务` swaps `highlightId` to that task and updates the hero card.
- Provide a quick input field for dumping thoughts without setting rigid schedules.

- [ ] **Step 2: Render Zero-Shame Achievement Section**

- At the bottom of the Today view, render `🎉 今日战报: ${companionName}为你点赞！已击倒 M 个目标`.
- Exclude all expired overdue red warning labels.

- [ ] **Step 3: Build and test**

Run: `npm run build && npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/client/index.js
git commit -m "feat(drawer): 增加副任务折叠仓、换主角机制与零羞耻战报"
```

---

### Task 6: Visual Smoke Test & Release Version Bump (v0.5.0)

**Files:**
- Modify: `package.json`
- Modify: `src/store.js`
- Modify: `CHANGELOG.md`
- Modify: `README.md`

- [ ] **Step 1: Bump version to 0.5.0**

Update `version: "0.5.0"` in `package.json` and `DATA_WRITER = 'dsh-schedule@0.5.0'` in `src/store.js`.
Add release notes to `CHANGELOG.md` and feature summary to `README.md`.

- [ ] **Step 2: Rebuild & full test validation**

Run: `npm run build && npm test`
Expected: 140+ tests pass.

- [ ] **Step 3: Verify visually in browser via `ego_navigate` and take screenshots**

Open `http://127.0.0.1:3080/` with current token, inspect Today view, verify:
- Hero card renders with companion video.
- Badge reads "大肥鱼 ✎", click allows renaming.
- 5m micro-kickstart launches 5-minute countdown.
- Star button swaps tasks.

- [ ] **Step 4: Commit and tag v0.5.0**

```bash
git add -A
git commit -m "feat(release): v0.5.0 —— Focus Shield (ADHD 专注盾牌) 与大肥鱼伴工上线"
git tag v0.5.0
```
