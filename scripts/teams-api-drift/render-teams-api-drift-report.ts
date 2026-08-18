/**
 * Renders a deterministic Markdown report from classified drift findings and check outcomes.
 * The report is the human-readable companion to the JSON artifacts emitted by earlier stages.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const dependency = '@microsoft/teams.api'
const defaultArtifactDirectory = 'artifacts/teams-api-drift'
const defaultFindingsPath = join(defaultArtifactDirectory, 'findings.json')
const defaultOutputPath = join(defaultArtifactDirectory, 'deterministic-report.md')

type Classification = 'blocking' | 'required' | 'review' | 'no-action'

export interface Finding {
  id: string
  source: 'api-diff' | 'public-api'
  classification: Classification
  category?: 'feature-review' | 'internal-opportunity' | 'maintainer-decision'
  kind: string
  upstreamSymbol: string
  member?: string
  capability?: string
  usageKinds: string[]
  exposure: string
  affectedFiles: string[]
  before?: string
  after?: string
  evidence: string[]
  recommendedAction: string
}

interface PublicApiTypeLeak {
  upstreamSymbol: string
  importKind: 'type-only' | 'runtime'
  publicExports: string[]
}

interface PublicApiSummary {
  status: 'unchanged' | 'changed'
  releaseDecision: 'patch' | 'minor' | 'major' | 'maintainer-review'
  baseline: string
  entrypoint: string
  upstreamTypeLeaks: PublicApiTypeLeak[]
}

export interface FindingsResult {
  schemaVersion: 1
  dependency: string
  fromVersion: string
  toVersion: string
  summary: Record<Classification, number>
  checks?: Record<string, string>
  publicApi?: PublicApiSummary
  findings: Finding[]
}

interface TestSummary {
  checks?: Record<string, string>
  build?: string
  contractTests?: string
  boundaryTests?: string
  publicApiCheck?: string
}

interface RenderContext {
  findingsPath: string
  outputPath: string
  artifactPaths: string[]
  checks: Record<string, string>
}

interface Settings {
  findings: string
  output: string
  testSummary?: string
  help: boolean
}

const help = `Usage:
  npm run render:teams-api-drift-report -- [--findings <file>] [--test-summary <file>] [--output <file-or-directory>]

Renders a deterministic Markdown report from Stage 4 findings. It does not call
an AI service and only links to local artifacts that already exist.

Defaults:
  findings: ${defaultFindingsPath}
  output:   ${defaultOutputPath}

Examples:
  npm run render:teams-api-drift-report
  npm run render:teams-api-drift-report -- --findings artifacts/teams-api-drift/findings.json --test-summary artifacts/teams-api-drift/test-summary.json
`

function parseSettings (args: string[]): Settings {
  const settings: Settings = { findings: defaultFindingsPath, output: defaultOutputPath, help: false }
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--help' || argument === '-h') return { ...settings, help: true }
    if (argument === '--findings' || argument === '-f' || argument === '--test-summary' || argument === '--output' || argument === '-o') {
      const value = args[++index]
      if (!value) throw new Error(`${argument} requires a file path.`)
      if (argument === '--findings' || argument === '-f') settings.findings = value
      else if (argument === '--test-summary') settings.testSummary = value
      else settings.output = value
      continue
    }
    throw new Error(`Unknown option: ${argument}`)
  }
  return settings
}

function readJson<T> (filePath: string): T {
  const fullPath = resolve(filePath)
  if (!existsSync(fullPath)) throw new Error(`File not found: ${fullPath}`)
  return JSON.parse(readFileSync(fullPath, 'utf8')) as T
}

function outputPathFor (destination: string): string {
  const fullPath = resolve(destination)
  return extname(fullPath).toLowerCase() === '.md' ? fullPath : join(fullPath, 'deterministic-report.md')
}

function markdownCell (value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ')
}

function displayPath (path: string): string {
  return path.replace(/\\/g, '/')
}

function artifactLink (path: string, outputPath: string): string {
  const target = relative(dirname(outputPath), resolve(path)) || basename(path)
  return `[${basename(path)}](${displayPath(target)})`
}

function sortedFindings (findings: Finding[]): Finding[] {
  return [...findings].sort((left, right) => {
    const capability = (left.capability ?? 'Unmapped').localeCompare(right.capability ?? 'Unmapped')
    return capability !== 0 ? capability : left.id.localeCompare(right.id)
  })
}

function renderFindings (findings: Finding[], emptyMessage: string): string[] {
  if (findings.length === 0) return [emptyMessage]
  const groups = new Map<string, Finding[]>()
  for (const finding of sortedFindings(findings)) {
    const capability = finding.capability ?? 'Unmapped'
    groups.set(capability, [...(groups.get(capability) ?? []), finding])
  }

  const lines: string[] = []
  for (const [capability, groupedFindings] of [...groups].sort(([left], [right]) => left.localeCompare(right))) {
    lines.push(`### ${capability}`)
    lines.push('')
    for (const finding of groupedFindings) {
      const symbol = `${finding.upstreamSymbol}${finding.member ? `.${finding.member}` : ''}`
      const files = finding.affectedFiles.length > 0 ? finding.affectedFiles.map(displayPath).join(', ') : 'No direct source file'
      lines.push(`- **${finding.id}** — \`${symbol}\` (${finding.kind}; ${finding.exposure}). ${finding.recommendedAction}`)
      lines.push(`  - Files: ${files}`)
      lines.push(`  - Evidence: ${finding.evidence.join(', ') || 'None recorded'}`)
    }
    lines.push('')
  }
  return lines
}

function checkEntries (checks: Record<string, string>): [string, string][] {
  return Object.entries(checks).sort(([left], [right]) => left.localeCompare(right))
}

function getSectionFindings (findings: Finding[], section: 'blocking' | 'required' | 'feature-review' | 'internal-opportunity' | 'maintainer-decision' | 'no-action'): Finding[] {
  if (section === 'feature-review') return findings.filter(finding => finding.category === 'feature-review')
  if (section === 'internal-opportunity') return findings.filter(finding => finding.category === 'internal-opportunity')
  if (section === 'maintainer-decision') return findings.filter(finding => finding.category === 'maintainer-decision' || (finding.classification === 'review' && !finding.category))
  return findings.filter(finding => finding.classification === section)
}

function summaryLine (summary: Record<Classification, number>): string {
  return `**${summary.blocking} blocking**, **${summary.required} required**, **${summary.review} review**, and **${summary['no-action']} no-action** finding(s).`
}

function suggestedChecklist (findings: FindingsResult): string[] {
  const actionable = findings.findings.filter(finding => finding.classification !== 'no-action')
  if (actionable.length === 0) return ['- [x] No direct compatibility or public API work is required for this comparison.']
  return actionable
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(finding => `- [ ] **${finding.id}** — ${finding.recommendedAction}`)
}

export function renderDeterministicReport (findings: FindingsResult, context: RenderContext): string {
  if (findings.schemaVersion !== 1) throw new Error('Findings must use schemaVersion 1.')
  if (findings.dependency !== dependency) throw new Error(`Findings must describe ${dependency}.`)
  const lines: string[] = [
    '# teams.api Deterministic Impact Report',
    '',
    'This report is generated from deterministic artifacts only; it contains no AI-generated conclusions.',
    '',
    '## Executive summary',
    '',
    `Compared ${dependency} **${findings.fromVersion}** to **${findings.toVersion}** for \`@microsoft/agents-hosting-extensions-msteams\`.`,
    '',
    summaryLine(findings.summary),
    '',
    '## Compared versions',
    '',
    '| Dependency | Baseline | Candidate |',
    '| --- | --- | --- |',
    `| ${dependency} | ${findings.fromVersion} | ${findings.toVersion} |`,
    '',
    '## Build and test status',
    ''
  ]

  const checks = checkEntries(context.checks)
  if (checks.length === 0) lines.push('No build or test summary was supplied.')
  else {
    lines.push('| Check | Status |')
    lines.push('| --- | --- |')
    for (const [name, status] of checks) lines.push(`| ${markdownCell(name)} | ${markdownCell(status)} |`)
  }

  const sections: Array<[string, Parameters<typeof getSectionFindings>[1], string]> = [
    ['Blocking compatibility issues', 'blocking', 'No blocking compatibility issues were detected.'],
    ['Required adaptations', 'required', 'No required adaptations were detected.'],
    ['Feature-review candidates', 'feature-review', 'No feature-review candidates were identified.'],
    ['Internal implementation opportunities', 'internal-opportunity', 'No internal implementation opportunities were identified.'],
    ['Maintainer decisions required', 'maintainer-decision', 'No maintainer decisions are required.'],
    ['No-action upstream changes', 'no-action', 'No no-action upstream changes were recorded.']
  ]
  for (const [title, section, emptyMessage] of sections) {
    lines.push('', `## ${title}`, '', ...renderFindings(getSectionFindings(findings.findings, section), emptyMessage))
  }

  lines.push('', '## Public API impact', '')
  if (!findings.publicApi) lines.push('Public API impact was not evaluated. Re-run detect:teams-api-drifts with --public-api-report <file> to include it.')
  else {
    lines.push(`Public API status: **${findings.publicApi.status}**. Suggested release decision: **${findings.publicApi.releaseDecision}**.`)
    lines.push('')
    if (findings.publicApi.upstreamTypeLeaks.length === 0) lines.push('No @microsoft/teams.api types leak through the public extension API.')
    else {
      lines.push('| Exposed upstream type | Import kind | Public extension exports |')
      lines.push('| --- | --- | --- |')
      for (const leak of findings.publicApi.upstreamTypeLeaks) {
        lines.push(`| ${markdownCell(leak.upstreamSymbol)} | ${leak.importKind} | ${markdownCell(leak.publicExports.join(', '))} |`)
      }
    }
  }

  lines.push('', '## Evidence and artifact links', '')
  lines.push(`- ${artifactLink(context.findingsPath, context.outputPath)} — classified findings.`)
  for (const artifactPath of [...new Set(context.artifactPaths)].sort()) {
    if (resolve(artifactPath) === resolve(context.findingsPath)) continue
    lines.push(`- ${artifactLink(artifactPath, context.outputPath)}`)
  }

  lines.push('', '## Suggested checklist', '', ...suggestedChecklist(findings), '')
  return lines.join('\n')
}

function collectChecks (findings: FindingsResult, testSummary?: TestSummary): Record<string, string> {
  return {
    ...(findings.checks ?? {}),
    ...(testSummary?.checks ?? {}),
    ...(testSummary?.build && { build: testSummary.build }),
    ...(testSummary?.contractTests && { contractTests: testSummary.contractTests }),
    ...(testSummary?.boundaryTests && { boundaryTests: testSummary.boundaryTests }),
    ...(testSummary?.publicApiCheck && { publicApiCheck: testSummary.publicApiCheck })
  }
}

function existingArtifacts (paths: Array<string | undefined>): string[] {
  return paths.filter((path): path is string => path !== undefined && existsSync(resolve(path)))
}

function main (): void {
  const settings = parseSettings(process.argv.slice(2))
  if (settings.help) {
    console.log(help)
    return
  }

  const findings = readJson<FindingsResult>(settings.findings)
  const testSummary = settings.testSummary ? readJson<TestSummary>(settings.testSummary) : undefined
  const outputPath = outputPathFor(settings.output)
  // Findings, raw API diff, and optional public API report are produced together.
  // The report may be written elsewhere, so its output directory is not an artifact location.
  const artifactDirectory = dirname(resolve(settings.findings))
  const report = renderDeterministicReport(findings, {
    findingsPath: settings.findings,
    outputPath,
    checks: collectChecks(findings, testSummary),
    artifactPaths: existingArtifacts([
      settings.testSummary,
      join(artifactDirectory, 'raw-api-diff.json'),
      join(artifactDirectory, 'public-api-report.json'),
      'packages/agents-hosting-extensions-msteams/teams-api-usage-manifest.json'
    ])
  })
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, report)
  console.log(`Wrote deterministic report to ${relative(process.cwd(), outputPath) || basename(outputPath)}`)
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined
if (invokedPath === fileURLToPath(import.meta.url)) main()
