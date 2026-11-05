import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const videoPath = join(root, 'assets', 'companion-near.mp4')
const buf = readFileSync(videoPath)
const b64 = buf.toString('base64')
const outPath = join(root, 'src', 'client', 'companion-asset.cjs')
const content = 'const COMPANION_VIDEO_SRC = "data:video/mp4;base64,' + b64 + '";\n'
writeFileSync(outPath, content)
console.log('Generated companion-asset.cjs:', buf.length, 'bytes -> b64 chars:', b64.length)
