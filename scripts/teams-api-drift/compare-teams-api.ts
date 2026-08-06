/**
 * Extracts normalized API models for baseline and candidate teams.api versions.
 * Writes the raw API delta and extractor artifacts consumed by the drift classifier.
 */
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { Extractor, ExtractorConfig } from '@microsoft/api-extractor'
import { createTwoFilesPatch, diffLines } from 'diff'
import ts from 'typescript'

const dependency = '@microsoft/teams.api'
const require = createRequire(import.meta.url)

type Compatibility = 'breaking' | 'non-breaking' | 'potentially-breaking' | 'unknown'

interface Settings {
  from?: string
  to?: string
  output?: string
  verbose: boolean
  help: boolean
}

interface ParameterModel {
  name: string
  optional: boolean
  type: string
}

interface SignatureModel {
  parameters: ParameterModel[]
  returnType: string
}

interface PropertyModel {
  optional: boolean
  type: string
}

interface SymbolModel {
  name: string
  kind: string
  properties: Record<string, PropertyModel>
  methods: Record<string, SignatureModel[]>
  constructors: SignatureModel[]
  enumMembers: string[]
  deprecated: boolean
  releaseTag?: string
  exportPath: string
}

interface ApiModel {
  schemaVersion: 1
  dependency: string
  version: string
  symbols: SymbolModel[]
}

interface ApiReport {
  version: string
  text: string
  model: ApiModel
}

interface ApiChange {
  id: string
  kind: string
  symbol: string
  member?: string
  before?: string
  after?: string
  compatibility: Compatibility
  evidence: ['normalized-api-model']
}

interface ComparisonResult {
  schemaVersion: 1
  dependency: string
  fromVersion: string
  toVersion: string
  apiExtractorVersion: string
  current: { version: string }
  candidate: { requested: string, version: string }
  changed: boolean
  changes: ApiChange[]
  addedLines: string[]
  removedLines: string[]
  diff: string
}

const help = `Usage:
  npm run compare:teams-api [--] [candidate-version] [--from <version>] [--to <version>] [--output <file-or-directory>] [--verbose]

Extracts normalized public API models for two ${dependency} versions and emits a
structured delta. Without --from, the installed version is the baseline. Without
a candidate or --to, the latest stable npm release is selected.

Examples:
  npm run compare:teams-api
  npm run compare:teams-api -- 2.0.14
  npm run compare:teams-api -- --from 2.0.12 --to 2.0.14 --output artifacts/teams-api-drift
  npm run compare:teams-api -- 2.0.14 --output result.json
`

function parseSettings (args: string[]): Settings {
  const positional: string[] = []
  const settings: Settings = { verbose: false, help: false }

  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--help' || argument === '-h') return { ...settings, help: true }
    if (argument === '--verbose' || argument === '-v') {
      settings.verbose = true
      continue
    }
    if (argument === '--from' || argument === '--to' || argument === '--output' || argument === '-o') {
      const value = args[++index]
      if (!value) throw new Error(`${argument} requires a value.`)
      if (argument === '--from') settings.from = value
      else if (argument === '--to') settings.to = value
      else settings.output = value
      continue
    }
    if (argument.startsWith('-')) throw new Error(`Unknown option: ${argument}`)
    positional.push(argument)
  }

  if (positional.length > 1) throw new Error('Specify at most one positional candidate version.')
  if (settings.to && positional[0]) throw new Error('Use either --to or a positional candidate version, not both.')
  settings.to ??= positional[0]
  return settings
}

