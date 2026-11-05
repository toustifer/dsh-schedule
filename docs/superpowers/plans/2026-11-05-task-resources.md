# Task Resources (任务关联资料) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow tasks to link web URLs (e.g., Bilibili courses) and local files (e.g., PPT/PDF/code), render click-to-open pill capsules in Focus Shield hero card & countdown overlays, provide Host-level system file opener endpoint, and enable AI tool `dailytask_add_resource`.

**Architecture:**
- **Store (`src/store.js`)**: Extend item schema with `resources: Array<{ title: string, uri: string }>`. Add `addResource(id, res)` and patch support.
- **Host Server & Tools (`src/index.js`)**: Add `POST /api/dailytask/open-resource` (using OS `start`/`open` for local files) and new tool `dailytask_add_resource`.
- **Client UI (`src/client/index.js`)**: Render resource capsules with type icons (📺/🌐/📄) on FocusShieldHero, countdown overlay, and detail view.

**Tech Stack:** Node.js child_process, React.createElement, CSS flex capsules.

---

## Tasks

### Task 1: Store & Logic Resource Normalization
- Files: `src/client/logic.cjs`, `src/store.js`, `test/resources.test.mjs`
- [ ] Add `inferResourceIcon`, `normalizeResourceItem` in `src/client/logic.cjs`.
- [ ] Support `resources` array in `src/store.js` (`normalizeStoredItem`, `addItem`, `updateItem`, `addResource`).
- [ ] Write tests and verify with `npm test`.

### Task 2: Host Route `/open-resource` & AI Tool `dailytask_add_resource`
- Files: `src/index.js`
- [ ] Add `POST /api/dailytask/open-resource` using `child_process.exec` (Windows `start ""`, macOS `open`, Linux `xdg-open`).
- [ ] Add `dailytask_add_resource` tool definition and add `resources` to `dailytask_add` & `dailytask_update`.
- [ ] Support `op: 'add_resource'` in `batch`.

### Task 3: Client UI Resource Pills & Click-to-Open
- Files: `src/client/index.js`
- [ ] Add CSS for resource pills (`.dsh-sched-resource-pill`).
- [ ] Render resource pills in `FocusShieldHero`.
- [ ] Render resource pills in `CountdownOverlay`.
- [ ] Render resource management (add/remove) in `DetailView`.

### Task 4: Populate User's Bilibili Link & Smoke Test
- [ ] Call `store.addResource` for task `dt_mw0g8l77_0bz1ul` with the provided Bilibili URL.
- [ ] Run `npm run build && npm test`.
- [ ] Verify visually in DSH Web via browser automation.
- [ ] Commit and tag v0.5.1.
