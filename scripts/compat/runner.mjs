import fs from 'node:fs'
import path from 'node:path'
import { fork, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { fileURLToPath } from 'node:url'
import {
  npmInvocation,
  discoverPackages,
  loadBaseline,
  safeFile,
  schemaVersion
} from '../shared.mjs'
import { selectPackages, toolchain } from './config.mjs'
import { createReporter, summarize } from './reporter.mjs'
import { prepareArtifacts, writeReports, writeFailure } from './artifacts.mjs'

export function findingId (name, finding) {
  const data = [
    name,
    finding.entry,
    finding.code,
    finding.symbol,
    finding.message,
    finding.before,
    finding.after
  ]

  return createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 20)
}

export function exitCode (results, { update = false } = {}) {
  if (results.some(result => result.error || result.skipped)) {
    return 2
  }

  if (
    !update &&
    results.some(result => result.findings.some(finding => finding.code === 'baseline.missing'))
  ) {
    return 2
  }

  return !update && results.some(result => result.baselineChanged) ? 1 : 0
}

/** Freshness always compares the current API with working baselines, even with --base. */
function baselineNeedsUpdate (task, result, baseline) {
  const previous = baseline.packages.find(pkg => pkg.name === task.name)

  if (!task.current || !previous) {
    return !!(task.current || previous)
  }

  if (
    !isDeepStrictEqual(previous.entries, task.current.entries) ||
    !isDeepStrictEqual(previous.dependencies, task.current.dependencies)
  ) {
    return true
  }

  return Object.values(task.current.entries).some(entry => {
    const saved = baseline.read(`compat/baseline/${entry.report}`)

    return (
      saved?.replaceAll('\r\n', '\n') !== result.reports[entry.report]?.replaceAll('\r\n', '\n')
    )
  })
}

/** Bounded scheduling preserves display order while work completes independently. */
export async function analyzeAll (tasks, { concurrency, analyze, reporter, signal }) {
  const results = new Array(tasks.length)
  let next = 0
  const run = async () => {
    while (next < tasks.length && !signal?.aborted) {
      const index = next++
      const started = performance.now()

      reporter?.started(index)

      try {
        results[index] = await analyze(tasks[index], index)
      } catch (error) {
        results[index] = {
          name: tasks[index].name,
          findings: [],
          error: error.message,
          reports: {},
          baselineChanged: false
        }
      }

      results[index].durationMs = performance.now() - started
      reporter?.finished(index, results[index])
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, run))

  return tasks.map(
    (task, index) =>
      results[index] ?? {
        name: task.name,
        findings: [],
        skipped: true,
        reports: {},
        baselineChanged: false
      }
  )
}

function startWorker (input, signal) {
  return new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(new URL('./worker.mjs', import.meta.url)), [], {
      cwd: input.root,
      // Workers are plain JavaScript; do not inherit test loaders or debugger ports.
      execArgv: [],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
      env: { ...process.env, NO_COLOR: '1' }
    })
    let output = ''
    let message
    let stopped = false
    const collect = chunk => {
      output = `${output}${chunk}`.slice(-256 * 1024)
    }

    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    const abort = () => {
      stopped = true
      child.kill()
    }
    const timeout = setTimeout(abort, 5 * 60 * 1000)

    signal?.addEventListener('abort', abort, { once: true })
    child.once('error', reject)
    child.on('message', value => {
      message = value
    })
    child.once('close', code => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)

      if (stopped) {
        reject(
          new Error(
            signal?.aborted
              ? 'Analysis interrupted.'
              : 'Package analysis timed out after five minutes.'
          )
        )
      } else if (code !== 0 || !message) {
        reject(new Error(`Analysis process failed (${code}). ${output.trim()}`))
      } else if (message.error) {
        reject(new Error(message.error))
      } else {
        message.result.log = output.trim()
        resolve(message.result)
      }
    })
    child.send(input)

    if (signal?.aborted) {
      abort()
    }
  })
}