function npmCommand (): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function runNpm (args: string[], workingDirectory?: string): string {
  const useWindowsCommandShell = process.platform === 'win32'
  const command = useWindowsCommandShell ? process.env.ComSpec ?? 'cmd.exe' : npmCommand()
  const commandArgs = useWindowsCommandShell ? ['/d', '/s', '/c', npmCommand(), ...args] : args
  return execFileSync(command, commandArgs, {
    cwd: workingDirectory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

function isStableVersion (version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version)
}

function isVersion (version: string): boolean {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)
}

function compareVersions (left: string, right: string): number {
  const leftParts = left.split('.').map(Number)
  const rightParts = right.split('.').map(Number)
  for (let index = 0; index < 3; index++) {
    const difference = leftParts[index] - rightParts[index]
    if (difference !== 0) return difference
  }
  return 0
}

function getLatestStableVersion (): string {
  const result = JSON.parse(runNpm(['view', dependency, 'versions', '--json'])) as string[] | string
  const versions = (Array.isArray(result) ? result : [result]).filter(isStableVersion)
  if (versions.length === 0) throw new Error(`No stable npm release was found for ${dependency}. Supply --to explicitly.`)
  return versions.sort(compareVersions).at(-1)!
}

function readPackageJson (packageRoot: string): { name: string, version: string, types?: string } {
  return JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as { name: string, version: string, types?: string }
}

function resolveInstalledPackageRoot (): string | undefined {
  const resolutionRoots = [
    process.cwd(),
    resolve(process.cwd(), 'packages/agents-hosting-extensions-msteams')
  ]

  for (const resolutionRoot of resolutionRoots) {
    try {
      return dirname(require.resolve(`${dependency}/package.json`, { paths: [resolutionRoot] }))
    } catch {
      // npm may install workspace dependencies below the consuming workspace instead of the repository root.
    }
  }

  return undefined
}

function resolveTypesEntryPoint (packageRoot: string, packageJson: { name: string, types?: string }): string {
  if (!packageJson.types) throw new Error(`${packageJson.name} does not declare a public types entry point.`)
  const entryPoint = resolve(packageRoot, packageJson.types)
  if (!entryPoint.startsWith(`${packageRoot}\\`) && !entryPoint.startsWith(`${packageRoot}/`)) {
    throw new Error(`${packageJson.name} types entry point resolves outside the package.`)
  }
  return entryPoint
}

function getSymbolKind (declaration: ts.Declaration): string {
  if (ts.isClassDeclaration(declaration)) return 'class'
  if (ts.isInterfaceDeclaration(declaration)) return 'interface'
  if (ts.isTypeAliasDeclaration(declaration)) return 'type'
  if (ts.isFunctionDeclaration(declaration)) return 'function'
  if (ts.isEnumDeclaration(declaration)) return 'enum'
  if (ts.isVariableDeclaration(declaration)) return 'variable'
  if (ts.isModuleDeclaration(declaration)) return 'namespace'
  return ts.SyntaxKind[declaration.kind]
}

function getReleaseTag (declaration: ts.Declaration): string | undefined {
  const text = declaration.getFullText()
  return ['public', 'beta', 'alpha', 'internal'].find(tag => new RegExp(`@${tag}\\b`).test(text))
}

function getPropertyModel (checker: ts.TypeChecker, symbol: ts.Symbol, fallback: ts.Node): PropertyModel {
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0] ?? fallback
  return {
    optional: Boolean(symbol.flags & ts.SymbolFlags.Optional),
    type: checker.typeToString(checker.getTypeOfSymbolAtLocation(symbol, declaration), declaration, ts.TypeFormatFlags.NoTruncation)
  }
}

function getSignatureModels (checker: ts.TypeChecker, signatures: readonly ts.Signature[], fallback: ts.Node): SignatureModel[] {
  return signatures.map(signature => {
    const declaration = signature.getDeclaration() ?? fallback
    return {
      parameters: signature.getParameters().map(parameter => getPropertyModel(checker, parameter, declaration)).map((parameter, index) => ({
        ...parameter,
        name: signature.getParameters()[index].getName()
      })),
      returnType: checker.typeToString(signature.getReturnType(), declaration, ts.TypeFormatFlags.NoTruncation)
    }
  }).sort((left, right) => stringifySignature(left).localeCompare(stringifySignature(right)))
}

function isMethodSymbol (symbol: ts.Symbol): boolean {
  return (symbol.declarations ?? []).some(declaration =>
    ts.isMethodDeclaration(declaration) || ts.isMethodSignature(declaration))
}

function isSyntheticSymbol (symbol: ts.Symbol): boolean {
  return symbol.getName().startsWith('__@')
}

