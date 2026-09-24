import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const qualityChecks = [
  { id: 'doctor', label: 'Repository doctor', script: 'repo:doctor' },
  { id: 'lint', label: 'ESLint', script: 'lint' },
  { id: 'dependencies', label: 'Dependency lint', script: process.env.GITHUB_ACTIONS === 'true' ? 'lint:deps:ci' : 'lint:deps' },
  { id: 'build', label: 'Build', script: 'build', after: ['doctor'], requiresSuccess: ['doctor'] },
  { id: 'test', label: 'Tests', script: 'test', after: ['build'], requiresSuccess: ['build'] },
  { id: 'compat', label: 'API compatibility', script: 'compat', after: ['build', 'test'], requiresSuccess: ['build'] },
  { id: 'samples', label: 'Sample build', script: 'build:samples', after: ['build', 'test'], requiresSuccess: ['build'] },
]

const terminalStates = new Set(['passed', 'failed', 'skipped'])
const expectedDurationMs = {
  build: 30000,
  compat: 20000,
  dependencies: 30000,
  doctor: 5000,
  lint: 20000,
  samples: 10000,
  test: 30000,
}
// eslint-disable-next-line prefer-regex-literals -- an escape character literal violates no-control-regex.
const ansiEscapePattern = new RegExp(String.raw`\u001B\[[0-?]*[ -/]*[@-~]`, 'g')

/**
 * Run a dependency-aware collection of checks. Checks that do not depend on one
 * another begin immediately; downstream checks wait for declared dependencies.
 *
 * @param {Array<QualityCheck>} checks
 * @param {{ isCancelled?: () => boolean, runCheck?: (check: QualityCheck) => Promise<CheckExecution>, reporter?: QualityReporter, now?: () => number }} [options]
 */
export async function runQualityChecks (checks, options = {}) {
  validateChecks(checks)

  const runCheck = options.runCheck ?? (() => Promise.reject(new Error('A check runner is required.')))
  const reporter = options.reporter ?? createReporter({ write: () => {} })
  const now = options.now ?? (() => performance.now())
  const isCancelled = options.isCancelled ?? (() => false)
  const results = new Map(checks.map(check => [check.id, {
    ...check,
    after: check.after ?? [],
    requiresSuccess: check.requiresSuccess ?? [],
    state: 'queued',
  }]))
  reporter.queued?.(checks)

  return await new Promise((resolve, reject) => {
    let active = 0
    let settled = false

    const finish = () => {
      if (settled) return
      settled = true
      resolve(checks.map(check => results.get(check.id)))
    }

    const skipQueuedChecks = reason => {
      for (const result of results.values()) {
        if (result.state !== 'queued') continue
        result.state = 'skipped'
        result.reason = reason
        reporter.skipped(result)
      }
    }

    const schedule = () => {
      if (isCancelled()) {
        skipQueuedChecks('quality run interrupted')
        if (active === 0) finish()
        return
      }

      let progressed = false

      for (const result of results.values()) {
        if (isCancelled()) {
          skipQueuedChecks('quality run interrupted')
          break
        }
        if (result.state !== 'queued') continue
        const dependencies = result.after.map(id => results.get(id))
        if (!dependencies.every(dependency => terminalStates.has(dependency.state))) continue

        const failedRequirements = result.requiresSuccess
          .map(id => results.get(id))
          .filter(dependency => dependency.state !== 'passed')

        if (failedRequirements.length > 0) {
          result.state = 'skipped'
          result.reason = `requires ${failedRequirements.map(dependency => dependency.label).join(', ')} to pass`
          reporter.skipped(result)
          progressed = true
          continue
        }

        result.state = 'running'
        result.startedAt = now()
        reporter.started(result)
        active += 1
        progressed = true

        Promise.resolve()
          .then(() => {
            if (isCancelled()) {
              result.state = 'skipped'
              result.reason = 'quality run interrupted'
              return
            }
            return runCheck(result)
          })
          .then(execution => {
            if (result.state === 'skipped') return
            result.execution = execution
            result.state = execution.exitCode === 0 ? 'passed' : 'failed'
          })
          .catch(error => {
            result.execution = { exitCode: 1, error }
            result.state = 'failed'
          })
          .finally(() => {
            result.durationMs = now() - result.startedAt
            active -= 1
            if (result.state === 'skipped') reporter.skipped(result)
            else reporter.finished(result)
            schedule()
          })
      }

      if ([...results.values()].every(result => terminalStates.has(result.state))) {
        finish()
        return
      }

      if (!progressed && active === 0) {
        reject(new Error('Quality checks could not be scheduled.'))
      }
    }

    schedule()
  })
}