/** Stage all selected files first; roll back replacements if a write fails. */
export function updateBaselines (root, tasks, results) {
  if (exitCode(results, { update: true })) {
    throw new Error('Incomplete analysis prevents baseline updates.')
  }

  const directory = path.join(root, 'compat/baseline')

  fs.mkdirSync(directory, { recursive: true })
  const local = loadBaseline(root)
  const selected = new Set(tasks.map(task => task.name))
  const packages = [
    ...local.packages.filter(pkg => !selected.has(pkg.name)),
    ...tasks.map(task => task.current).filter(Boolean)
  ].sort((a, b) => a.name.localeCompare(b.name))
  const inventory = { schemaVersion, toolchain, packages }
  const retainedReports = new Set(
    packages.flatMap(pkg => Object.values(pkg.entries).map(entry => entry.report))
  )
  const writes = new Map()
  const removed = new Set()

  for (const task of tasks) {
    const result = results.find(result => result.name === task.name)

    for (const [file, content] of Object.entries(result.reports)) {
      writes.set(safeFile(directory, file), content)
    }

    const previous = local.packages.find(pkg => pkg.name === task.name)

    for (const entry of Object.values(previous?.entries ?? {})) {
      if (!retainedReports.has(entry.report)) {
        removed.add(safeFile(directory, entry.report))
      }
    }
  }

  writes.set(path.join(directory, 'inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`)
  const backup = new Map(
    [...new Set([...writes.keys(), ...removed])].map(file => [
      file,
      fs.existsSync(file) ? fs.readFileSync(file) : undefined
    ])
  )
  const staged = new Map()
  const changed = []

  try {
    for (const [file, contents] of writes) {
      const pending = `${file}.${randomUUID()}.pending`

      staged.set(file, pending)
      fs.writeFileSync(pending, contents)
    }

    for (const [file, pending] of staged) {
      fs.renameSync(pending, file)
      changed.push(file)
    }

    for (const file of removed) {
      if (writes.has(file)) {
        continue
      }

      fs.rmSync(file, { force: true })
      changed.push(file)
    }
  } catch (error) {
    for (const file of changed.reverse()) {
      const contents = backup.get(file)

      if (contents === undefined) {
        fs.rmSync(file, { force: true })
      } else {
        fs.writeFileSync(file, contents)
      }
    }

    throw error
  } finally {
    for (const pending of staged.values()) {
      fs.rmSync(pending, { force: true })
    }
  }

  return results.filter(result => result.baselineChanged).length
}

function build (root, signal, logFile) {
  const [command, args] = npmInvocation('build')

  return new Promise((resolve, reject) => {
    const log = fs.createWriteStream(logFile)
    const child = spawn(command, args, {
      cwd: root,
      windowsHide: true,
      shell: !process.env.npm_execpath && process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32'
    })

    child.stdout.pipe(log, { end: false })
    child.stderr.pipe(log, { end: false })
    const abort = () => {
      if (process.platform === 'win32' && child.pid) {
        spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
          windowsHide: true,
          stdio: 'ignore'
        })
      } else if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGTERM')
        } catch (error) {
          if (error.code !== 'ESRCH') {
            throw error
          }
        }
      }
    }

    signal.addEventListener('abort', abort, { once: true })
    child.once('error', error => {
      signal.removeEventListener('abort', abort)
      log.end()
      reject(error)
    })
    child.once('close', code => {
      signal.removeEventListener('abort', abort)
      log.end(() =>
        code === 0
          ? resolve()
          : reject(new Error('Build failed. See scripts/logs/compat/build.log.'))
      )
    })

    if (signal.aborted) {
      abort()
    }
  })
}

export async function runCompat (root, settings) {
  const generated = prepareArtifacts(root)

  try {
    return await executeCompat(root, settings, generated)
  } catch (error) {
    writeFailure(generated, error.message)
    throw error
  }
}

