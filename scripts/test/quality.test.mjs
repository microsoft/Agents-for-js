import { npmInvocation } from '../shared.mjs'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { PassThrough } from 'node:stream'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { promisify } from 'node:util'

import { createNpmCheckRunner, createReporter, failureOutput, parseArguments, reportCheckOutput, runQualityChecks, selectQualityChecks } from '../quality.mjs'

const check = (id, options = {}) => ({ id, label: id, script: id, ...options })
const silentReporter = () => createReporter({ live: false, write: () => {}, color: false })
const tick = async () => await new Promise(resolve => setImmediate(resolve))

describe('quality runner', () => {
  it('selects offline checks by default and forwards strict mode only to the optional link check', () => {
    const offline = selectQualityChecks()
    assert.equal(offline.length, 7)
    assert.equal(offline.some(current => current.id === 'documentation-links'), false)
    assert.equal(offline.some(current => current.args?.includes('--check-links')), false)

    const checks = selectQualityChecks({ checkLinks: true, strictLinks: true })
    const links = checks.find(current => current.id === 'documentation-links')
    assert.equal(checks.length, 8)
    assert.equal(links.script, 'repo:doctor')
    assert.deepEqual(links.args, ['--check-links', '--strict-links'])
    const doctor = checks.find(current => current.id === 'doctor')
    assert.equal(doctor.script, 'repo:doctor')
    assert.equal(doctor.args, undefined)
    assert.equal(doctor.note, undefined)
    assert.equal(links.parentId, 'doctor')
    assert.equal(offline.find(current => current.id === 'doctor').note, 'external links: off (enable: --check-links)')
    assert.equal(selectQualityChecks().length, 7)
    assert.throws(() => selectQualityChecks({ strictLinks: true }), /requires --check-links/)
  })

  it('starts build while links are pending and retains link failures without skipping build or tests', async () => {
    const started = []
    const completions = new Map()
    const running = runQualityChecks(selectQualityChecks({ checkLinks: true }), {
      reporter: silentReporter(),
      runCheck: current => new Promise(resolve => {
        started.push(current.id)
        completions.set(current.id, resolve)
      }),
    })

    await tick()
    assert.deepEqual([...started].sort(), ['dependencies', 'doctor', 'documentation-links', 'lint'])
    completions.get('doctor')({ exitCode: 0 })
    await tick()
    assert.ok(started.includes('build'))
    completions.get('documentation-links')({ exitCode: 1 })
    completions.get('lint')({ exitCode: 0 })
    completions.get('dependencies')({ exitCode: 0 })
    completions.get('build')({ exitCode: 0 })
    await tick()
    assert.ok(started.includes('test'))
    completions.get('test')({ exitCode: 0 })
    await tick()
    completions.get('compat')({ exitCode: 0 })
    completions.get('samples')({ exitCode: 0 })
    const results = await running
    assert.equal(results.find(current => current.id === 'documentation-links').state, 'failed')
    assert.ok(results.filter(current => current.id !== 'documentation-links').every(current => current.state === 'passed'))
  })

  it('rejects invalid flags and displays help without starting the quality suite', () => {
    assert.deepEqual(parseArguments(['--check-links', '--strict-links', '--verbose']), {
      checkLinks: true,
      strictLinks: true,
      verbose: true,
      help: false,
    })
    assert.throws(() => parseArguments(['--strict-links']), /requires --check-links/)
    assert.throws(() => parseArguments(['--check-link']), /Unknown argument/)
    const cli = path.resolve('scripts/quality.mjs')
    const help = spawnSync(process.execPath, [cli, '--check-links', '--help'], { encoding: 'utf8' })
    assert.equal(help.status, 0)
    assert.match(help.stdout, /--check-links/)
    assert.doesNotMatch(help.stdout, /RUN/)
    assert.doesNotMatch(help.stdout, /External website checks:/)
    const invalid = spawnSync(process.execPath, [cli, '--strict-links'], { encoding: 'utf8' })
    assert.equal(invalid.status, 2)
    assert.match(invalid.stderr, /requires --check-links/)
    assert.doesNotMatch(invalid.stdout, /RUN/)
    assert.doesNotMatch(invalid.stdout, /External website checks:/)
  })

  it('passes script flags after the npm separator with and without npm_execpath', () => {
    const previous = process.env.npm_execpath
    try {
      process.env.npm_execpath = path.join(os.tmpdir(), 'npm cli.cjs')
      assert.deepEqual(npmInvocation('repo:doctor', ['--check-links']), [
        process.execPath,
        [process.env.npm_execpath, 'run', '--silent', 'repo:doctor', '--', '--check-links'],
      ])
      delete process.env.npm_execpath
      assert.deepEqual(npmInvocation('repo:doctor', ['--check-links']), [
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['run', '--silent', 'repo:doctor', '--', '--check-links'],
      ])
    } finally {
      if (previous === undefined) {
        delete process.env.npm_execpath
      } else {
        process.env.npm_execpath = previous
      }
    }
  })

  it('CLI includes the link check in status, retained logs, and exit codes without contacting websites', async context => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'quality-cli-'))
    context.after(() => rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }))
    const fakeNpm = path.join(directory, 'npm.mjs')
    await writeFile(fakeNpm, [
      "import { mkdirSync, writeFileSync } from 'node:fs'",
      'const args = process.argv.slice(2)',
      "if (args.includes('compat')) {",
      "  mkdirSync('compat/generated', { recursive: true })",
      "  writeFileSync('compat/generated/report.json', JSON.stringify({ schemaVersion: 1, summary: { toReview: 0, baselines: 0 } }))",
      '}',
      'console.log(JSON.stringify(args))',
      "if (args.includes('--check-links')) {",
      "  console.log('External verification is incomplete: one unverified URL.')",
      "  console.log('HTTP requests: 2 attempts, including redirects, GET fallbacks, and retries.')",
      '  process.exitCode = Number(process.env.LINK_EXIT_CODE)',
      '}',
    ].join('\n'))
    for (const linkExitCode of [0, 1]) {
      const logDirectory = path.join(directory, `logs-${linkExitCode}`)
      const result = spawnSync(process.execPath, [path.resolve('scripts/quality.mjs'), '--check-links'], {
        encoding: 'utf8',
        env: { ...process.env, npm_execpath: fakeNpm, QUALITY_LOG_DIR: logDirectory, LINK_EXIT_CODE: String(linkExitCode) },
      })
      assert.equal(result.status, linkExitCode, result.stderr)
      assert.match(result.stdout, /↳ Documentation links/)
      assert.doesNotMatch(result.stdout, /External website checks were not run|Enable:/)
      assert.match(result.stdout, /npm run repo:doctor -- --check-links/)
      assert.match(result.stdout, /External verification is incomplete/)
      assert.match(result.stdout, /HTTP requests: 2 attempts/)
      assert.match(result.stdout, linkExitCode === 0 ? /8 passed, 0 failed/ : /7 passed, 1 failed/)
      const linkLog = await readFile(path.join(logDirectory, 'documentation-links.log'), 'utf8')
      assert.match(linkLog, /"repo:doctor","--","--check-links"/)
      const doctorLog = await readFile(path.join(logDirectory, 'doctor.log'), 'utf8')
      assert.doesNotMatch(doctorLog, /--check-links/)
    }
    const offline = spawnSync(process.execPath, [path.resolve('scripts/quality.mjs')], {
      encoding: 'utf8',
      env: { ...process.env, npm_execpath: fakeNpm, QUALITY_LOG_DIR: path.join(directory, 'offline-logs') },
    })
    assert.equal(offline.status, 0, offline.stderr)
    assert.match(offline.stdout, /PASS[^\n]+Repository doctor[^\n]+external links: off \(enable: --check-links\)/)
    assert.match(offline.stdout, /7 passed, 0 failed/)
    assert.doesNotMatch(offline.stdout, /External website checks:|External website checks were not run/)
    assert.doesNotMatch(offline.stdout, /HTTP requests:|Output: Documentation links/)

    const strict = spawnSync(process.execPath, [path.resolve('scripts/quality.mjs'), '--check-links', '--strict-links'], {
      encoding: 'utf8',
      env: { ...process.env, npm_execpath: fakeNpm, QUALITY_LOG_DIR: path.join(directory, 'strict-logs'), LINK_EXIT_CODE: '1' },
    })
    assert.equal(strict.status, 1, strict.stderr)
    assert.match(strict.stdout, /↳ Documentation links/)
    assert.match(strict.stdout, /Documentation links[^\n]+strict: unverified URLs fail/)
  })

  it('starts independent checks in parallel and releases a dependent check when its prerequisite passes', async () => {
    const started = []
    const completions = new Map()
    const runCheck = current =>
      new Promise(resolve => {
        started.push(current.id)
        completions.set(current.id, resolve)
      })

    const running = runQualityChecks(
      [
        check('doctor'),
        check('lint'),
        check('build', { after: ['doctor'], requiresSuccess: ['doctor'] })
      ],
      { runCheck, reporter: silentReporter() }
    )

    await tick()
    assert.deepEqual(started.sort(), ['doctor', 'lint'])

    completions.get('lint')({ exitCode: 0 })
    await tick()
    assert.deepEqual(started.sort(), ['doctor', 'lint'])

    completions.get('doctor')({ exitCode: 0 })
    await tick()
    assert.deepEqual(started.sort(), ['build', 'doctor', 'lint'])

    completions.get('build')({ exitCode: 0 })
    assert.deepEqual(
      (await running).map(result => result.state),
      ['passed', 'passed', 'passed']
    )
  })

  it('skips build-dependent checks after a failed prerequisite while retaining independent results', async () => {
    const invoked = []
    const results = await runQualityChecks(
      [
        check('doctor'),
        check('lint'),
        check('build', { after: ['doctor'], requiresSuccess: ['doctor'] }),
        check('test', { after: ['build'], requiresSuccess: ['build'] })
      ],
      {
        runCheck: async current => {
          invoked.push(current.id)

          return { exitCode: current.id === 'doctor' ? 1 : 0 }
        },
        reporter: silentReporter()
      }
    )

    assert.deepEqual(invoked.sort(), ['doctor', 'lint'])
    assert.deepEqual(
      results.map(result => result.state),
      ['failed', 'passed', 'skipped', 'skipped']
    )
    assert.match(results[2].reason, /doctor/)
  })

  it('continues artifact-safe checks after tests fail', async () => {
    const invoked = []
    const results = await runQualityChecks(
      [
        check('build'),
        check('test', { after: ['build'], requiresSuccess: ['build'] }),
        check('compat', { after: ['build', 'test'], requiresSuccess: ['build'] }),
        check('samples', { after: ['build', 'test'], requiresSuccess: ['build'] })
      ],
      {
        runCheck: async current => {
          invoked.push(current.id)

          return { exitCode: current.id === 'test' ? 1 : 0 }
        },
        reporter: silentReporter()
      }
    )

    assert.deepEqual(invoked.sort(), ['build', 'compat', 'samples', 'test'])
    assert.deepEqual(
      results.map(result => result.state),
      ['passed', 'failed', 'passed', 'passed']
    )
  })

  it('does not start queued checks after cancellation', async () => {
    const started = []
    const completions = new Map()
    let cancelled = false
    const running = runQualityChecks(
      [
        check('build'),
        check('test', { after: ['build'], requiresSuccess: ['build'] }),
        check('compat', { after: ['build', 'test'], requiresSuccess: ['build'] }),
        check('samples', { after: ['build', 'test'], requiresSuccess: ['build'] })
      ],
      {
        isCancelled: () => cancelled,
        runCheck: current =>
          new Promise(resolve => {
            started.push(current.id)
            completions.set(current.id, resolve)
          }),
        reporter: silentReporter()
      }
    )

    await tick()
    completions.get('build')({ exitCode: 0 })
    await tick()
    assert.deepEqual(started, ['build', 'test'])

    cancelled = true
    completions.get('test')({ exitCode: 1 })
    const results = await running

    assert.deepEqual(started, ['build', 'test'])
    assert.deepEqual(
      results.map(result => result.state),
      ['passed', 'failed', 'skipped', 'skipped']
    )
    assert.match(results[2].reason, /interrupted/)
  })

  it('does not launch a check if cancellation occurs while scheduling', async () => {
    const invoked = []
    let cancelled = false
    const results = await runQualityChecks([check('lint'), check('doctor')], {
      isCancelled: () => cancelled,
      runCheck: async current => {
        invoked.push(current.id)

        return { exitCode: 0 }
      },
      reporter: {
        queued: () => {},
        started: () => {
          cancelled = true
        },
        skipped: () => {}
      }
    })

    assert.deepEqual(invoked, [])
    assert.deepEqual(
      results.map(result => result.state),
      ['skipped', 'skipped']
    )
  })

  it('captures combined command output without forwarding it to successful reports', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'quality-test-'))

    try {
      const runner = createNpmCheckRunner({
        directory,
        cwd: directory,
        spawnProcess: () => {
          const child = new EventEmitter()

          child.pid = 1
          child.stdout = new PassThrough()
          child.stderr = new PassThrough()
          queueMicrotask(() => {
            child.stdout.end('standard output\n')
            child.stderr.end('standard error\n')
            child.emit('close', 1, null)
          })

          return child
        }
      })
      const execution = await runner.run(check('fixture'))
      const output = await readFile(execution.logPath, 'utf8')

      assert.equal(execution.exitCode, 1)
      assert.match(output, /standard output/)
      assert.match(output, /standard error/)

      const lines = []
      const reporter = createReporter({ write: line => lines.push(line), color: false })

      reporter.started({ label: 'fixture', script: 'fixture' })
      reporter.finished({ label: 'fixture', script: 'fixture', state: 'passed', durationMs: 1 })
      assert.doesNotMatch(lines.join('\n'), /standard (output|error)/)
      assert.match(lines.join('\n'), /PASS\s+fixture\s+npm run fixture\s+1ms/)
    } finally {
      await rm(directory, { force: true, maxRetries: 3, recursive: true, retryDelay: 100 }).catch(
        () => {}
      )
    }
  })

  it('updates interactive status rows in place while a command is running', () => {
    let currentTime = 0
    const writes = []
    const operations = []
    const stream = {
      isTTY: true,
      write: value => writes.push(value),
      clearLine: direction => operations.push(['clearLine', direction]),
      cursorTo: column => operations.push(['cursorTo', column]),
      moveCursor: (columns, rows) => operations.push(['moveCursor', columns, rows])
    }
    const reporter = createReporter({
      stream,
      autoRefresh: false,
      color: false,
      now: () => currentTime,
      term: 'xterm-256color'
    })
    const eslint = { id: 'lint', label: 'ESLint', script: 'lint' }
    const doctor = selectQualityChecks().find(current => current.id === 'doctor')

    reporter.queued([doctor, eslint])
    assert.match(writes.join(''), /Repository doctor[^\n]+external links: off \(enable: --check-links\)/)
    reporter.started({ ...eslint, state: 'running', startedAt: 0 })
    currentTime = 4000
    operations.length = 0
    writes.length = 0
    reporter.refresh()
    assert.deepEqual(operations, [])
    assert.equal(writes.length, 1)
    assert.equal(writes[0].startsWith('\u001B7\u001B[1A\r'), true)
    assert.equal(writes[0].endsWith('\u001B8'), true)
    assert.doesNotMatch(writes[0], /Repository doctor/)
    reporter.finished({ ...eslint, state: 'passed', startedAt: 0, durationMs: 4000 })
    reporter.close()

    assert.match(writes.join(''), /RUN\s+.*~20%\s+ESLint\s+npm run lint\s+4\.0s/)
    assert.match(writes.join(''), /PASS\s+✓ 100%\s+ESLint\s+npm run lint\s+4\.0s/)
    reporter.finished({ ...doctor, state: 'passed', startedAt: 0, durationMs: 4000 })
    assert.match(writes.join(''), /PASS[^\n]+Repository doctor[^\n]+external links: off \(enable: --check-links\)/)
  })

  it('groups flag checks below their parent and redraws the correct nested row', () => {
    const writes = []
    const reporter = createReporter({
      stream: { isTTY: true, write: value => writes.push(value) },
      autoRefresh: false,
      color: false,
      term: 'xterm-256color',
      now: () => 1000,
    })
    const checks = selectQualityChecks({ checkLinks: true })
    const links = checks.find(current => current.id === 'documentation-links')
    reporter.queued(checks)
    const output = writes.join('')
    assert.match(output, /Repository doctor[^\n]+\nWAIT[^\n]+↳ Documentation links[^\n]+\nWAIT[^\n]+ESLint/)
    assert.doesNotMatch(output, /external links: see/)
    writes.length = 0
    reporter.started({ ...links, state: 'running', startedAt: 0 })
    assert.ok(writes[0].startsWith('\u001B7\u001B[7A\r'))
    assert.match(writes[0], /↳ Documentation links/)
    reporter.finished({ ...links, state: 'passed', startedAt: 0, durationMs: 1000 })
    assert.match(writes.at(-1), /PASS[^\n]+↳ Documentation links/)
    reporter.close()
  })

  it('rejects missing or cyclic display parents before starting checks', async () => {
    await assert.rejects(runQualityChecks([check('child', { parentId: 'missing' })]), /Unknown display parent/)
    await assert.rejects(runQualityChecks([
      check('first', { parentId: 'second' }),
      check('second', { parentId: 'first' }),
    ]), /Display parent cycle/)
  })

  it('uses append-only output when TERM is dumb', () => {
    const writes = []
    const stream = { isTTY: true, write: value => writes.push(value) }
    const reporter = createReporter({ stream, color: false, live: true, term: 'dumb' })

    reporter.queued?.([check('lint')])
    reporter.started(check('lint'))

    assert.match(writes.join(''), /RUN\s+lint\s+npm run lint/)
    assert.equal(writes.join('').includes('\u001B[?25'), false)
    const colored = createReporter({ stream, color: true, live: false })
    colored.finished({ ...selectQualityChecks()[0], state: 'passed', durationMs: 1 })
    assert.ok(writes.join('').includes('\u001B[2m  external links: off (enable: --check-links)\u001B[0m'))
  })

  it('shows only Node test failures in the final test report', () => {
    const output = [
      '✔ a passing test',
      '✔ another passing test',
      '',
      '✖ failing tests:',
      '',
      'test at packages/example/test/example.test.ts:4:1',
      '✖ should report this assertion',
      '  AssertionError: expected true'
    ].join('\n')

    const reduced = failureOutput(check('test'), output)

    assert.doesNotMatch(reduced, /passing test/)
    assert.match(reduced, /failing tests/)
    assert.match(reduced, /should report this assertion/)
    assert.equal(failureOutput(check('lint'), output), output)
    assert.equal(
      failureOutput(check('lint'), '::error::unsafe output', { githubActions: true }),
      '\u200B::error\u200B::unsafe output'
    )
  })

  it('prints every captured command log in a folded GitHub Actions group', () => {
    const writes = []

    reportCheckOutput(
      check('lint', { label: 'ESLint', script: 'lint' }),
      '::error::lint output\n##[error]legacy output\n',
      {
        githubActions: true,
        stream: { write: value => writes.push(value) }
      }
    )

    assert.deepEqual(writes, [
      '::group::ESLint — npm run lint\n',
      '\u200B::error\u200B::lint output\n\u200B##[error]legacy output\n',
      '::endgroup::\n'
    ])
  })

  it('prints captured logs locally only in verbose mode', () => {
    const writes = []
    const options = { stream: { write: value => writes.push(value) } }

    reportCheckOutput(check('lint'), 'lint output\n', options)
    assert.deepEqual(writes, [])

    reportCheckOutput(check('lint'), 'lint output\n', { ...options, verbose: true })
    assert.deepEqual(writes, ['\nOutput: lint (npm run lint)\n', 'lint output\n'])
  })
  it('retains successful compat warnings and baseline notices without printing the full log', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'quality-compat-'))

    try {
      await mkdir(path.join(directory, 'compat/generated'), { recursive: true })
      const reportFile = path.join(directory, 'compat/generated/report.json')
      let spawnOptions
      const runner = createNpmCheckRunner({
        directory,
        cwd: directory,
        spawnProcess: (command, args, options) => {
          spawnOptions = options
          const child = new EventEmitter()

          child.stdout = new PassThrough()
          child.stderr = new PassThrough()
          queueMicrotask(async () => {
            await writeFile(
              reportFile,
              JSON.stringify({ schemaVersion: 1, summary: { toReview: 1, baselines: 2 } })
            )
            child.stdout.end('Full compat output\n')
            child.stderr.end()
            child.emit('close', 0, null)
          })

          return child
        }
      })
      const execution = await runner.run(check('compat'))

      assert.equal(execution.exitCode, 0)
      assert.equal(spawnOptions.env.COMPAT_SKIP_BUILD, '1')
      assert.equal(spawnOptions.env.COMPAT_BASE, process.env.COMPAT_BASE)

      for (const live of [false, true]) {
        const writes = []
        const reporter = createReporter({
          live,
          color: false,
          term: 'xterm',
          stream: { isTTY: live, write: text => writes.push(text) }
        })

        reporter.summary([
          { ...check('compat'), state: 'passed', execution, startedAt: 1, durationMs: 2 }
        ])
        reporter.close()
        const output = writes.join('')

        assert.match(output, /1 package to review · 2 baselines outdated/)
        assert.match(output, /compat\/generated\/report.json/)
        assert.doesNotMatch(output, /Full compat output/)
        writes.length = 0
        reporter.summary([
          {
            ...check('compat'),
            state: 'passed',
            execution: { compatSummary: { toReview: 0, baselines: 1 } }
          }
        ])
        assert.match(writes.join(''), /npm run compat -- --update/)
        writes.length = 0
        reporter.summary([
          {
            ...check('compat'),
            state: 'passed',
            execution: { compatSummary: { toReview: 0, baselines: 0 } }
          }
        ])
        assert.doesNotMatch(writes.join(''), /API compatibility:/)
      }
    } finally {
      if (
        path.dirname(directory) === os.tmpdir() &&
        path.basename(directory).startsWith('quality-compat-')
      ) {
        await rm(directory, { recursive: true, force: true, maxRetries: 3 })
      }
    }
  })
  it('does not reuse an earlier compatibility report when the command produces none', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'quality-compat-'))

    try {
      await mkdir(path.join(directory, 'compat/generated'), { recursive: true })
      await writeFile(
        path.join(directory, 'compat/generated/report.json'),
        JSON.stringify({ schemaVersion: 1, summary: { toReview: 9, baselines: 9 } })
      )
      const runner = createNpmCheckRunner({
        directory,
        cwd: directory,
        spawnProcess: () => {
          const child = new EventEmitter()

          child.stdout = new PassThrough()
          child.stderr = new PassThrough()
          queueMicrotask(() => {
            child.stdout.end()
            child.stderr.end()
            child.emit('close', 0, null)
          })

          return child
        }
      })
      const execution = await runner.run(check('compat'))

      assert.equal(execution.exitCode, 2)
      assert.equal(execution.compatSummary, undefined)
      assert.match(execution.error.message, /missing or invalid/)
    } finally {
      if (
        path.dirname(directory) === os.tmpdir() &&
        path.basename(directory).startsWith('quality-compat-')
      ) {
        await rm(directory, { recursive: true, force: true, maxRetries: 3 })
      }
    }
  })
  it('does not spawn compat if cancelled during asynchronous report cleanup', async () => {
    let spawned = false
    const runner = createNpmCheckRunner({
      directory: os.tmpdir(),
      cwd: path.join(os.tmpdir(), 'quality-cancel-nonexistent-fixture'),
      spawnProcess: () => {
        spawned = true
      }
    })
    const running = runner.run(check('compat'))

    runner.cancel()
    assert.equal((await running).exitCode, 130)
    assert.equal((await runner.run(check('lint'))).exitCode, 130)
    assert.equal(spawned, false)
  })

  it('replaces stale compatibility results when a prerequisite prevents analysis', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'quality-skipped-'))

    try {
      await mkdir(path.join(directory, 'scripts'), { recursive: true })
      await mkdir(path.join(directory, 'compat/generated'), { recursive: true })
      const reportFile = path.join(directory, 'compat/generated/report.json')

      await writeFile(
        reportFile,
        JSON.stringify({ schemaVersion: 1, summary: { toReview: 0, baselines: 0 } })
      )
      const logs = path.join(directory, 'scripts/logs/quality')

      await mkdir(logs, { recursive: true })
      await writeFile(path.join(logs, 'build.log'), 'stale build')
      await writeFile(path.join(logs, 'doctor.log'), 'stale doctor')
      await writeFile(path.join(logs, 'custom.log'), 'keep')
      await writeFile(
        path.join(directory, 'scripts/quality.mjs'),
        await readFile(new URL('../quality.mjs', import.meta.url))
      )
      await writeFile(
        path.join(directory, 'scripts/shared.mjs'),
        await readFile(new URL('../shared.mjs', import.meta.url))
      )
      await writeFile(
        path.join(directory, 'package.json'),
        JSON.stringify({
          private: true,
          scripts: {
            'repo:doctor': 'node -e "process.exit(1)"',
            lint: 'node -e "process.exit(0)"',
            'lint:deps': 'node -e "process.exit(0)"',
            'lint:deps:ci': 'node -e "process.exit(0)"'
          }
        })
      )
      await assert.rejects(
        promisify(execFile)(process.execPath, ['scripts/quality.mjs'], {
          cwd: directory,
          env: { ...process.env, QUALITY_LOG_DIR: '', NO_COLOR: '1' }
        }),
        error => {
          assert.equal(error.code, 1)
          assert.match(error.stdout, /SKIP\s+API compatibility/)

          return true
        }
      )
      const report = JSON.parse(await readFile(reportFile, 'utf8'))

      assert.equal(report.skipped, true)
      assert.match(report.error, /skipped/)
      assert.equal(report.summary, undefined)
      assert.doesNotMatch(await readFile(path.join(logs, 'doctor.log'), 'utf8'), /stale doctor/)
      await assert.rejects(readFile(path.join(logs, 'build.log')), { code: 'ENOENT' })
      assert.equal(await readFile(path.join(logs, 'custom.log'), 'utf8'), 'keep')
    } finally {
      if (
        path.dirname(directory) === os.tmpdir() &&
        path.basename(directory).startsWith('quality-skipped-')
      ) {
        await rm(directory, { recursive: true, force: true, maxRetries: 3 })
      }
    }
  })

  it('shows successful link diagnostics locally and includes flags in CI log groups', () => {
    const links = selectQualityChecks({ checkLinks: true, strictLinks: true }).find(current => current.id === 'documentation-links')
    const writes = []
    const stream = { write: value => writes.push(value) }
    reportCheckOutput(links, '17 unverified URLs\n', { stream })
    assert.match(writes.join(''), /Output: Documentation links \(npm run repo:doctor -- --check-links --strict-links\)/)
    assert.match(writes.join(''), /17 unverified URLs/)
    writes.length = 0
    reportCheckOutput(links, '17 unverified URLs\n', { stream, githubActions: true })
    assert.match(writes.join(''), /::group::Documentation links — npm run repo:doctor -- --check-links --strict-links/)
  })
})
