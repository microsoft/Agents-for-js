import fs from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { Extractor, ExtractorConfig } from '@microsoft/api-extractor'
import { compareDeclarations, reportSource } from './analysis.mjs'
import { safeFile } from '../shared.mjs'

/** A separate process keeps compiler work parallel and extractor logs off the live terminal. */
export function analyzePackage ({ root, task, directory }) {
  const result = analyzeComparison({ root, task, directory })

  if (task.reference) {
    try {
      result.reference = analyzeComparison({
        root,
        task: task.reference,
        directory: path.join(directory, 'reference'),
        extractedReports: result.reports
      })
    } catch (error) {
      result.reference = {
        name: task.name,
        findings: [],
        reports: result.reports,
        error: error.message
      }
    }
  }

  return result
}

function analyzeComparison ({ root, task, directory, extractedReports }) {
  const result = {
    name: task.name,
    findings: [],
    reports: {},
    diagnostics: [],
    baselineChanged: false
  }

  // A stale working inventory may contain a package absent from both comparison sides.
  if (!task.current && !task.baseline) {
    return result
  }

  if (!task.current) {
    result.baselineChanged = true
    result.findings.push({
      kind: 'breaking',
      code: 'package.removed',
      symbol: task.name,
      message: 'The published package was removed. Existing imports can no longer resolve.',
      before: JSON.stringify({ entries: task.baseline.entries, reports: task.reports }, null, 2)
    })

    return result
  }

  if (task.current.unsupported.length) {
    throw new Error(task.current.unsupported.join('\n'))
  }

  const packageRoot = safeFile(root, task.current.directory)
  const oldEntries = task.baseline?.entries ?? {}
  const keys = new Set([...Object.keys(oldEntries), ...Object.keys(task.current.entries)])

  for (const key of keys) {
    const current = task.current.entries[key]
    const old = oldEntries[key]

    if (!current) {
      result.baselineChanged = true
      result.findings.push({
        kind: 'breaking',
        code: 'entry.removed',
        symbol: key,
        entry: key,
        message:
          'The public entry point or type condition was removed. Existing imports may no longer resolve.',
        before: task.reports[key] ?? JSON.stringify(old)
      })
      continue
    }

    const declaration = safeFile(packageRoot, current.types)

    if (!fs.existsSync(declaration)) {
      throw new Error(
        `Missing declaration ${current.types}. Run npm run build before using --skip-build.`
      )
    }

    let report = extractedReports?.[current.report]

    if (report === undefined) {
      const output = path.join(directory, 'reports')

      fs.mkdirSync(output, { recursive: true })
      const config = ExtractorConfig.prepare({
        packageJsonFullPath: path.join(packageRoot, 'package.json'),
        configObjectFullPath: undefined,
        configObject: {
          projectFolder: packageRoot,
          mainEntryPointFilePath: declaration,
          compiler: { tsconfigFilePath: path.join(packageRoot, 'tsconfig.json') },
          apiReport: {
            enabled: true,
            reportFileName: current.report,
            reportFolder: output,
            reportTempFolder: output
          },
          docModel: { enabled: false },
          dtsRollup: { enabled: false },
          tsdocMetadata: { enabled: false },
          messages: { compilerMessageReporting: { default: { logLevel: 'error' } } }
        }
      })
      const extraction = Extractor.invoke(config, {
        localBuild: true,
        messageCallback: message => {
          if (message.logLevel === 'error' || message.logLevel === 'warning') {
            result.diagnostics.push({
              id: message.messageId,
              level: message.logLevel,
              text: message.text
            })
          }

          message.handled = true
        }
      })

      if (!extraction.succeeded || extraction.errorCount) {
        throw new Error(
          `API extraction failed for ${key}.\n${result.diagnostics.map(message => message.text).join('\n')}`
        )
      }

      report = fs.readFileSync(path.join(output, current.report), 'utf8')
    }

    result.reports[current.report] = report
    const before = task.reports[key]

    result.baselineChanged ||= before?.replaceAll('\r\n', '\n') !== report.replaceAll('\r\n', '\n')

    if (!old) {
      result.findings.push({
        kind: 'compatible',
        code: 'entry.added',
        symbol: key,
        entry: key,
        message: task.baseline
          ? 'New public entry point.'
          : 'New package; initial baseline required.'
      })
    } else if (before === undefined) {
      result.findings.push({
        kind: 'possible',
        code: 'baseline.missing',
        symbol: key,
        entry: key,
        message:
          'The expected baseline is missing. Establish the initial baseline explicitly with --update.'
      })
    } else {
      const findings = compareDeclarations(
        reportSource(before),
        reportSource(report),
        path.join(directory, `compare-${Object.keys(result.reports).length}`),
        declaration
      )

      result.findings.push(...findings.map(finding => ({ ...finding, entry: key })))
    }
  }

  if (task.baseline && !isDeepStrictEqual(task.baseline.dependencies, task.current.dependencies)) {
    result.baselineChanged = true
    result.findings.push({
      kind: 'possible',
      code: 'dependencies.changed',
      symbol: '<dependencies>',
      message:
        'Dependency declarations changed. Review dependency types exposed by the public API; old external types are not bundled in API reports.',
      before: JSON.stringify(task.baseline.dependencies, null, 2),
      after: JSON.stringify(task.current.dependencies, null, 2)
    })
  }

  return result
}

if (process.send) {
  process.once('message', input => {
    try {
      process.send({ result: analyzePackage(input) }, () => process.disconnect())
    } catch (error) {
      process.send({ error: error.message }, () => process.disconnect())
    }
  })
}