function extractApiModel (packageRoot: string, version: string): ApiModel {
  const packageJson = readPackageJson(packageRoot)
  const entryPoint = resolveTypesEntryPoint(packageRoot, packageJson)
  const program = ts.createProgram([entryPoint], {
    skipLibCheck: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022
  })
  const checker = program.getTypeChecker()
  const entryPointFile = program.getSourceFile(entryPoint)
  if (!entryPointFile) throw new Error(`TypeScript could not load ${entryPoint}.`)
  const moduleSymbol = checker.getSymbolAtLocation(entryPointFile)
  if (!moduleSymbol) throw new Error(`TypeScript could not resolve the ${dependency} module symbol.`)

  const symbols = checker.getExportsOfModule(moduleSymbol).map(exportedSymbol => {
    const symbol = exportedSymbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(exportedSymbol)
      : exportedSymbol
    const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0]
    if (!declaration) throw new Error(`Could not resolve a declaration for ${exportedSymbol.getName()}.`)
    const declaredType = checker.getDeclaredTypeOfSymbol(symbol)
    const valueType = checker.getTypeOfSymbolAtLocation(symbol, declaration)
    const type = declaredType.getProperties().length > 0 || declaredType.getCallSignatures().length > 0 || declaredType.getConstructSignatures().length > 0
      ? declaredType
      : valueType
    const properties: Record<string, PropertyModel> = {}
    const methods: Record<string, SignatureModel[]> = {}
    for (const member of checker.getPropertiesOfType(type)) {
      if (isSyntheticSymbol(member)) continue
      if (isMethodSymbol(member)) {
        const memberDeclaration = member.valueDeclaration ?? member.declarations?.[0] ?? declaration
        methods[member.getName()] = getSignatureModels(checker, checker.getTypeOfSymbolAtLocation(member, memberDeclaration).getCallSignatures(), memberDeclaration)
      } else {
        properties[member.getName()] = getPropertyModel(checker, member, declaration)
      }
    }
    const enumMembers = ts.isEnumDeclaration(declaration)
      ? declaration.members.map(member => member.name.getText()).sort()
      : []
    const callSignatures = getSignatureModels(checker, type.getCallSignatures(), declaration)
    if (callSignatures.length > 0 && Object.keys(methods).length === 0) methods.$call = callSignatures

    return {
      name: exportedSymbol.getName(),
      kind: getSymbolKind(declaration),
      properties,
      methods,
      constructors: getSignatureModels(checker, type.getConstructSignatures(), declaration),
      enumMembers,
      deprecated: ts.getJSDocTags(declaration).some(tag => tag.tagName.text === 'deprecated'),
      releaseTag: getReleaseTag(declaration),
      exportPath: dependency
    }
  }).sort((left, right) => left.name.localeCompare(right.name))

  return { schemaVersion: 1, dependency, version, symbols }
}

