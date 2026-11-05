import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const L = require('../src/client/logic.cjs')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('companion asset exists in assets/ and has non-zero size', () => {
  const p = join(root, 'assets', 'companion-near.mp4')
  assert.equal(existsSync(p), true, 'assets/companion-near.mp4 应当存在')
  const stat = statSync(p)
  assert.ok(stat.size > 500000, '视频大小应当大于 500KB')
})

test('companion logic: 名字规范化与回退', () => {
  assert.equal(L.normalizeCompanionName(undefined), '大肥鱼')
  assert.equal(L.normalizeCompanionName(''), '大肥鱼')
  assert.equal(L.normalizeCompanionName('   '), '大肥鱼')
  assert.equal(L.normalizeCompanionName('小点'), '小点')
  assert.equal(L.normalizeCompanionName('  阿鲸  '), '阿鲸')
})

test('companion logic: 对话模板中的占位符替换', () => {
  const tpl = '今天想先攻哪一小步？{NAME}陪你。'
  assert.equal(L.formatCompanionDialogue(tpl, '大肥鱼'), '今天想先攻哪一小步？大肥鱼陪你。')
  assert.equal(L.formatCompanionDialogue(tpl, '小点'), '今天想先攻哪一小步？小点陪你。')
})

test('companion logic: 智能推导今日主角 (Daily Highlight)', () => {
  const items = [
    { id: 't1', title: '低优先级任务', quadrant: 'q4' },
    { id: 't2', title: '重要紧急大物', quadrant: 'q1' },
    { id: 't3', title: '重要不紧急英语', quadrant: 'q2' }
  ]
  const doneMap = { t2: { '2026-11-05': true } }
  // t2 已完成，应当自动选择未完成中最高优先级的 t3 (q2)
  const picked = L.pickDailyHighlight(items, doneMap, '2026-11-05', null)
  assert.equal(picked.id, 't3')

  // 若用户指定了 explicitHighlightId 且未完成，优先选指定项
  const explicit = L.pickDailyHighlight(items, doneMap, '2026-11-05', 't1')
  assert.equal(explicit.id, 't1')
})
