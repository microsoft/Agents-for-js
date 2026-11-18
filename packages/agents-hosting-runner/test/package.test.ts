// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { it } from 'node:test'
import { fileURLToPath } from 'node:url'

it('packs a complete CLI that runs without a TypeScript loader', { timeout: 30000 }, async t => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const directory = await mkdtemp(join(root, 'test', 'package-fixture-'))
  t.after(async () => await rm(directory, { recursive: true, force: true }))
  const npm = process.env.npm_execpath ??
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  const output = execFileSync(process.execPath, [
    npm, 'pack', '--json', '--ignore-scripts', '--loglevel=error', '--pack-destination', directory
  ], { cwd: root, encoding: 'utf8' })
  const [packed] = JSON.parse(output)
  const files = packed.files.map((file: { path: string }) => file.path)
  for (const file of [
    'README.md',
    'package.json',
    'dist/package.json',
    'dist/src/cli.js',
    'dist/src/runner.js',
    'dist/src/index.d.ts'
  ]) {
    assert.ok(files.includes(file), `Missing runner payload: ${file}`)
  }
  assert.ok(!files.some((file: string) => file.startsWith('test/')))
  const archives = (await readdir(directory)).filter(file => file.endsWith('.tgz'))
  assert.equal(archives.length, 1)
  const extracted = join(directory, 'extracted')
  await mkdir(extracted)
  execFileSync('tar', ['-xf', join(directory, archives[0]), '-C', extracted])
  const manifest = JSON.parse(await readFile(join(extracted, 'package', 'package.json'), 'utf8'))
  const cli = join(extracted, 'package', manifest.bin['agent-runner'])
  assert.match(await readFile(cli, 'utf8'), /^#!\/usr\/bin\/env node/)
  const help = execFileSync(process.execPath, [cli, '--help'], { encoding: 'utf8' })
  assert.match(help, /--agent-module/)
  assert.match(help, /--port/)
})