/**
 * @param {{ directory: string, cwd?: string, spawnProcess?: typeof spawn }} options
 */
export function createNpmCheckRunner ({ directory, cwd = root, spawnProcess = spawn }) {
  const children = new Set()

  return {
    run: async check => {
      const logPath = path.join(directory, `${check.id}.log`)
      const log = createWriteStream(logPath, { flags: 'w' })
      const [command, args] = npmInvocation(check.script)

      return await new Promise(resolve => {
        const child = spawnProcess(command, args, {
          cwd,
          shell: !process.env.npm_execpath && process.platform === 'win32',
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        })
        children.add(child)
        child.stdout?.pipe(log, { end: false })
        child.stderr?.pipe(log, { end: false })

        let completed = false
        const complete = execution => {
          if (completed) return
          completed = true
          children.delete(child)
          resolve({ ...execution, logPath })
        }
        let finalizing = false
        const finalize = execution => {
          if (finalizing) return
          finalizing = true
          log.once('close', () => complete(execution))
          log.end()
        }

        child.once('error', error => finalize({ exitCode: 1, error }))
        child.once('close', (code, signal) => finalize({ exitCode: code ?? 1, signal }))
      })
    },
    cancel: () => {
      for (const child of children) {
        if (child.pid === undefined) continue
        if (process.platform === 'win32') {
          spawnProcess('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true })
        } else {
          child.kill('SIGTERM')
        }
      }
    },
  }
}

/** @param {string} script */
export function npmInvocation (script) {
  if (process.env.npm_execpath) {
    return [process.execPath, [process.env.npm_execpath, 'run', '--silent', script]]
  }
  return [process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', '--silent', script]]
}

/** @param {{ write?: (line: string) => void, color?: boolean }} [options] */
export function createReporter (options = {}) {
  const stream = options.stream ?? process.stdout
  const live = options.live !== false && supportsLiveOutput(stream, options.term)
  if (live) return createLiveReporter({ ...options, stream })

  const write = options.write ?? (line => stream.write(`${line}\n`))
  const color = options.color ?? supportsColor(stream)
  const status = (value, state) => style(value, state, color)

  return {
    started: check => write(`${status('RUN ', 'cyan')}  ${check.label.padEnd(22)} npm run ${check.script}`),
    finished: check => write(`${status(check.state === 'passed' ? 'PASS' : 'FAIL', check.state === 'passed' ? 'green' : 'red')}  ${check.label.padEnd(22)} npm run ${check.script}  ${formatDuration(check.durationMs)}`),
    skipped: check => write(`${status('SKIP', 'yellow')}  ${check.label.padEnd(22)} ${check.reason}`),
    summary: checks => {
      const counts = checks.reduce((summary, check) => ({ ...summary, [check.state]: (summary[check.state] ?? 0) + 1 }), {})
      const startedAt = Math.min(...checks.map(check => check.startedAt ?? Infinity))
      const completedAt = Math.max(...checks.map(check => (check.startedAt ?? 0) + (check.durationMs ?? 0)))
      const durationMs = Number.isFinite(startedAt) ? completedAt - startedAt : 0
      write('')
      write(`${status('Quality', counts.failed ? 'red' : 'green')}: ${counts.passed ?? 0} passed, ${counts.failed ?? 0} failed, ${counts.skipped ?? 0} skipped in ${formatDuration(durationMs)}`)
    },
    failure: (check, output) => {
      write('')
      write(`${status(`FAIL: ${check.label}`, 'red')} (${check.execution?.signal ? `signal ${check.execution.signal}` : `exit ${check.execution?.exitCode ?? 1}`})`)
      write(`Command: npm run ${check.script}`)
      if (check.execution?.error) write(String(check.execution.error.stack ?? check.execution.error))
      if (output.trim()) write(output.trimEnd())
    },
    close: () => {},
  }
}

/**
 * Print captured command output when explicitly requested. GitHub Actions folds
 * each check into an expandable log group; local verbose mode keeps output
 * separate from the concise progress report.
 *
 * @param {QualityCheck} check
 * @param {string} output
 * @param {{ githubActions?: boolean, stream?: { write: (value: string) => void }, verbose?: boolean }} [options]
 */
export function reportCheckOutput (check, output, options = {}) {
  const githubActions = options.githubActions ?? false
  const verbose = options.verbose ?? false
  if (!githubActions && !verbose) return

  const stream = options.stream ?? process.stdout
  if (githubActions) {
    stream.write(`::group::${check.label} — npm run ${check.script}\n`)
    const safeOutput = sanitizeGitHubActionsLog(output) || '(No command output.)\n'
    stream.write(safeOutput)
    if (!safeOutput.endsWith('\n')) stream.write('\n')
    stream.write('::endgroup::\n')
    return
  }

  stream.write(`\nOutput: ${check.label} (npm run ${check.script})\n`)
  stream.write(output || '(No command output.)\n')
  if (!output.endsWith('\n')) stream.write('\n')
}

/** @param {string} output */
function sanitizeGitHubActionsLog (output) {
  // Child-process output can contain GitHub workflow command syntax. Insert an
  // invisible character so the runner renders it as log text, not a command.
  return output.replace(/::|##\[/g, match => `\u200B${match}`)
}

function createLiveReporter (options) {
  const { stream } = options
  const color = options.color ?? supportsColor(stream)
  const now = options.now ?? (() => performance.now())
  const refreshIntervalMs = options.refreshIntervalMs ?? 125
  const entries = new Map()
  let timer
  let hasRows = false
  let runningCount = 0
  let cursorHidden = false

  const write = line => stream.write(`${line}\n`)
  const status = (value, state) => style(value, state, color)
  const hideCursor = () => {
    if (cursorHidden) return
    stream.write('\u001B[?25l')
    cursorHidden = true
  }
  const showCursor = () => {
    if (!cursorHidden) return
    stream.write('\u001B[?25h')
    cursorHidden = false
  }
  const redraw = () => {
    if (!hasRows) return
    for (const entry of entries.values()) {
      if (entry.state === 'running') redrawEntry(entry)
    }
  }
  const redrawEntry = entry => {
    const row = [...entries.keys()].indexOf(entry.check.id)
    if (row < 0 || !hasRows) return
    const distance = entries.size - row
    const line = formatLiveLine(entry, now(), status)
    const padding = ' '.repeat(Math.max(0, (entry.visibleLength ?? 0) - visibleLength(line)))
    entry.visibleLength = visibleLength(line)
    stream.write(`\u001B7\u001B[${distance}A\r${line}${padding}\u001B8`)
  }
  const startTimer = () => {
    if (timer || options.autoRefresh === false) return
    timer = setInterval(redraw, refreshIntervalMs)
    timer.unref?.()
  }
  const stopTimer = () => {
    if (!timer) return
    clearInterval(timer)
    timer = undefined
  }
  const update = check => {
    const entry = entries.get(check.id)
    if (!entry) return
    entry.check = check
    entry.state = check.state
    redrawEntry(entry)
  }

  return {
    queued: checks => {
      for (const check of checks) entries.set(check.id, { check, state: 'queued' })
      hideCursor()
      for (const entry of entries.values()) {
        const line = formatLiveLine(entry, now(), status)
        entry.visibleLength = visibleLength(line)
        write(line)
      }
      hasRows = true
    },
    started: check => {
      runningCount += 1
      update(check)
      startTimer()
    },
    finished: check => {
      runningCount -= 1
      update(check)
      if (runningCount === 0) stopTimer()
    },
    skipped: check => update(check),
    summary: checks => {
      stopTimer()
      showCursor()
      const counts = checks.reduce((summary, check) => ({ ...summary, [check.state]: (summary[check.state] ?? 0) + 1 }), {})
      const startedAt = Math.min(...checks.map(check => check.startedAt ?? Infinity))
      const completedAt = Math.max(...checks.map(check => (check.startedAt ?? 0) + (check.durationMs ?? 0)))
      const durationMs = Number.isFinite(startedAt) ? completedAt - startedAt : 0
      write('')
      write(`${status('Quality', counts.failed ? 'red' : 'green')}: ${counts.passed ?? 0} passed, ${counts.failed ?? 0} failed, ${counts.skipped ?? 0} skipped in ${formatDuration(durationMs)}`)
    },
    failure: (check, output) => {
      write('')
      write(`${status(`FAIL: ${check.label}`, 'red')} (${check.execution?.signal ? `signal ${check.execution.signal}` : `exit ${check.execution?.exitCode ?? 1}`})`)
      write(`Command: npm run ${check.script}`)
      if (check.execution?.error) write(String(check.execution.error.stack ?? check.execution.error))
      if (output.trim()) write(output.trimEnd())
    },
    close: () => {
      stopTimer()
      showCursor()
    },
    refresh: redraw,
  }
}

function formatLiveLine (entry, currentTime, status) {
  const { check, state } = entry
  const label = check.label.padEnd(22)
  const command = `npm run ${check.script}`
  if (state === 'queued') return `${status('WAIT', 'yellow')}            ${label} ${command}`
  if (state === 'skipped') return `${status('SKIP', 'yellow')}            ${label} ${check.reason}`
  if (state === 'running') {
    const elapsed = currentTime - check.startedAt
    const percent = estimateProgress(check.id, elapsed)
    const spinner = ['◐', '◓', '◑', '◒'][Math.floor(currentTime / 125) % 4]
    return `${status('RUN ', 'cyan')}  ${spinner} ~${String(percent).padStart(2)}%  ${label} ${command}  ${formatDuration(elapsed)}`
  }
  const passed = state === 'passed'
  return `${status(passed ? 'PASS' : 'FAIL', passed ? 'green' : 'red')}  ${passed ? '✓' : '✗'} 100%  ${label} ${command}  ${formatDuration(check.durationMs)}`
}

function estimateProgress (checkId, elapsedMs) {
  const expected = expectedDurationMs[checkId] ?? 15000
  return Math.min(99, Math.floor((elapsedMs / expected) * 100))
}

function visibleLength (value) {
  return String(value).replace(ansiEscapePattern, '').length
}

export function formatDuration (durationMs) {
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`
  return `${(durationMs / 1000).toFixed(1)}s`
}

/** @param {QualityCheck} check @param {string} output @param {{ githubActions?: boolean }} [options] */
export function failureOutput (check, output, options = {}) {
  const githubActions = options.githubActions ?? false
  const failureSection = /(?:^|\r?\n)(?:✖\s*)?failing tests:\r?\n/i.exec(output)
  const relevantOutput = check.id === 'test' && failureSection ? output.slice(failureSection.index).trimStart() : output
  return githubActions ? sanitizeGitHubActionsLog(relevantOutput) : relevantOutput
}

/** @param {NodeJS.WriteStream} stream */
export function supportsColor (stream) {
  return Boolean(stream?.isTTY) && !Object.hasOwn(process.env, 'NO_COLOR') && process.env.TERM !== 'dumb'
}

function supportsLiveOutput (stream, term = process.env.TERM) {
  return Boolean(stream?.isTTY) && typeof stream.write === 'function' && term !== 'dumb'
}

function style (value, kind, enabled) {
  if (!enabled) return value
  const codes = { red: '31', green: '32', yellow: '33', cyan: '36' }
  return `\u001B[${codes[kind]}m${value}\u001B[0m`
}

/** @param {Array<QualityCheck>} checks */
function validateChecks (checks) {
  const ids = new Set()
  for (const check of checks) {
    if (ids.has(check.id)) throw new Error(`Duplicate quality check ID: ${check.id}`)
    ids.add(check.id)
  }
  for (const check of checks) {
    for (const dependency of [...(check.after ?? []), ...(check.requiresSuccess ?? [])]) {
      if (!ids.has(dependency)) throw new Error(`Unknown dependency "${dependency}" for quality check "${check.id}".`)
    }
    for (const dependency of check.requiresSuccess ?? []) {
      if (!(check.after ?? []).includes(dependency)) throw new Error(`Successful dependency "${dependency}" for quality check "${check.id}" must also be ordered.`)
    }
  }
}

async function runCli () {
  const verbose = process.argv.slice(2).includes('--verbose')
  const persistedLogDirectory = process.env.QUALITY_LOG_DIR
  const logDirectory = persistedLogDirectory
    ? path.resolve(root, persistedLogDirectory)
    : await import('node:fs/promises').then(({ mkdtemp }) => mkdtemp(path.join(os.tmpdir(), 'agents-quality-')))
  if (persistedLogDirectory) await mkdir(logDirectory, { recursive: true })

  const runner = createNpmCheckRunner({ directory: logDirectory })
  const reporter = createReporter()
  let interrupted = false
  const interrupt = () => {
    if (interrupted) return
    interrupted = true
    process.stdout.write('\nQuality interrupted; stopping running checks.\n')
    runner.cancel()
  }
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', interrupt)

  try {
    const checks = await runQualityChecks(qualityChecks, { isCancelled: () => interrupted, runCheck: runner.run, reporter })
    reporter.summary(checks)
    const githubActions = process.env.GITHUB_ACTIONS === 'true'
    const outputs = new Map(await Promise.all(checks.map(async check => [
      check.id,
      check.execution?.logPath ? await readFile(check.execution.logPath, 'utf8') : '',
    ])))
    for (const check of checks) {
      reportCheckOutput(check, outputs.get(check.id), {
        githubActions,
        verbose,
      })
    }
    for (const check of checks.filter(check => check.state === 'failed')) {
      reporter.failure(check, failureOutput(check, outputs.get(check.id) ?? '', { githubActions }))
    }
    process.exitCode = interrupted ? 130 : checks.some(check => check.state === 'failed') ? 1 : 0
  } finally {
    reporter.close?.()
    process.removeListener('SIGINT', interrupt)
    process.removeListener('SIGTERM', interrupt)
    if (!persistedLogDirectory) {
      await rm(logDirectory, { force: true, maxRetries: 3, recursive: true, retryDelay: 100 }).catch(() => {})
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli()
}

/**
 * @typedef {{ id: string, label: string, script: string, after?: string[], requiresSuccess?: string[] }} QualityCheck
 * @typedef {{ exitCode: number, logPath?: string, signal?: NodeJS.Signals | null, error?: unknown }} CheckExecution
 * @typedef {{ started: (check: unknown) => void, finished: (check: unknown) => void, skipped: (check: unknown) => void, summary: (checks: unknown[]) => void, failure: (check: unknown, output: string) => void }} QualityReporter
 */
