/**
 * Intersects an upstream API delta with the extension's dependency usage manifest.
 * Produces deterministic compatibility findings and optional public-API exposure context.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { parse } from 'yaml'

const dependency = '@microsoft/teams.api'
const packageRoot = 'packages/agents-hosting-extensions-msteams'
const defaultManifestPath = join(packageRoot, 'teams-api-usage-manifest.json')
const defaultComparisonPath = 'artifacts/teams-api-drift/raw-api-diff.json'
const defaultCapabilitiesPath = join(packageRoot, 'config/teams-capabilities.yaml')

type Classification = 'blocking' | 'required' | 'review' | 'no-action'
type Exposure = 'internal-only' | 'publicly-exposed' | 're-exported' | 'runtime-used' | 'type-only' | 'unknown'
type FindingCategory = 'feature-review' | 'internal-opportunity' | 'maintainer-decision'
type AdoptionPolicy = 'strict-compatibility' | 'review-new-members' | 'advisory-only'

interface Usage {
  upstreamSymbol: string
  usage: string
  usageKinds?: string[]
  exposure?: Exposure
  methodsCalled?: string[]
  propertiesRead?: string[]
  propertiesValidated?: string[]
  propertiesWritten?: string[]
  files: string[]
}

interface UsageManifest {
  dependency: string
  usages: Usage[]
}

interface ApiChange {
  id: string
  kind: string
  symbol: string
  member?: string
  before?: string
  after?: string
  compatibility: 'breaking' | 'non-breaking' | 'potentially-breaking' | 'unknown'
  evidence: string[]
}

interface ComparisonResult {
  schemaVersion: number
  dependency: string
  fromVersion: string
  toVersion: string
  changes: ApiChange[]
}

interface Settings {
  comparison: string
  manifest: string
  capabilities: string
  publicApiReport?: string
  output?: string
  failOnDrift: boolean
  help: boolean
}

interface Finding {
  id: string
  source: 'api-diff' | 'public-api'
  classification: Classification
  category?: FindingCategory
  kind: string
  upstreamSymbol: string
  member?: string
  capability?: string
  usageKinds: string[]
  exposure: Exposure
  affectedFiles: string[]
  before?: string
  after?: string
  evidence: string[]
  recommendedAction: string
}

interface FindingsResult {
  schemaVersion: 1
  dependency: string
  fromVersion: string
  toVersion: string
  summary: Record<Classification, number>
  publicApi?: PublicApiFindingSummary
  findings: Finding[]
}

interface Capability {
  upstreamAreas: string[]
  adoptionPolicy: AdoptionPolicy
}

interface CapabilitiesDocument {
  schemaVersion: 1
  dependency: { package: string }
  capabilities: Record<string, Capability>
}

interface PublicApiSymbolChange {
  kind: 'public-symbol-added' | 'public-symbol-removed' | 'public-symbol-changed'
  symbol: string
  before?: string
  after?: string
  releaseDecision: 'patch' | 'minor' | 'major' | 'maintainer-review'
}

interface PublicApiTypeLeak {
  upstreamSymbol: string
  importKind: 'type-only' | 'runtime'
  publicExports: string[]
}

interface PublicApiReport {
  schemaVersion: 1
  package: string
  baseline: string
  entrypoint: string
  status: 'unchanged' | 'changed'
  releaseDecision: 'patch' | 'minor' | 'major' | 'maintainer-review'
  publicSymbolChanges: PublicApiSymbolChange[]
  upstreamTypeLeaks: PublicApiTypeLeak[]
}

interface PublicApiFindingSummary {
  status: 'unchanged' | 'changed'
  releaseDecision: PublicApiReport['releaseDecision']
  baseline: string
  entrypoint: string
  upstreamTypeLeaks: PublicApiTypeLeak[]
}

const help = `Usage:
  npm run detect:teams-api-drifts -- [--comparison <file>] [--manifest <file>] [--capabilities <file>] [--public-api-report <file>] [--output <file-or-directory>] [--fail-on-drift]

Joins a Stage 3 raw API delta with the Teams extension's dependency usage manifest.
The result classifies changes as blocking, required, review, or no-action and
includes the source files affected by every direct-use finding.

Defaults:
  comparison: ${defaultComparisonPath}
  manifest:   ${defaultManifestPath}
  capabilities: ${defaultCapabilitiesPath}

Examples:
  npm run compare:teams-api -- --from 2.0.13 --to 2.0.14 --output artifacts/teams-api-drift
  npm run detect:teams-api-drifts -- --comparison artifacts/teams-api-drift/raw-api-diff.json --output artifacts/teams-api-drift
  npm run detect:teams-api-drifts -- --public-api-report artifacts/teams-api-drift/public-api-report.json --output artifacts/teams-api-drift
`

function parseSettings (args: string[]): Settings {
  const settings: Settings = {
    comparison: defaultComparisonPath,
    manifest: defaultManifestPath,
    capabilities: defaultCapabilitiesPath,
    failOnDrift: false,
    help: false
  }

  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--help' || argument === '-h') return { ...settings, help: true }
    if (argument === '--fail-on-drift') {
      settings.failOnDrift = true
      continue
    }
    if (argument === '--comparison' || argument === '-c' || argument === '--manifest' || argument === '-m' || argument === '--capabilities' || argument === '--public-api-report' || argument === '--output' || argument === '-o') {
      const value = args[++index]
      if (!value) throw new Error(`${argument} requires a file path.`)
      if (argument === '--comparison' || argument === '-c') settings.comparison = value
      else if (argument === '--manifest' || argument === '-m') settings.manifest = value
      else if (argument === '--capabilities') settings.capabilities = value
      else if (argument === '--public-api-report') settings.publicApiReport = value
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

function readCapabilities (filePath: string): CapabilitiesDocument {
  const fullPath = resolve(filePath)
  if (!existsSync(fullPath)) throw new Error(`File not found: ${fullPath}`)
  const document = parse(readFileSync(fullPath, 'utf8')) as CapabilitiesDocument
  if (document?.schemaVersion !== 1 || document.dependency?.package !== dependency || !document.capabilities) {
    throw new Error(`Capabilities file must be a schemaVersion 1 ownership map for ${dependency}.`)
  }
  return document
}

function getExposure (usage: Usage): Exposure {
  if (usage.exposure) return usage.exposure
  if (usage.usage === 'instantiated') return 'runtime-used'
  if (usage.usage === 'type-reference') return 'type-only'
  return 'unknown'
}

function getUsageKinds (usage: Usage): string[] {
  return usage.usageKinds ?? [usage.usage]
}

function propertyPaths (usage: Usage): string[] {
  return [...(usage.propertiesRead ?? []), ...(usage.propertiesWritten ?? []), ...(usage.propertiesValidated ?? [])]
}

function propertyMatches (member: string | undefined, usage: Usage): boolean {
  if (!member) return false
  return propertyPaths(usage).some(path => path === member || path.replace(/\[\]/g, '').split('.')[0] === member)
}

function methodMatches (symbol: string, member: string | undefined, usage: Usage): boolean {
  if (!member) return false
  if (usage.upstreamSymbol === `${symbol}.${member}`) return true
  if (usage.upstreamSymbol !== symbol) return false
  return (usage.methodsCalled ?? []).some(method => method === member || method === `${symbol}.${member}`)
}

function isDirectlyRelevant (change: ApiChange, usages: Usage[]): Usage[] {
  return usages.filter(usage => {
    if (change.kind.startsWith('property-')) return usage.upstreamSymbol === change.symbol && propertyMatches(change.member, usage)
    if (change.kind.startsWith('method-') || change.kind.startsWith('overload-') || change.kind.startsWith('parameter-') || change.kind === 'return-type-changed') return methodMatches(change.symbol, change.member?.split('#')[0], usage)
    return usage.upstreamSymbol === change.symbol
  })
}

function upstreamAreasFor (change: ApiChange): string[] {
  if (change.symbol === 'Client') return ['clients']
  if (change.symbol.endsWith('Client')) return [`clients.${change.symbol.slice(0, -'Client'.length).toLowerCase()}`]
  if (change.symbol === 'ChannelData') return ['models.channel-data']
  if (change.symbol === 'ChannelInfo') return ['models.channel-data.channel-info']
  if (change.symbol === 'TeamInfo') return ['models.channel-data.team-info']
  if (change.symbol.startsWith('Meeting')) return ['models.meeting']
  if (change.symbol.startsWith('MessagingExtension')) return ['models.messaging-extension']
  if (change.symbol.startsWith('TaskModule')) return ['models.task-module']
  if (change.symbol.startsWith('File')) return ['models.file']
  if (change.symbol.startsWith('Config')) return ['models.config']
  return []
}

function capabilityFor (change: ApiChange, capabilities: CapabilitiesDocument): { name: string, policy: AdoptionPolicy } | undefined {
  const upstreamAreas = upstreamAreasFor(change)
  const matches = Object.entries(capabilities.capabilities).flatMap(([name, capability]) => capability.upstreamAreas
    .filter(area => upstreamAreas.some(candidate => candidate === area || candidate.startsWith(`${area}.`)))
    .map(area => ({ name, policy: capability.adoptionPolicy, area })))
  const match = matches.sort((left, right) => right.area.length - left.area.length || left.name.localeCompare(right.name))[0]
  return match && { name: match.name, policy: match.policy }
}

function isAdditiveChange (change: ApiChange): boolean {
  return change.kind === 'symbol-added' || change.kind === 'property-added' || change.kind === 'method-added' || change.kind === 'overload-added' || change.kind === 'enum-member-added'
}

function categoryFor (change: ApiChange, usages: Usage[], capability: { name: string, policy: AdoptionPolicy } | undefined): FindingCategory | undefined {
  if (!isAdditiveChange(change) || usages.length > 0 || !capability) return undefined
  if (capability.policy === 'review-new-members') return 'feature-review'
  if (capability.policy === 'strict-compatibility') return 'internal-opportunity'
  return undefined
}

function classify (change: ApiChange, usages: Usage[], publiclyExposed: boolean): Classification {
  if (usages.length === 0) return 'no-action'
  if (change.kind === 'symbol-removed' || change.kind === 'property-removed' || change.kind === 'method-removed' || change.kind === 'overload-removed') return 'blocking'
  if (change.kind === 'parameter-requiredness-changed' && change.after === 'true') return 'blocking'
  if (change.kind === 'property-type-changed' || change.kind === 'property-requiredness-changed' || change.kind === 'parameter-type-changed' || change.kind === 'parameter-removed' || change.kind === 'return-type-changed') {
    return publiclyExposed || usages.some(usage => getExposure(usage) === 'publicly-exposed' || getExposure(usage) === 're-exported') ? 'blocking' : 'required'
  }
  if (change.kind === 'export-path-changed' || change.kind === 'deprecation-added' || change.kind === 'release-tag-changed') return 'review'
  return 'review'
}

function recommendedAction (classification: Classification, change: ApiChange, category?: FindingCategory): string {
  if (classification === 'blocking') return `Adapt or remove the use of ${change.symbol}${change.member ? `.${change.member}` : ''} before adopting the candidate version.`
  if (classification === 'required') return 'Review the affected type contract and update the extension\'s mapping or nullability handling as needed.'
  if (category === 'feature-review') return 'Review this new upstream capability for adoption by the owning Teams extension feature.'
  if (category === 'internal-opportunity') return 'Consider whether this new upstream API can improve the extension\'s internal implementation.'
  if (classification === 'review') return 'Review the upstream change for behavioral or public API impact; no automatic feature adoption is implied.'
  return 'No direct usage intersects this API change.'
}

function createFindings (comparison: ComparisonResult, manifest: UsageManifest, capabilities: CapabilitiesDocument, publicApiReport?: PublicApiReport): FindingsResult {
  const publiclyExposedSymbols = new Set(publicApiReport?.upstreamTypeLeaks.map(leak => leak.upstreamSymbol) ?? [])
  const findings: Finding[] = comparison.changes.map(change => {
    const usages = isDirectlyRelevant(change, manifest.usages)
    const publiclyExposed = publiclyExposedSymbols.has(change.symbol)
    const capability = capabilityFor(change, capabilities)
    const category = categoryFor(change, usages, capability)
    const classification = category ? 'review' : classify(change, usages, publiclyExposed)
    return {
      id: change.id,
      source: 'api-diff' as const,
      classification,
      ...(category && { category }),
      kind: change.kind,
      upstreamSymbol: change.symbol,
      ...(change.member && { member: change.member }),
      ...(capability && { capability: capability.name }),
      usageKinds: [...new Set(usages.flatMap(getUsageKinds))],
      exposure: publiclyExposed
        ? 'publicly-exposed'
        : usages.reduce<Exposure>((strictest, usage) => {
          const exposure = getExposure(usage)
          return ['publicly-exposed', 're-exported'].includes(exposure) ? exposure : strictest
        }, usages[0] ? getExposure(usages[0]) : 'unknown'),
      affectedFiles: [...new Set(usages.flatMap(usage => usage.files))].sort(),
      ...(change.before !== undefined && { before: change.before }),
      ...(change.after !== undefined && { after: change.after }),
      evidence: [...new Set([...change.evidence, 'dependency-usage', ...(capability ? ['teams-capabilities'] : []), ...(publiclyExposed ? ['public-api-report'] : [])])],
      recommendedAction: recommendedAction(classification, change, category)
    }
  })
  if (publicApiReport?.status === 'changed') {
    for (const change of publicApiReport.publicSymbolChanges) {
      findings.push({
        id: `EXTAPI-${String(findings.length + 1).padStart(4, '0')}`,
        source: 'public-api',
        classification: 'review',
        kind: change.kind,
        upstreamSymbol: `${publicApiReport.package}.${change.symbol}`,
        usageKinds: ['public-api'],
        exposure: 'publicly-exposed',
        affectedFiles: [publicApiReport.entrypoint],
        ...(change.before !== undefined && { before: change.before }),
        ...(change.after !== undefined && { after: change.after }),
        evidence: ['public-api-report'],
        recommendedAction: `Review the ${change.releaseDecision} release impact before changing the public API baseline.`
      })
    }
  }
  const summary: Record<Classification, number> = { blocking: 0, required: 0, review: 0, 'no-action': 0 }
  for (const finding of findings) summary[finding.classification]++
  return {
    schemaVersion: 1,
    dependency,
    fromVersion: comparison.fromVersion,
    toVersion: comparison.toVersion,
    summary,
    ...(publicApiReport && {
      publicApi: {
        status: publicApiReport.status,
        releaseDecision: publicApiReport.releaseDecision,
        baseline: publicApiReport.baseline,
        entrypoint: publicApiReport.entrypoint,
        upstreamTypeLeaks: publicApiReport.upstreamTypeLeaks
      }
    }),
    findings
  }
}

function writeJson (destination: string, value: unknown): void {
  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(destination, `${JSON.stringify(value, undefined, 2)}\n`)
}

function writeOutput (result: FindingsResult, output: string): void {
  const destination = resolve(output)
  if (extname(destination).toLowerCase() === '.json') {
    writeJson(destination, result)
    console.log(`Wrote findings to ${relative(process.cwd(), destination) || basename(destination)}`)
    return
  }
  mkdirSync(destination, { recursive: true })
  const findingsPath = join(destination, 'findings.json')
  writeJson(findingsPath, result)
  console.log(`Wrote findings to ${relative(process.cwd(), findingsPath) || basename(findingsPath)}`)
}

function main (): void {
  const settings = parseSettings(process.argv.slice(2))
  if (settings.help) {
    console.log(help)
    return
  }

  const comparison = readJson<ComparisonResult>(settings.comparison)
  const manifest = readJson<UsageManifest>(settings.manifest)
  const capabilities = readCapabilities(settings.capabilities)
  const publicApiReport = settings.publicApiReport ? readJson<PublicApiReport>(settings.publicApiReport) : undefined
  if (comparison.schemaVersion !== 1 || !Array.isArray(comparison.changes)) {
    throw new Error('Comparison result must be a schemaVersion 1 raw API delta. Re-run compare:teams-api with --output <directory>.')
  }
  if (comparison.dependency !== dependency || manifest.dependency !== dependency) {
    throw new Error(`Both input files must describe ${dependency}.`)
  }
  if (publicApiReport && (publicApiReport.schemaVersion !== 1 || publicApiReport.package !== '@microsoft/agents-hosting-extensions-msteams')) {
    throw new Error('Public API report must be a schemaVersion 1 report for @microsoft/agents-hosting-extensions-msteams.')
  }

  const result = createFindings(comparison, manifest, capabilities, publicApiReport)
  console.log(`Classified ${result.findings.length} API change(s): ${JSON.stringify(result.summary)}`)
  if (settings.output) writeOutput(result, settings.output)
  if (settings.failOnDrift && (result.summary.blocking > 0 || result.summary.required > 0)) process.exitCode = 1
}

main()
