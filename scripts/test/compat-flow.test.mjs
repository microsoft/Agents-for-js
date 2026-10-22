import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { parseArguments } from '../compat/config.mjs'
import { runCompat } from '../compat/runner.mjs'
import { formatReport } from '../compat/reporter.mjs'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'compat-flow-'))

after(() => {
  if (
    path.dirname(directory) === os.tmpdir() &&
    path.basename(directory).startsWith('compat-flow-')
  ) {
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3 })
  }
})
let sequence = 0
const source = 'export declare function f(value: string): void;'

function fixture () {
  const root = path.join(directory, String(sequence++))

  fs.mkdirSync(path.join(root, 'packages/example'), { recursive: true })
  fs.mkdirSync(path.join(root, 'compat/baseline'), { recursive: true })
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'compat-fixture', private: true, scripts: { build: 'node build.cjs' } })
  )
  fs.writeFileSync(path.join(root, 'build.cjs'), 'process.exit(7)\n')
  fs.writeFileSync(
    path.join(root, 'packages/example/package.json'),
    JSON.stringify({ name: '@test/example', version: '1.0.0', types: './index.d.ts' })
  )
  fs.writeFileSync(path.join(root, 'packages/example/index.d.ts'), source)
  fs.writeFileSync(
    path.join(root, 'packages/example/tsconfig.json'),
    JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'Node16', types: [], skipLibCheck: true },
      files: ['index.d.ts']
    })
  )
  fs.writeFileSync(
    path.join(root, 'compat/baseline/example.api.md'),
    `\`\`\`ts\n${source.replace('export declare', 'export')}\n\`\`\`\n`
  )

  return root
}

const run = (root, args = []) =>
  runCompat(root, parseArguments(['--skip-build', '--no-color', ...args], {}))
const report = root =>
  JSON.parse(fs.readFileSync(path.join(root, 'compat/generated/report.json'), 'utf8'))