async function executeCompat (root, settings, generated) {
  const started = performance.now()
  const current = discoverPackages(root)
  const baseline = loadBaseline(root, settings.base)
  const workingBaseline = settings.base ? loadBaseline(root) : baseline
  const knownPackages = [
    ...baseline.packages,
    ...workingBaseline.packages.filter(
      pkg => !baseline.packages.some(previous => previous.name === pkg.name)
    )
  ]
  const tasks = selectPackages(current, knownPackages, settings.package)

  for (const task of tasks) {
    task.baseline = workingBaseline.packages.find(pkg => pkg.name === task.name)
    task.reports = Object.fromEntries(
      Object.entries(task.baseline?.entries ?? {}).map(([key, entry]) => [
        key,
        workingBaseline.read(`compat/baseline/${entry.report}`)
      ])
    )

    if (settings.base) {
      const previous = baseline.packages.find(pkg => pkg.name === task.name)

      task.reference = {
        name: task.name,
        current: task.current,
        baseline: previous,
        reports: Object.fromEntries(
          Object.entries(previous?.entries ?? {}).map(([key, entry]) => [
            key,
            baseline.read(`compat/baseline/${entry.report}`)
          ])
        )
      }
    }
  }

  const scratch = fs.mkdtempSync(path.join(generated, 'run-'))
  const controller = new AbortController()
  const interrupt = () => controller.abort()

  process.once('SIGINT', interrupt)
  process.once('SIGTERM', interrupt)
  let reporter

  try {
    if (!settings.skipBuild) {
      process.stdout.write('Preparing declarations… (details: scripts/logs/compat/build.log)\n')
      await build(root, controller.signal, path.join(root, 'scripts/logs/compat/build.log'))
    }

    reporter = createReporter(tasks, { ...settings, root })
    const results = await analyzeAll(tasks, {
      concurrency: settings.concurrency,
      reporter,
      signal: controller.signal,
      analyze: async (task, index) => {
        const result = await startWorker(
          { root, task, directory: path.join(scratch, String(index)) },
          controller.signal
        )

        result.baselineChanged = baselineNeedsUpdate(task, result, workingBaseline)

        for (const finding of result.findings) {
          finding.id = findingId(task.name, finding)

          if (finding.code === 'baseline.missing' && !settings.update) {
            result.error = finding.message
          }
        }

        const order = { breaking: 0, possible: 1, informational: 2, compatible: 3 }

        result.findings.sort(
          (a, b) => order[a.kind] - order[b.kind] || a.symbol.localeCompare(b.symbol)
        )

        for (const finding of result.reference?.findings ?? []) {
          finding.id = findingId(task.name, finding)
        }

        return result
      }
    })

    writeReports(generated, tasks, results, { snapshotBaseline: !!settings.update })

    if (settings.base) {
      const references = results.flatMap(result => (result.reference ? [result.reference] : []))

      writeReports(
        generated,
        tasks.map(task => task.reference),
        references,
        { snapshotBaseline: true, baselineDirectory: 'baseline-reference/git' }
      )

      for (const result of results) {
        if (!result.reference) {
          continue
        }

        const { findings, comparisons, breaks, error } = result.reference

        result.reference = { findings, comparisons, breaks, error }
      }
    }

    let updated = 0
    let updateError
    const code = exitCode(results, { update: settings.update })
    const updateBlocked = settings.update && code !== 0

    if (settings.update && !controller.signal.aborted && code === 0) {
      try {
        updated = updateBaselines(root, tasks, results)
      } catch (error) {
        updateError = error.message
      }
    }

    const updateCompleted =
      settings.update && !controller.signal.aborted && code === 0 && !updateError
    const durationMs = performance.now() - started
    const report = {
      schemaVersion,
      comparison: workingBaseline.label,
      reference: settings.base
        ? { comparison: baseline.label, commit: baseline.commit }
        : undefined,
      toolchain,
      durationMs,
      summary: summarize(results),
      updated,
      updateCompleted,
      updateBlocked,
      updateError,
      results
    }

    fs.writeFileSync(path.join(generated, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
    reporter.finish(results, { durationMs, updated, updateCompleted, updateBlocked, updateError })

    return controller.signal.aborted ? 130 : updateError ? 2 : code
  } catch (error) {
    if (controller.signal.aborted) {
      writeFailure(
        generated,
        'Analysis interrupted; no complete compatibility result is available.'
      )

      return 130
    }

    throw error
  } finally {
    reporter?.close()
    process.removeListener('SIGINT', interrupt)
    process.removeListener('SIGTERM', interrupt)

    // This directory was allocated by this run, strictly inside compat/generated.
    if (path.dirname(scratch) === generated && path.basename(scratch).startsWith('run-')) {
      fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 3 })
    }
  }
}
