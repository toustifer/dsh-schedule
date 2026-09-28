/**
 * dsh-schedule 构建脚本:
 *   - Host 半身(src/index.js、src/store.js)直接拷贝到 lib/(纯 ESM,无需编译)
 *   - Client 半身(src/client/index.js)包装为 DSH client-modules C6 bundle
 *     (window.__ModuleLoader__.load 工厂),产出 lib/client.js
 */
import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const lib = join(root, 'lib')
mkdirSync(lib, { recursive: true })

// ---- Host ----
copyFileSync(join(root, 'src', 'index.js'), join(lib, 'index.js'))
copyFileSync(join(root, 'src', 'store.js'), join(lib, 'store.js'))
// notify/ 是宿主端新增的子模块目录,必须一起带上,
// 否则 lib/index.js 里的 import './notify/index.js' 会解析失败。
// 先删后拷:避免源目录里删掉的文件在 lib 里阴魂不散。
const libNotify = join(lib, 'notify')
rmSync(libNotify, { recursive: true, force: true })
cpSync(join(root, 'src', 'notify'), libNotify, { recursive: true })

// ---- Client (C6 bundle) ----
// 先内联纯逻辑(logic.cjs,无导出副作用),再内联 UI 半身,
// 两者共享同一个工厂闭包作用域。
const logicSrc = readFileSync(join(root, 'src', 'client', 'logic.cjs'), 'utf8')
const clientSrc = readFileSync(join(root, 'src', 'client', 'index.js'), 'utf8')
const banner = 'window.__ModuleLoader__.load({ id: "dsh-schedule", factory: (require) => { var module = { exports: {} }; var exports = module.exports;\n'
const footer = '\nreturn module.exports; } });\n'
writeFileSync(join(lib, 'client.js'), banner + logicSrc + '\n' + clientSrc + footer)

console.log('[dsh-schedule] build ok -> lib/index.js, lib/store.js, lib/client.js')
