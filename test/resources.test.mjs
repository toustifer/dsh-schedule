import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const L = require('../src/client/logic.cjs')

test('resources logic: 图标推导', () => {
  assert.equal(L.inferResourceIcon('https://www.bilibili.com/video/BV1VS411A75c'), '📺')
  assert.equal(L.inferResourceIcon('https://youtube.com/watch?v=123'), '📺')
  assert.equal(L.inferResourceIcon('D:\\courses\\lecture.pptx'), '📊')
  assert.equal(L.inferResourceIcon('C:\\doc\\paper.pdf'), '📄')
  assert.equal(L.inferResourceIcon('https://mooc.cn/learn'), '🌐')
  assert.equal(L.inferResourceIcon('D:\\workspace\\project'), '📁')
})

test('resources logic: 标题推导与归一化', () => {
  const bUrl = 'https://www.bilibili.com/video/BV1VS411A75c/?p=5'
  assert.equal(L.inferResourceTitle(bUrl, ''), 'B站网课 (P5)')
  assert.equal(L.inferResourceTitle('D:\\courses\\physics_final.pptx', ''), 'physics_final.pptx')
  assert.equal(L.inferResourceTitle('D:\\courses\\physics_final.pptx', '期中核心课件'), '期中核心课件')

  const list = [
    bUrl,
    { title: '期中课件', uri: 'D:\\physics.pptx' },
    null,
    '',
    { uri: ' ' },
  ]
  const normalized = L.normalizeResourceList(list)
  assert.equal(normalized.length, 2)
  assert.equal(normalized[0].title, 'B站网课 (P5)')
  assert.equal(normalized[0].uri, bUrl)
  assert.equal(normalized[1].title, '期中课件')
  assert.equal(normalized[1].uri, 'D:\\physics.pptx')
})