function generateApiReport (packageRoot: string, workRoot: string): ApiReport {
  const packageJsonPath = join(packageRoot, 'package.json')
  const packageJson = readPackageJson(packageRoot)
  const reportDirectory = join(workRoot, packageJson.version)
  const reportTempDirectory = join(reportDirectory, 'temp')
  mkdirSync(reportDirectory, { recursive: true })
  writeFileSync(join(reportDirectory, 'teams-api.api.md'), '')

  const config = ExtractorConfig.prepare({
    packageJsonFullPath: packageJsonPath,
    configObjectFullPath: join(reportDirectory, 'api-extractor.json'),
    configObject: {
      projectFolder: packageRoot,
      mainEntryPointFilePath: resolveTypesEntryPoint(packageRoot, packageJson),
      compiler: {
        overrideTsconfig: { compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', skipLibCheck: true } },
        skipLibCheck: true
      },
      apiReport: { enabled: true, reportFileName: 'teams-api', reportFolder: reportDirectory, reportTempFolder: reportTempDirectory },
      docModel: { enabled: false },
      dtsRollup: { enabled: false },
      tsdocMetadata: { enabled: false }
    }
  })

  const result = Extractor.invoke(config, { localBuild: true, messageCallback: () => {} })
  if (!result.succeeded) throw new Error(`API Extractor failed for ${dependency}@${packageJson.version} with ${result.errorCount} error(s).`)
  return {
    version: packageJson.version,
    text: readFileSync(join(reportDirectory, 'teams-api.api.md'), 'utf8'),
    model: extractApiModel(packageRoot, packageJson.version)
  }
}

function installPackage (packageSpec: string, workRoot: string, name: string): string {
  const installRoot = join(workRoot, name)
  mkdirSync(installRoot, { recursive: true })
  writeFileSync(join(installRoot, 'package.json'), '{ "private": true }\n')
  try {
    runNpm(['install', '--ignore-scripts', '--no-package-lock', '--no-save', '--cache', join(workRoot, 'npm-cache'), packageSpec], installRoot)
  } catch (error) {
    const details = error instanceof Error && 'stderr' in error && error.stderr != null
      ? String(error.stderr).trim()
      : error instanceof Error ? error.message : String(error)
    throw new Error(`Unable to install ${packageSpec}. ${details}`)
  }
  const packageRoot = join(installRoot, 'node_modules', ...dependency.split('/'))
  const packageJson = readPackageJson(packageRoot)
  if (packageJson.name !== dependency) throw new Error(`Expected ${dependency}, but ${packageSpec} installed ${packageJson.name}.`)
  return packageRoot
}

function stringifyProperty (property: PropertyModel | undefined): string | undefined {
  return property && `${property.optional ? '?' : ''}: ${property.type}`
}

function stringifySignature (signature: SignatureModel): string {
  return `(${signature.parameters.map(parameter => `${parameter.name}${parameter.optional ? '?' : ''}: ${parameter.type}`).join(', ')}) => ${signature.returnType}`
}

function addChange (changes: Omit<ApiChange, 'id'>[], change: Omit<ApiChange, 'id'>): void {
  changes.push(change)
}

function compareSignatures (changes: Omit<ApiChange, 'id'>[], symbol: string, member: string, before: SignatureModel[], after: SignatureModel[]): void {
  if (before.length !== after.length) {
    addChange(changes, {
      kind: before.length < after.length ? 'overload-added' : 'overload-removed',
      symbol,
      member,
      before: String(before.length),
      after: String(after.length),
      compatibility: before.length < after.length ? 'non-breaking' : 'breaking',
      evidence: ['normalized-api-model']
    })
  }
  for (let index = 0; index < Math.min(before.length, after.length); index++) {
    const oldSignature = before[index]
    const newSignature = after[index]
    if (oldSignature.returnType !== newSignature.returnType) {
      addChange(changes, { kind: 'return-type-changed', symbol, member: `${member}#${index + 1}`, before: oldSignature.returnType, after: newSignature.returnType, compatibility: 'potentially-breaking', evidence: ['normalized-api-model'] })
    }
    if (oldSignature.parameters.length !== newSignature.parameters.length) {
      const added = newSignature.parameters.slice(oldSignature.parameters.length)
      addChange(changes, {
        kind: oldSignature.parameters.length < newSignature.parameters.length ? 'parameter-added' : 'parameter-removed',
        symbol,
        member: `${member}#${index + 1}`,
        before: stringifySignature(oldSignature),
        after: stringifySignature(newSignature),
        compatibility: added.some(parameter => !parameter.optional) ? 'breaking' : 'potentially-breaking',
        evidence: ['normalized-api-model']
      })
    }
    for (let parameterIndex = 0; parameterIndex < Math.min(oldSignature.parameters.length, newSignature.parameters.length); parameterIndex++) {
      const oldParameter = oldSignature.parameters[parameterIndex]
      const newParameter = newSignature.parameters[parameterIndex]
      const parameterName = `${member}#${index + 1}.${oldParameter.name}`
      if (oldParameter.optional !== newParameter.optional) {
        addChange(changes, { kind: 'parameter-requiredness-changed', symbol, member: parameterName, before: String(!oldParameter.optional), after: String(!newParameter.optional), compatibility: newParameter.optional ? 'non-breaking' : 'breaking', evidence: ['normalized-api-model'] })
      }
      if (oldParameter.type !== newParameter.type) {
        addChange(changes, { kind: 'parameter-type-changed', symbol, member: parameterName, before: oldParameter.type, after: newParameter.type, compatibility: 'potentially-breaking', evidence: ['normalized-api-model'] })
      }
    }
  }
}

function createChanges (before: ApiModel, after: ApiModel): ApiChange[] {
  const changes: Omit<ApiChange, 'id'>[] = []
  const beforeSymbols = new Map(before.symbols.map(symbol => [symbol.name, symbol]))
  const afterSymbols = new Map(after.symbols.map(symbol => [symbol.name, symbol]))
  for (const name of new Set([...beforeSymbols.keys(), ...afterSymbols.keys()])) {
    const oldSymbol = beforeSymbols.get(name)
    const newSymbol = afterSymbols.get(name)
    if (!oldSymbol || !newSymbol) {
      addChange(changes, { kind: oldSymbol ? 'symbol-removed' : 'symbol-added', symbol: name, compatibility: oldSymbol ? 'breaking' : 'non-breaking', evidence: ['normalized-api-model'] })
      continue
    }
    if (oldSymbol.exportPath !== newSymbol.exportPath) addChange(changes, { kind: 'export-path-changed', symbol: name, before: oldSymbol.exportPath, after: newSymbol.exportPath, compatibility: 'potentially-breaking', evidence: ['normalized-api-model'] })
    if (oldSymbol.deprecated !== newSymbol.deprecated) addChange(changes, { kind: newSymbol.deprecated ? 'deprecation-added' : 'deprecation-removed', symbol: name, compatibility: 'unknown', evidence: ['normalized-api-model'] })
    if (oldSymbol.releaseTag !== newSymbol.releaseTag) addChange(changes, { kind: 'release-tag-changed', symbol: name, before: oldSymbol.releaseTag, after: newSymbol.releaseTag, compatibility: 'unknown', evidence: ['normalized-api-model'] })
    for (const property of new Set([...Object.keys(oldSymbol.properties), ...Object.keys(newSymbol.properties)])) {
      const oldProperty = oldSymbol.properties[property]
      const newProperty = newSymbol.properties[property]
      if (!oldProperty || !newProperty) {
        addChange(changes, { kind: oldProperty ? 'property-removed' : 'property-added', symbol: name, member: property, before: stringifyProperty(oldProperty), after: stringifyProperty(newProperty), compatibility: oldProperty ? 'breaking' : 'non-breaking', evidence: ['normalized-api-model'] })
        continue
      }
      if (oldProperty.optional !== newProperty.optional) addChange(changes, { kind: 'property-requiredness-changed', symbol: name, member: property, before: String(!oldProperty.optional), after: String(!newProperty.optional), compatibility: newProperty.optional ? 'non-breaking' : 'potentially-breaking', evidence: ['normalized-api-model'] })
      if (oldProperty.type !== newProperty.type) addChange(changes, { kind: 'property-type-changed', symbol: name, member: property, before: oldProperty.type, after: newProperty.type, compatibility: 'potentially-breaking', evidence: ['normalized-api-model'] })
    }
    for (const method of new Set([...Object.keys(oldSymbol.methods), ...Object.keys(newSymbol.methods)])) {
      const oldMethod = oldSymbol.methods[method]
      const newMethod = newSymbol.methods[method]
      if (!oldMethod || !newMethod) {
        addChange(changes, { kind: oldMethod ? 'method-removed' : 'method-added', symbol: name, member: method, compatibility: oldMethod ? 'breaking' : 'non-breaking', evidence: ['normalized-api-model'] })
      } else compareSignatures(changes, name, method, oldMethod, newMethod)
    }
    compareSignatures(changes, name, 'constructor', oldSymbol.constructors, newSymbol.constructors)
    for (const member of new Set([...oldSymbol.enumMembers, ...newSymbol.enumMembers])) {
      if (!oldSymbol.enumMembers.includes(member) || !newSymbol.enumMembers.includes(member)) addChange(changes, { kind: oldSymbol.enumMembers.includes(member) ? 'enum-member-removed' : 'enum-member-added', symbol: name, member, compatibility: oldSymbol.enumMembers.includes(member) ? 'breaking' : 'non-breaking', evidence: ['normalized-api-model'] })
    }
  }
  return changes.sort((left, right) => `${left.symbol}.${left.member ?? ''}.${left.kind}`.localeCompare(`${right.symbol}.${right.member ?? ''}.${right.kind}`)).map((change, index) => ({ ...change, id: `TSAPI-${String(index + 1).padStart(4, '0')}` }))
}

function createComparison (current: ApiReport, candidate: ApiReport, requestedCandidate: string): ComparisonResult {
  const lineChanges = diffLines(current.text, candidate.text)
  const addedLines = lineChanges.filter(change => change.added).flatMap(change => change.value.split('\n').filter(Boolean))
  const removedLines = lineChanges.filter(change => change.removed).flatMap(change => change.value.split('\n').filter(Boolean))
  const changes = createChanges(current.model, candidate.model)
  return {
    schemaVersion: 1,
    dependency,
    fromVersion: current.version,
    toVersion: candidate.version,
    apiExtractorVersion: Extractor.version,
    current: { version: current.version },
    candidate: { requested: requestedCandidate, version: candidate.version },
    changed: changes.length > 0,
    changes,
    addedLines,
    removedLines,
    diff: createTwoFilesPatch(`${dependency}@${current.version}`, `${dependency}@${candidate.version}`, current.text, candidate.text, '', '', { context: 3 })
  }
}

function writeJson (destination: string, value: unknown): void {
  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(destination, `${JSON.stringify(value, undefined, 2)}\n`)
}

function writeOutput (result: ComparisonResult, current: ApiReport, candidate: ApiReport, output: string): void {
  const destination = resolve(output)
  if (extname(destination).toLowerCase() === '.json') {
    writeJson(destination, result)
    console.log(`Wrote comparison result to ${relative(process.cwd(), destination) || basename(destination)}`)
    return
  }
  mkdirSync(destination, { recursive: true })
  writeJson(join(destination, 'teams-api-before.api.json'), current.model)
  writeJson(join(destination, 'teams-api-after.api.json'), candidate.model)
  writeJson(join(destination, 'raw-api-diff.json'), result)
  console.log(`Wrote API models and raw delta to ${relative(process.cwd(), destination) || basename(destination)}`)
}

function main (): void {
  const settings = parseSettings(process.argv.slice(2))
  if (settings.help) {
    console.log(help)
    return
  }

  const installedPackageRoot = resolveInstalledPackageRoot()
  const installedVersion = installedPackageRoot ? readPackageJson(installedPackageRoot).version : undefined
  const fromVersion = settings.from ?? installedVersion
  const toVersion = settings.to ?? getLatestStableVersion()
  if (!fromVersion) throw new Error(`Cannot determine the baseline version because ${dependency} is not installed. Supply --from explicitly.`)
  if (!isVersion(fromVersion) || !isVersion(toVersion)) throw new Error('--from and --to must be complete versions, optionally with a prerelease suffix.')

  const workRoot = mkdtempSync(join(tmpdir(), 'teams-api-compare-'))
  try {
    console.log(`Comparing ${dependency}@${fromVersion} with ${dependency}@${toVersion}...`)
    const currentPackageRoot = installedPackageRoot && fromVersion === installedVersion ? installedPackageRoot : installPackage(`${dependency}@${fromVersion}`, workRoot, 'baseline')
    const candidatePackageRoot = installedPackageRoot && toVersion === installedVersion ? installedPackageRoot : installPackage(`${dependency}@${toVersion}`, workRoot, 'candidate')
    const current = generateApiReport(currentPackageRoot, workRoot)
    const candidate = generateApiReport(candidatePackageRoot, workRoot)
    const comparison = createComparison(current, candidate, toVersion)
    console.log(comparison.changed ? `${comparison.changes.length} structured API change(s) detected.` : 'No public API changes detected.')
    if (comparison.changed && settings.verbose) console.log(comparison.diff)
    if (settings.output) writeOutput(comparison, current, candidate, settings.output)
  } finally {
    rmSync(workRoot, { recursive: true, force: true })
  }
}

main()