describe('compatibility execution', () => {
  it('keeps help read-only and replaces stale results for invalid CLI arguments', async () => {
    const root = fixture()

    fs.mkdirSync(path.join(root, 'scripts'))
    fs.mkdirSync(path.join(root, 'compat/generated'), { recursive: true })
    const entry = fs
      .readFileSync(new URL('../compat.mjs', import.meta.url), 'utf8')
      .replaceAll('./compat/', new URL('../compat/', import.meta.url).href)

    fs.writeFileSync(path.join(root, 'scripts/compat.mjs'), entry)
    const reportFile = path.join(root, 'compat/generated/report.json')

    fs.writeFileSync(reportFile, '{"previous":true}')
    const execute = promisify(execFile)
    const { stdout } = await execute(process.execPath, ['scripts/compat.mjs', '--help'], {
      cwd: root
    })

    assert.match(stdout, /Common commands/)
    assert.equal(report(root).previous, true)
    await assert.rejects(
      execute(process.execPath, ['scripts/compat.mjs', '--invalid-option'], { cwd: root }),
      error => {
        assert.equal(error.code, 2)
        assert.match(error.stderr, /Unknown option/)

        return true
      }
    )
    assert.match(report(root).error, /Unknown option/)
    assert.equal(report(root).previous, undefined)
  })

  it('checks unchanged APIs, harmless additions, warnings, breaks, and explicit updates through real workers', async () => {
    const root = fixture()

    assert.equal(await run(root, ['--update']), 0, JSON.stringify(report(root)))
    const baseline = fs.readFileSync(path.join(root, 'compat/baseline/example.api.md'), 'utf8')

    assert.equal(await run(root), 0)
    assert.equal(report(root).summary.baselines, 0)

    fs.writeFileSync(
      path.join(root, 'packages/example/index.d.ts'),
      `${source}\nexport declare function extra(): void;`
    )
    assert.equal(await run(root), 1)
    assert.equal(report(root).summary.toReview, 0)
    assert.equal(report(root).summary.baselines, 1)

    const manifestPath = path.join(root, 'packages/example/package.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ ...manifest, dependencies: { 'example-dependency': '^2.0.0' } })
    )
    assert.equal(await run(root), 1)
    assert.equal(report(root).summary.toReview, 1)
    assert.ok(
      report(root).results[0].findings.some(finding => finding.code === 'dependencies.changed')
    )
    fs.writeFileSync(manifestPath, JSON.stringify(manifest))

    fs.writeFileSync(
      path.join(root, 'packages/example/index.d.ts'),
      'export declare function f(value: string, required: number): void;'
    )
    assert.equal(await run(root), 1)
    assert.equal(report(root).summary.toReview, 1)
    assert.equal(await run(root, ['example', '--update']), 0)
    assert.equal(report(root).updateBlocked, false)
    assert.equal(report(root).updateCompleted, true)
    assert.equal(report(root).summary.toReview, 1)
    assert.notEqual(
      fs.readFileSync(path.join(root, 'compat/baseline/example.api.md'), 'utf8'),
      baseline
    )
    assert.equal(
      fs.readFileSync(
        path.join(root, 'compat/generated/baseline-reference/example.api.md'),
        'utf8'
      ),
      baseline
    )
    assert.equal(await run(root), 0)
  })

  it('blocks baseline updates when a conditional export has no explicit type coverage', async () => {
    const root = fixture()
    const baselinePath = path.join(root, 'compat/baseline/example.api.md')
    const baseline = fs.readFileSync(baselinePath, 'utf8')
    const manifestPath = path.join(root, 'packages/example/package.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        ...manifest,
        exports: {
          '.': {
            import: { types: './index.d.ts', default: './index.js' },
            require: './index.cjs'
          }
        }
      })
    )
    fs.writeFileSync(path.join(root, 'packages/example/index.d.cts'), source)
    assert.equal(await run(root, ['--update']), 2)
    assert.match(
      report(root).results[0].error,
      /No explicit types declaration for export .#require/
    )
    assert.equal(report(root).updateCompleted, false)
    assert.equal(fs.readFileSync(baselinePath, 'utf8'), baseline)
    assert.equal(fs.existsSync(path.join(root, 'compat/baseline/inventory.json')), false)
  })

  it('replaces old success results after missing declarations, invalid references, or build failures', async () => {
    const root = fixture()

    fs.mkdirSync(path.join(root, 'compat/generated'), { recursive: true })
    const stale = () =>
      fs.writeFileSync(path.join(root, 'compat/generated/report.json'), '{"success":true}')

    stale()
    fs.rmSync(path.join(root, 'packages/example/index.d.ts'))
    assert.equal(await run(root), 2)
    assert.match(report(root).results[0].error, /Missing declaration/)
    assert.equal(report(root).success, undefined)
    const baseline = fs.readFileSync(path.join(root, 'compat/baseline/example.api.md'), 'utf8')

    assert.equal(await run(root, ['--update']), 2)
    assert.equal(report(root).updateBlocked, true)
    assert.equal(
      fs.readFileSync(path.join(root, 'compat/baseline/example.api.md'), 'utf8'),
      baseline
    )

    stale()
    await assert.rejects(
      run(root, ['--base', 'missing-reference-for-test']),
      /git|revision|repository/i
    )
    assert.ok(report(root).error)
    assert.equal(report(root).success, undefined)

    stale()
    await assert.rejects(runCompat(root, parseArguments(['--no-color'], {})), /Build failed/)
    assert.match(report(root).error, /Build failed/)
    assert.ok(fs.existsSync(path.join(root, 'scripts/logs/compat/build.log')))
  })

  it('keeps adopted changes out of pending review while retaining target-branch context', async () => {
    const root = fixture()

    assert.equal(await run(root, ['--update']), 0)
    const git = (args, input) =>
      execFileSync('git', args, { cwd: root, input, encoding: 'utf8', windowsHide: true }).trim()

    git(['init'])
    const blob = file =>
      git(['hash-object', '-w', '--stdin'], fs.readFileSync(path.join(root, file)))
    const tree = entries => git(['mktree'], `${entries.join('\n')}\n`)
    const reports = tree(
      ['example.api.md', 'inventory.json'].map(
        file => `100644 blob ${blob(`compat/baseline/${file}`)}\t${file}`
      )
    )
    const compat = tree([`040000 tree ${reports}\tbaseline`])
    const commit = git(
      [
        '-c',
        'user.name=Compat Test',
        '-c',
        'user.email=compat@example.test',
        'commit-tree',
        tree([`040000 tree ${compat}\tcompat`])
      ],
      'fixture\n'
    )
    const args = ['--base', commit]

    fs.writeFileSync(
      path.join(root, 'packages/example/index.d.ts'),
      'export declare function f(value: string, required: number): void;'
    )
    assert.equal(await run(root, args), 1)
    assert.equal(report(root).summary.baselines, 1)
    assert.equal(await run(root, [...args, '--update']), 0)
    assert.equal(await run(root, args), 0)
    assert.equal(report(root).summary.baselines, 0)
    assert.equal(report(root).summary.toReview, 0)
    assert.equal(report(root).summary.possibleBreaks, 0)
    assert.deepEqual(report(root).results[0].findings, [])
    assert.ok(
      report(root).results[0].reference.findings.some(finding => finding.kind === 'breaking')
    )
    assert.equal(report(root).reference.commit, commit)
    assert.match(formatReport(report(root).results), /Baseline current/)
    assert.doesNotMatch(formatReport(report(root).results), /Possible breaks|baseline:|generated:/)

    // Harmless drift must not resurrect historical breaks in the pending-review list.
    fs.appendFileSync(
      path.join(root, 'packages/example/index.d.ts'),
      '\nexport declare function extra(): void;'
    )
    assert.equal(await run(root, args), 1)
    assert.equal(report(root).summary.toReview, 0)
    assert.equal(report(root).summary.possibleBreaks, 0)

    // A new break is compared with the adopted signature, not the target branch's original API.
    fs.writeFileSync(
      path.join(root, 'packages/example/index.d.ts'),
      'export declare function f(value: string, required: number, next: boolean): void;'
    )
    assert.equal(await run(root, args), 1)
    assert.equal(report(root).summary.toReview, 1)
    assert.ok(
      report(root).results[0].findings.some(finding => finding.before?.includes('required: number'))
    )
    assert.equal(await run(root, [...args, '--update']), 0)
    const entry = report(root).results[0]
    const pendingSource = entry.breaks[0].sources.baseline
    const referenceSource = entry.reference.breaks[0].sources.baseline

    assert.notEqual(pendingSource.file, referenceSource.file)
    assert.match(fs.readFileSync(path.join(root, pendingSource.file), 'utf8'), /required: number/)
    assert.doesNotMatch(
      fs.readFileSync(path.join(root, referenceSource.file), 'utf8'),
      /required: number/
    )

    const inventoryFile = path.join(root, 'compat/baseline/inventory.json')
    const inventory = JSON.parse(fs.readFileSync(inventoryFile, 'utf8'))

    inventory.packages.push({
      name: '@test/removed',
      directory: 'packages/removed',
      entries: {},
      dependencies: {},
      unsupported: []
    })
    fs.writeFileSync(inventoryFile, JSON.stringify(inventory))
    assert.equal(await run(root, args), 1)
    const removed = report(root).results.find(result => result.name === '@test/removed')

    assert.equal(removed.baselineChanged, true)
    assert.ok(removed.findings.some(finding => finding.code === 'package.removed'))
    assert.equal(await run(root, [...args, '--update']), 0)
    assert.ok(
      !JSON.parse(fs.readFileSync(inventoryFile, 'utf8')).packages.some(
        pkg => pkg.name === '@test/removed'
      )
    )
  })

  it('stops an interrupted build and leaves an incomplete-analysis diagnostic', async () => {
    const root = fixture()
    const marker = path.join(root, 'build.pid')

    fs.writeFileSync(
      path.join(root, 'build.cjs'),
      [
        "require('node:fs').writeFileSync('build.pid', String(process.pid))",
        'setInterval(() => {}, 1000)',
        ''
      ].join('\n')
    )
    const running = runCompat(root, parseArguments(['--no-color'], {}))
    let interrupted = false

    try {
      const deadline = Date.now() + 10000

      while (!fs.existsSync(marker) && Date.now() < deadline) {
        await delay(25)
      }

      assert.ok(fs.existsSync(marker), 'Build child must start before interruption')
      const pid = Number(fs.readFileSync(marker, 'utf8'))

      process.emit('SIGINT')
      interrupted = true
      assert.equal(await running, 130)
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
      assert.match(report(root).error, /interrupted/)
      assert.ok(
        !fs.readdirSync(path.join(root, 'compat/generated')).some(name => name.startsWith('run-'))
      )
    } finally {
      if (!interrupted) {
        process.emit('SIGINT')
      }

      await running
    }
  })
})
