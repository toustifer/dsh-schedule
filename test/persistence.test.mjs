import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { ScheduleStore, DATA_FORMAT_VERSION, DATA_WRITER, KNOWN_TOP_KEYS } from '../src/store.js'

const root = new URL('..', import.meta.url)

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-persist-'))
  const path = join(dir, 'data.json')
  const store = new ScheduleStore({ path, legacyPath: join(dir, 'legacy.json') })
  return { dir, path, store }
}

function readDoc(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** 一份"新版写出的"数据:含 goals,外加两个本版本不认识的顶层字段。 */
function docWithUnknown() {
  return {
    version: 2,
    writtenBy: 'dsh-schedule@9.9.9',
    items: [{ id: 'dt_1', title: '背单词', recurring: 'once', date: '2026-09-01' }],
    done: {},
    goals: [{
      id: 'goal_1', title: '考四级', horizon: 'term',
      startDate: '2026-09-01', endDate: '2027-01-20',
      metric: { type: 'score', target: 600, current: 0, unit: '分' },
      status: 'active',
    }],
    // 未来版本 / 其他进程才会写的东西:
    settings: { theme: 'dark', weekStart: 1 },
    habits: [{ id: 'h1', name: '晨跑' }],
  }
}

// ---------- issue #2:未知顶层字段不得被丢弃 ----------

test('load keeps unknown top-level fields in memory', async () => {
  const { dir, path, store } = fresh()
  try {
    writeFileSync(path, JSON.stringify(docWithUnknown()), 'utf8')
    const snap = await store.snapshot('2026-09-01')
    assert.equal(snap.items.length, 1)
    assert.equal(snap.goals.length, 1)
    // 内存数据必须带着未知字段,才可能在后继写盘时带走
    assert.deepEqual(store.data.settings, { theme: 'dark', weekStart: 1 })
    assert.deepEqual(store.data.habits, [{ id: 'h1', name: '晨跑' }])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a write keeps unknown top-level fields instead of rewriting a whitelist', async () => {
  const { dir, path, store } = fresh()
  try {
    writeFileSync(path, JSON.stringify(docWithUnknown()), 'utf8')
    // 触发一次普通写操作 —— issue #2 里正是 set_done 之后 goals 被抹掉
    await store.setDone('dt_1', '2026-09-01', true)

    const doc = readDoc(path)
    assert.equal(doc.goals.length, 1, 'goals 不能被抹掉')
    assert.deepEqual(doc.settings, { theme: 'dark', weekStart: 1 }, '未知字段 settings 必须保留')
    assert.deepEqual(doc.habits, [{ id: 'h1', name: '晨跑' }], '未知字段 habits 必须保留')
    assert.equal(doc.done.dt_1['2026-09-01'], true, '本次写入本身要生效')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('unknown fields written by another process between writes are not clobbered', async () => {
  const { dir, path, store } = fresh()
  try {
    // 先让 store 载入一份干净数据(此时文件里没有 stats)
    writeFileSync(path, JSON.stringify({
      version: 2, items: [{ id: 'dt_1', title: 'A', recurring: 'once', date: '2026-09-01' }],
      done: {}, goals: [],
    }), 'utf8')
    await store.snapshot('2026-09-01')
    assert.equal(store.data.stats, undefined, '载入时还没有 stats')

    // 另一个进程(新版插件 / 手工编辑 / 云同步)往文件里补了一个新字段
    const injected = readDoc(path)
    injected.stats = { streak: 12 }
    writeFileSync(path, JSON.stringify(injected), 'utf8')

    // 我们再写一次盘:虽然内存里从没见过 stats,也不能把它冲掉
    await store.setDone('dt_1', '2026-09-01', true)
    const doc = readDoc(path)
    assert.deepEqual(doc.stats, { streak: 12 }, '别的进程刚写的未知字段必须存活')
    assert.equal(doc.done.dt_1['2026-09-01'], true)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// ---------- 版本 / 写入方标记 ----------

test('writes carry the data-format version and the writer identity', async () => {
  const { dir, path, store } = fresh()
  try {
    const { item } = await store.addItem({ title: 'A', date: '2026-09-01' })
    let doc = readDoc(path)
    assert.equal(doc.version, DATA_FORMAT_VERSION)
    assert.equal(doc.writtenBy, DATA_WRITER)

    // 载入一份"别人写的"文件后,再写盘应把标记改回自己
    doc.writtenBy = 'dsh-schedule@0.0.1'
    writeFileSync(path, JSON.stringify(doc), 'utf8')
    await store.setDone(item.id, '2026-09-01', true)
    assert.equal(readDoc(path).writtenBy, DATA_WRITER, '写盘方应是当前进程')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('DATA_WRITER stays in sync with package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))
  assert.equal(DATA_WRITER, 'dsh-schedule@' + pkg.version,
    'DATA_WRITER 必须跟着 package.json 的 version 走,否则事后归因会给出错误线索')
  for (const k of ['version', 'writtenBy', 'items', 'done', 'goals']) {
    assert.ok(KNOWN_TOP_KEYS.includes(k), 'KNOWN_TOP_KEYS 应包含 ' + k)
  }
})

// ---------- 原型污染防护 ----------

test('a __proto__ key in the data file cannot pollute the prototype', async () => {
  const { dir, path, store } = fresh()
  try {
    writeFileSync(path,
      '{"version":2,"items":[{"id":"dt_1","title":"A","recurring":"once","date":"2026-09-01"}],'
      + '"done":{},"goals":[],"__proto__":{"injected":true}}', 'utf8')

    await store.setDone('dt_1', '2026-09-01', true)
    assert.equal({}.injected, undefined, 'Object.prototype 不能被污染')
    const doc = readDoc(path)
    assert.equal(Object.getPrototypeOf(doc), Object.prototype, '文档原型应保持干净')
    assert.equal(doc.done.dt_1['2026-09-01'], true, '写盘仍要正常完成')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// ---------- 回归:原有行为不受影响 ----------

test('legacy files still upgrade in place without losing data', async () => {
  const { dir, path, store } = fresh()
  try {
    writeFileSync(path, JSON.stringify({
      version: 1,
      items: [{ id: 'dt_1', title: '旧日程', recurring: 'once', date: '2026-09-01' }],
      done: { dt_1: { '2026-09-01': true } },
    }), 'utf8')
    const snap = await store.snapshot('2026-09-01')
    assert.equal(snap.goals.length, 0)
    assert.equal(snap.items[0].goalId, null)

    await store.addGoal({ title: '新目标' }, Date.now(), '2026-09-01')
    const doc = readDoc(path)
    assert.equal(doc.version, DATA_FORMAT_VERSION)
    assert.equal(doc.goals.length, 1)
    assert.equal(doc.items.length, 1)
    assert.equal(doc.done.dt_1['2026-09-01'], true)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('an unparseable file is still backed up rather than overwritten', async () => {
  const { dir, path, store } = fresh()
  try {
    writeFileSync(path, '{ this is not json', 'utf8')
    await store.snapshot('2026-09-01')
    const files = readdirSync(dir)
    assert.ok(files.some((f) => f.startsWith('data.json.corrupt-')), '原文应被备份为 .corrupt-*')
    assert.equal(store.protectUnparsedFile, false, '备份成功则继续正常写盘')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
