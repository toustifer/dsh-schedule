import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('companion asset exists in assets/ and has non-zero size', () => {
  const p = join(root, 'assets', 'companion-near.mp4')
  assert.equal(existsSync(p), true, 'assets/companion-near.mp4 应当存在')
  const stat = statSync(p)
  assert.ok(stat.size > 500000, '视频大小应当大于 500KB')
})
