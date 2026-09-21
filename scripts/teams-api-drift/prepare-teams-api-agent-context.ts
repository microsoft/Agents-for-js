/**
 * Builds the bounded, redacted context supplied to the advisory AI report generator.
 * Includes deterministic artifacts and only source files relevant to actionable findings.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = 'packages/agents-hosting-extensions-msteams'
const defaultArtifactDirectory = 'artifacts/teams-api-drift'

interface Finding {
  id: string
  classification: 'blocking' | 'required' | 'review' | 'no-action'
  capability?: string
  affectedFiles: string[]
}

interface FindingsResult {
  schemaVersion: 1
  dependency: string
  findings: Finding[]
}

interface SourceSlice {
  path: string
  content: string
  truncated: boolean
}

interface AgentContext {
  schemaVersion: 1
  package: '@microsoft/agents-hosting-extensions-msteams'
  dependency: '@microsoft/teams.api'
  authoritativeArtifacts: {
    findings: unknown
    usageManifest: unknown
    capabilitiesYaml: string
    deterministicReport: string
    testSummary?: unknown
    publicApiReport?: unknown
  }
  relevantSourceFiles: SourceSlice[]
  omittedSourceFiles: string[]
}

interface Settings {
  findings: string
  usageManifest: string
  capabilities: string
  deterministicReport: string
  testSummary?: string
  publicApiReport?: string
  output: string
  help: boolean
}

const help = `Usage:
  npm run prepare:teams-api-agent-report -- [--findings <file>] [--usage-manifest <file>] [--capabilities <file>] [--deterministic-report <file>] [--test-summary <file>] [--public-api-report <file>] [--output <file-or-directory>]

Builds the bounded context for an external AI report. Only source files named by
actionable findings under ${packageRoot}/src are included; no environment or
repository-wide content is collected.
`

function parseSettings (args: string[]): Settings {
  const settings: Settings = {
    findings: join(defaultArtifactDirectory, 'findings.json'),
    usageManifest: join(packageRoot, 'teams-api-usage-manifest.json'),
    capabilities: join(packageRoot, 'config/teams-capabilities.yaml'),
    deterministicReport: join(defaultArtifactDirectory, 'deterministic-report.md'),
    output: join(defaultArtifactDirectory, 'agent-context.json'),
    help: false
  }
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--help' || argument === '-h') return { ...settings, help: true }
    if (argument === '--findings' || argument === '--usage-manifest' || argument === '--capabilities' || argument === '--deterministic-report' || argument === '--test-summary' || argument === '--public-api-report' || argument === '--output' || argument === '-o') {
      const value = args[++index]
      if (!value) throw new Error(`${argument} requires a file path.`)
      if (argument === '--findings') settings.findings = value
      else if (argument === '--usage-manifest') settings.usageManifest = value
      else if (argument === '--capabilities') settings.capabilities = value
      else if (argument === '--deterministic-report') settings.deterministicReport = value
      else if (argument === '--test-summary') settings.testSummary = value
      else if (argument === '--public-api-report') settings.publicApiReport = value
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

function readJson (filePath: string): unknown {
  return JSON.parse(readText(filePath))
}

function redactSource (content: string): string {
  return content
    .replace(/(authorization\s*[:=]\s*['"`]?)(?:bearer\s+)?[^'"`\s,}]+/gi, '$1[REDACTED]')
    .replace(/((?:clientSecret|apiKey|password|token)\s*[:=]\s*['"`])[^'"`]+/gi, '$1[REDACTED]')
}

export function selectRelevantSourceFiles (findings: FindingsResult, sourceRoot: string = packageRoot): { sourceFiles: SourceSlice[], omittedFiles: string[] } {
  const packageSourceRoot = resolve(sourceRoot, 'src')
  const selectedPaths = [...new Set(findings.findings
    .filter(finding => finding.classification !== 'no-action')
    .flatMap(finding => finding.affectedFiles)
    .filter(path => path.replace(/\\/g, '/').startsWith('src/')))].sort()
  const sourceFiles: SourceSlice[] = []
  const omittedFiles: string[] = []

  for (const sourcePath of selectedPaths) {
    const fullPath = resolve(sourceRoot, sourcePath)
    const containedPath = relative(packageSourceRoot, fullPath)
    if (containedPath.startsWith('..') || !existsSync(fullPath)) {
      omittedFiles.push(sourcePath)
      continue
    }
    const content = redactSource(readFileSync(fullPath, 'utf8'))
    const maximumLength = 12000
    sourceFiles.push({
      path: sourcePath.replace(/\\/g, '/'),
      content: content.slice(0, maximumLength),
      truncated: content.length > maximumLength
    })
  }

  return { sourceFiles, omittedFiles }
}

function outputPathFor (destination: string): string {
  const fullPath = resolve(destination)
  return extname(fullPath).toLowerCase() === '.json' ? fullPath : join(fullPath, 'agent-context.json')
}

function main (): void {
  const settings = parseSettings(process.argv.slice(2))
  if (settings.help) {
    console.log(help)
    return
  }

  const findings = readJson(settings.findings) as FindingsResult
  if (findings.schemaVersion !== 1 || findings.dependency !== '@microsoft/teams.api') {
    throw new Error('Findings must be a schemaVersion 1 result for @microsoft/teams.api.')
  }
  const selected = selectRelevantSourceFiles(findings)
  const context: AgentContext = {
    schemaVersion: 1,
    package: '@microsoft/agents-hosting-extensions-msteams',
    dependency: '@microsoft/teams.api',
    authoritativeArtifacts: {
      findings,
      usageManifest: readJson(settings.usageManifest),
      capabilitiesYaml: readText(settings.capabilities),
      deterministicReport: readText(settings.deterministicReport),
      ...(settings.testSummary && { testSummary: readJson(settings.testSummary) }),
      ...(settings.publicApiReport && { publicApiReport: readJson(settings.publicApiReport) })
    },
    relevantSourceFiles: selected.sourceFiles,
    omittedSourceFiles: selected.omittedFiles
  }
  const outputPath = outputPathFor(settings.output)
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(context, undefined, 2)}\n`)
  console.log(`Wrote agent context to ${relative(process.cwd(), outputPath) || basename(outputPath)} (${context.relevantSourceFiles.length} source file(s)).`)
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined
if (invokedPath === fileURLToPath(import.meta.url)) main()
