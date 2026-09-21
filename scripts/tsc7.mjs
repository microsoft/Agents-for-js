// @ts-check

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const nativePackageJsonPath = require.resolve('@typescript/native/package.json')
const nativePackageJson = JSON.parse(readFileSync(nativePackageJsonPath, 'utf8'))
const tscPath = resolve(dirname(nativePackageJsonPath), nativePackageJson.bin.tsc)
const result = spawnSync(process.execPath, [tscPath, ...process.argv.slice(2)], { stdio: 'inherit' })

if (result.error) throw result.error
process.exitCode = result.status ?? 1
