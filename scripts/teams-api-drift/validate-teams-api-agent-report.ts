/**
 * Validates an externally generated advisory report against deterministic findings.
 * Rejects missing mandatory IDs, unknown IDs, malformed sections, and unattributed actions.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultArtifactDirectory = 'artifacts/teams-api-drift'
const requiredSections = [
  'Summary',
  'Compatibility breaks',
  'Required adaptations',
  'Feature-review candidates',
  'Internal implementation opportunities',
  'Maintainer decisions',
  'No action',
  'Suggested implementation issues',
  'Validation checklist'
]

interface Finding {
  id: string
  classification: 'blocking' | 'required' | 'review' | 'no-action'
}

interface FindingsResult {
  schemaVersion: 1
  dependency: string
  findings: Finding[]
}

export interface AgentReportValidation {
  schemaVersion: 1
  valid: boolean
  referencedFindingIds: string[]
  missingMandatoryFindingIds: string[]
  unknownFindingIds: string[]
  errors: string[]
}

interface Settings {
  findings: string
  report: string
  output?: string
  help: boolean
}

const help = `Usage:
  npm run validate:teams-api-agent-report -- [--findings <file>] [--report <file>] [--output <file-or-directory>]

Validates an externally generated agent report against deterministic findings.
Blocking and required finding IDs must be present; unknown finding IDs and
unattributed action bullets are rejected.
`

function parseSettings (args: string[]): Settings {
  const settings: Settings = {
    findings: join(defaultArtifactDirectory, 'findings.json'),
    report: join(defaultArtifactDirectory, 'agent-report.md'),
    help: false
  }
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--help' || argument === '-h') return { ...settings, help: true }
    if (argument === '--findings' || argument === '--report' || argument === '--output' || argument === '-o') {
      const value = args[++index]
      if (!value) throw new Error(`${argument} requires a file path.`)
      if (argument === '--findings') settings.findings = value
      else if (argument === '--report') settings.report = value
      else settings.output = value
      continue
    }
    throw new Error(`Unknown option: ${argument}`)
  }
  return settings
}

function readText (filePath: string): string {
  const fullPath = resolve(filePath)
  if (!existsSync(fullPath)) throw new Error(`File not found: ${fullPath}`)
  return readFileSync(fullPath, 'utf8')
}

function actionSections (report: string): string[] {
  const names = ['Compatibility breaks', 'Required adaptations', 'Feature-review candidates', 'Internal implementation opportunities', 'Maintainer decisions', 'Suggested implementation issues']
  const normalized = report.replace(/\r\n/g, '\n')
  return names.flatMap(name => {
    const start = normalized.indexOf(`## ${name}\n`)
    if (start < 0) return []
    const contentStart = start + `## ${name}\n`.length
    const nextHeading = normalized.indexOf('\n## ', contentStart)
    return normalized.slice(contentStart, nextHeading < 0 ? undefined : nextHeading)
  })
}

export function validateAgentReport (report: string, findings: FindingsResult): AgentReportValidation {
  const errors: string[] = []
  const normalizedReport = report.replace(/\r\n/g, '\n')
  if (!normalizedReport.startsWith('# teams.api Impact Report\n')) errors.push('Report must start with "# teams.api Impact Report".')
  for (const section of requiredSections) {
    if (!new RegExp(`^## ${section}$`, 'm').test(normalizedReport)) errors.push(`Missing required section: ${section}.`)
  }
  const requiredSummarySentence = 'This is an advisory report; it does not make or authorize implementation decisions.'
  const summaryMatch = normalizedReport.match(/^## Summary\s*$(?:\n)([\s\S]*?)(?=\n## |\s*$)/m)
  const summaryContent = summaryMatch?.[1] ?? ''
  const firstSummaryLine = summaryContent.split('\n').map(line => line.trim()).find(line => line.length > 0)
  if (firstSummaryLine !== requiredSummarySentence) {
    errors.push(`Summary section must start with: "${requiredSummarySentence}".`)
  }

  const knownIds = new Set(findings.findings.map(finding => finding.id))
  const referencedFindingIds = [...new Set(report.match(/\b(?:TSAPI|EXTAPI)-[A-Za-z0-9-]+\b/g) ?? [])].sort()
  const unknownFindingIds = referencedFindingIds.filter(id => !knownIds.has(id))
  if (unknownFindingIds.length > 0) errors.push(`Unknown finding ID(s): ${unknownFindingIds.join(', ')}.`)

  const missingMandatoryFindingIds = findings.findings
    .filter(finding => finding.classification === 'blocking' || finding.classification === 'required')
    .map(finding => finding.id)
    .filter(id => !referencedFindingIds.includes(id))
    .sort()
  if (missingMandatoryFindingIds.length > 0) errors.push(`Missing blocking or required finding ID(s): ${missingMandatoryFindingIds.join(', ')}.`)

  for (const section of actionSections(report)) {
    for (const line of section.split(/\r?\n/).filter(line => /^[-*+] /.test(line))) {
      if (!/\b(?:TSAPI|EXTAPI)-[A-Za-z0-9-]+\b/.test(line) && !/^- No /i.test(line)) {
        errors.push(`Action item is not tied to a finding ID: ${line}`)
      }
    }
  }

  return {
    schemaVersion: 1,
    valid: errors.length === 0,
    referencedFindingIds,
    missingMandatoryFindingIds,
    unknownFindingIds,
    errors
  }
}

function outputPathFor (destination: string): string {
  const fullPath = resolve(destination)
  return extname(fullPath).toLowerCase() === '.json' ? fullPath : join(fullPath, 'agent-report-validation.json')
}

function main (): void {
  const settings = parseSettings(process.argv.slice(2))
  if (settings.help) {
    console.log(help)
    return
  }
  const findings = JSON.parse(readText(settings.findings)) as FindingsResult
  if (findings.schemaVersion !== 1 || findings.dependency !== '@microsoft/teams.api') throw new Error('Findings must be a schemaVersion 1 result for @microsoft/teams.api.')
  const validation = validateAgentReport(readText(settings.report), findings)
  console.log(validation.valid ? 'Agent report validation passed.' : `Agent report validation failed: ${validation.errors.join(' ')}`)
  if (settings.output) {
    const outputPath = outputPathFor(settings.output)
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, `${JSON.stringify(validation, undefined, 2)}\n`)
    console.log(`Wrote agent report validation to ${relative(process.cwd(), outputPath) || basename(outputPath)}`)
  }
  if (!validation.valid) process.exitCode = 1
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined
if (invokedPath === fileURLToPath(import.meta.url)) main()
