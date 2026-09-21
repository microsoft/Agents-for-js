/**
 * Records workflow build and verification outcomes in a deterministic JSON summary.
 * The report renderer consumes this summary to show which compatibility checks completed.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'

const defaultOutput = 'artifacts/teams-api-drift/test-summary.json'

interface Settings {
  output: string
  checks: Record<string, string>
  help: boolean
}

const help = `Usage:
  npm run write:teams-api-test-summary -- [--build <status>] [--usage-collection <status>] [--api-extraction <status>] [--api-comparison <status>] [--contract-tests <status>] [--boundary-tests <status>] [--public-api-check <status>] [--output <file-or-directory>]

Writes the deterministic build and test summary consumed by the drift report.
`

function parseSettings (args: string[]): Settings {
  const settings: Settings = { output: defaultOutput, checks: {}, help: false }
  const checkOptions: Record<string, string> = {
    '--build': 'build',
    '--usage-collection': 'usageCollection',
    '--api-extraction': 'apiExtraction',
    '--api-comparison': 'apiComparison',
    '--contract-tests': 'contractTests',
    '--boundary-tests': 'boundaryTests',
    '--public-api-check': 'publicApiCheck'
  }
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--help' || argument === '-h') return { ...settings, help: true }
    if (argument === '--output' || argument === '-o') {
      const value = args[++index]
      if (!value) throw new Error(`${argument} requires a file path.`)
      settings.output = value
      continue
    }
    const checkName = checkOptions[argument]
    if (!checkName) throw new Error(`Unknown option: ${argument}`)
    const status = args[++index]
    if (!status) throw new Error(`${argument} requires a status.`)
    settings.checks[checkName] = status
  }
  return settings
}

function outputPathFor (destination: string): string {
  const fullPath = resolve(destination)
  return extname(fullPath).toLowerCase() === '.json' ? fullPath : join(fullPath, 'test-summary.json')
}

function main (): void {
  const settings = parseSettings(process.argv.slice(2))
  if (settings.help) {
    console.log(help)
    return
  }
  const outputPath = outputPathFor(settings.output)
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 1, checks: settings.checks }, undefined, 2)}\n`)
  console.log(`Wrote test summary to ${relative(process.cwd(), outputPath) || basename(outputPath)}`)
}

main()
