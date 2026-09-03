// @ts-check

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import typescript from 'typescript'
import { parse as parseYaml } from 'yaml'

const ts = typescript
const dependency = '@microsoft/teams.api'
const packagePath = 'packages/agents-hosting-extensions-msteams'
const manifestPath = `${packagePath}/teams-api-usage-manifest.json`
const capabilitiesPath = `${packagePath}/config/teams-capabilities.yaml`
const packageManifestPath = `${packagePath}/package.json`
const sourcePrefix = `${packagePath}/src/`
const sourceReviewGuide = 'scripts/teams-api-drift/README.md#source-review-acknowledgments'

/** @typedef {{ upstreamSymbol: string, usage: string, usageKinds?: string[], exposure?: string, methodsCalled?: string[], propertiesRead?: string[], propertiesValidated?: string[], propertiesWritten?: string[], files: string[] }} Usage */
/** @typedef {{ dependency: string, declaredVersion?: string, sourceRoot?: string, usages: Usage[], sourceReview?: { outcome?: string, reason?: string } }} UsageManifest */
/** @typedef {{ description?: string, owners: string[], upstreamAreas: string[], adoptionPolicy: string }} Capability */
/** @typedef {{ schemaVersion: number, dependency: { package: string }, capabilities: Record<string, Capability>, sourceReview?: { outcome?: string, reason?: string } }} CapabilitiesDocument */
/** @typedef {{ symbol: string, localName: string, typeOnly: boolean, file: string, line: number }} TeamsImport */
/** @typedef {{ ruleId: 'compat/teams-api-usage-manifest-stale' | 'compat/teams-api-usage-review-missing' | 'compat/teams-api-capabilities-stale' | 'compat/teams-api-capabilities-review-missing', path: string, message: string, fix: string, line: number, column: number, subject?: string }} MetadataFinding */

/**
 * Validates the Teams API drift metadata without modifying the checkout.
 * @param {string} root
 * @param {{ baseRef?: string }} [options]
 * @returns {MetadataFinding[]}
 */
export function checkTeamsApiMetadata (root, options = {}) {
  const normalizedRoot = path.resolve(root)
  if (!fs.existsSync(path.join(normalizedRoot, packageManifestPath))) return []

  /** @type {MetadataFinding[]} */
  const findings = []
  const packageManifest = readJsonFile(normalizedRoot, packageManifestPath, findings, 'usage')
  const manifest = readJsonFile(normalizedRoot, manifestPath, findings, 'usage')
  const capabilities = readYamlFile(normalizedRoot, capabilitiesPath, findings)
  if (packageManifest == null || manifest === undefined || capabilities === undefined) return findings

  validateDocumentShapes(manifest, capabilities, findings)
  if (!Array.isArray(manifest?.usages) || !isCapabilitiesRecord(capabilities?.capabilities)) return findings

  const sourceFiles = walkSourceFiles(normalizedRoot)
  const imports = sourceFiles.flatMap(file => collectTeamsImports(file, fs.readFileSync(path.join(normalizedRoot, packagePath, file), 'utf8')))
  validateManifestState(normalizedRoot, packageManifest, manifest, sourceFiles, imports, findings)
  validateCapabilityState(sourceFiles, imports, capabilities, findings)
  const program = createTeamsProgram(normalizedRoot)
  if (program) {
    validatePublicExposure(normalizedRoot, manifest, findings, program)
    validateStaticMembers(normalizedRoot, manifest, findings, program)
  }

  const git = collectGitChanges(normalizedRoot, options.baseRef)
  if (git) validateChangeReviews(normalizedRoot, git, manifest, capabilities, imports, findings)

  return findings
}

function validateDocumentShapes (manifest, capabilities, findings) {
  if (manifest.dependency !== dependency || !Array.isArray(manifest.usages)) {
    add(findings, 'usage-stale', manifestPath, `Usage manifest must describe ${dependency} and contain a usages array.`, `Set dependency to "${dependency}" and restore the usages array.`)
  }
  if (capabilities.schemaVersion !== 1 || capabilities.dependency?.package !== dependency || !isCapabilitiesRecord(capabilities.capabilities)) {
    add(findings, 'capabilities-stale', capabilitiesPath, `Capabilities metadata must be a schemaVersion 1 map for ${dependency}.`, `Restore schemaVersion, dependency.package, and the capabilities map for ${dependency}.`)
  }
  validateReview(manifest.sourceReview, 'no-usage-metadata-change', manifestPath, 'usage', findings)
  validateReview(capabilities.sourceReview, 'no-capability-metadata-change', capabilitiesPath, 'capabilities', findings)
}

function validateReview (review, expectedOutcome, file, kind, findings) {
  if (review === undefined) return
  if (!review || review.outcome !== expectedOutcome || typeof review.reason !== 'string' || review.reason.trim() === '') {
    add(findings, `${kind}-stale`, file, `sourceReview must use outcome "${expectedOutcome}" and include a non-empty reason.`, `Correct sourceReview or remove it when the document contains a substantive metadata update. See ${sourceReviewGuide}.`)
  }
}

function validateManifestState (root, packageManifest, manifest, sourceFiles, imports, findings) {
  const declaredRange = packageManifest.dependencies?.[dependency]
  const declaredVersion = typeof declaredRange === 'string' ? declaredRange.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)?.[0] : undefined
  if (!declaredVersion || manifest.declaredVersion !== declaredVersion) {
    add(findings, 'usage-stale', manifestPath, `declaredVersion must match package.json (${declaredVersion ?? 'missing dependency version'}).`, `Set declaredVersion to ${JSON.stringify(declaredVersion ?? '<package dependency version>')}.`)
  }
  if (manifest.sourceRoot !== 'src') {
    add(findings, 'usage-stale', manifestPath, 'sourceRoot must be "src" for Teams extension source paths.', 'Set sourceRoot to "src".')
  }

  const sourceSet = new Set(sourceFiles)
  for (const usage of manifest.usages) {
    if (!usage || typeof usage.upstreamSymbol !== 'string' || typeof usage.usage !== 'string' || !Array.isArray(usage.files)) {
      add(findings, 'usage-stale', manifestPath, 'Every usage must include upstreamSymbol, usage, and a files array.', 'Repair the malformed usage entry.')
      continue
    }
    for (const file of usage.files) {
      if (typeof file !== 'string' || !file.startsWith('src/') || !sourceSet.has(normalize(file))) {
        add(findings, 'usage-stale', manifestPath, `Usage ${usage.upstreamSymbol} references missing or unsafe source file ${JSON.stringify(file)}.`, 'Remove the stale path or replace it with an existing file under src/.', usage.upstreamSymbol)
      }
    }
  }

  for (const imported of imports) {
    const covered = manifest.usages.some(usage => usage.upstreamSymbol === imported.symbol && usage.files?.some(file => normalize(file) === imported.file))
    if (!covered) {
      add(findings, 'usage-stale', `${packagePath}/${imported.file}`, `Direct ${dependency} import ${imported.symbol} is absent from the usage manifest for this file.`, `Add ${imported.symbol} and ${imported.file} to ${manifestPath}.`, imported.symbol, imported.line)
    }
  }
}

function validateCapabilityState (sourceFiles, imports, capabilities, findings) {
  for (const [name, capability] of Object.entries(capabilities.capabilities)) {
    if (!Array.isArray(capability.owners) || !Array.isArray(capability.upstreamAreas) || typeof capability.adoptionPolicy !== 'string') {
      add(findings, 'capabilities-stale', capabilitiesPath, `Capability ${name} must include owners, upstreamAreas, and adoptionPolicy.`, `Repair the ${name} capability metadata.`, name)
      continue
    }
    for (const owner of capability.owners) {
      if (typeof owner !== 'string' || !sourceFiles.some(file => matchesOwner(owner, file))) {
        add(findings, 'capabilities-stale', capabilitiesPath, `Capability ${name} owner pattern ${JSON.stringify(owner)} matches no source files.`, `Update or remove the stale owner pattern from ${name}.`, name)
      }
    }
  }

  for (const imported of imports) {
    const areas = upstreamAreasFor(imported.symbol)
    if (areas.length === 0) continue
    const owners = capabilitiesForFile(capabilities, imported.file)
    if (owners.length === 0) {
      add(findings, 'capabilities-stale', `${packagePath}/${imported.file}`, `${imported.symbol} maps to ${areas.join(', ')} but this source file has no capability owner.`, `Add ${imported.file} to the appropriate capability owners in ${capabilitiesPath}.`, imported.symbol, imported.line)
      continue
    }
    if (!owners.some(([, capability]) => capability.upstreamAreas.some(area => areas.some(candidate => candidate === area || candidate.startsWith(`${area}.`))))) {
      add(findings, 'capabilities-stale', `${packagePath}/${imported.file}`, `${imported.symbol} maps to ${areas.join(', ')}, which is absent from this file's owning capabilities.`, `Add the appropriate upstream area to ${owners.map(([name]) => name).join(' or ')} in ${capabilitiesPath}.`, imported.symbol, imported.line)
    }
  }
}

function createTeamsProgram (root) {
  const configPath = path.join(root, packagePath, 'tsconfig.json')
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  if (config.error) return undefined
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath), { noEmit: true }, configPath)
  return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options })
}

function validatePublicExposure (root, manifest, findings, program) {
  const checker = program.getTypeChecker()
  const entrypoint = program.getSourceFile(path.join(root, packagePath, 'src/index.ts'))
  const moduleSymbol = entrypoint && checker.getSymbolAtLocation(entrypoint)
  if (!entrypoint || !moduleSymbol) return

  /** @type {Map<string, Set<string>>} */
  const exposed = new Map()
  const exportedSymbols = new Set(checker.getExportsOfModule(moduleSymbol).map(exported => exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported))
  for (const symbol of exportedSymbols) {
    for (const declaration of symbol.declarations ?? []) {
      const sourceFile = declaration.getSourceFile()
      if (!normalize(sourceFile.fileName).includes(`/${packagePath}/src/`)) continue
      const relativeFile = normalize(path.relative(path.join(root, packagePath), sourceFile.fileName))
      visitPublicTypes(declaration, checker, exportedSymbols, upstreamSymbol => {
        const files = exposed.get(upstreamSymbol) ?? new Set()
        files.add(relativeFile)
        exposed.set(upstreamSymbol, files)
      })
    }
  }

  for (const [upstreamSymbol, files] of exposed) {
    const usages = manifest.usages.filter(usage => usage.upstreamSymbol === upstreamSymbol)
    if (usages.length === 0) continue
    if (!usages.some(usage => usage.exposure === 'publicly-exposed' || usage.exposure === 're-exported')) {
      add(findings, 'usage-stale', manifestPath, `${upstreamSymbol} appears in the package public API but is not marked publicly exposed.`, `Set exposure to "publicly-exposed" on the ${upstreamSymbol} usage entry.`, upstreamSymbol)
    }
    for (const file of files) {
      if (!usages.some(usage => usage.files.some(candidate => normalize(candidate) === file))) {
        add(findings, 'usage-stale', `${packagePath}/${file}`, `Public ${upstreamSymbol} exposure is absent from the usage manifest for this file.`, `Add ${file} to the publicly exposed ${upstreamSymbol} usage entry.`, upstreamSymbol)
      }
    }
  }
  for (const usage of manifest.usages) {
    if ((usage.exposure === 'publicly-exposed' || usage.exposure === 're-exported') && !exposed.has(usage.upstreamSymbol)) {
      add(findings, 'usage-stale', manifestPath, `${usage.upstreamSymbol} is marked ${usage.exposure} but no longer appears in the package public API.`, `Update or remove the stale exposure for ${usage.upstreamSymbol}.`, usage.upstreamSymbol)
    }
  }
}

function visitPublicTypes (declaration, checker, exportedSymbols, onUpstreamSymbol) {
  const visitedSymbols = new Set()
  function visit (node) {
    if (ts.isBlock(node) || ts.isExpressionStatement(node) || ts.isImportDeclaration(node)) return
    if (ts.isClassElement(node) && hasModifier(node, ts.SyntaxKind.PrivateKeyword)) return
    if (ts.isTypeReferenceNode(node)) {
      const identifier = ts.isIdentifier(node.typeName) ? node.typeName : node.typeName.right
      const symbol = checker.getSymbolAtLocation(identifier)
      const target = symbol && (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol)
      if (target && comesFromTeamsApi(target)) onUpstreamSymbol(target.getName())
      else if (target && !exportedSymbols.has(target) && !visitedSymbols.has(target) && (target.declarations ?? []).some(candidate => normalize(candidate.getSourceFile().fileName).includes(`/${packagePath}/src/`))) {
        visitedSymbols.add(target)
        for (const candidate of target.declarations ?? []) visit(candidate)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
}

function validateStaticMembers (root, manifest, findings, program) {
  const checker = program.getTypeChecker()
  /** @type {Set<string>} */
  const reported = new Set()

  for (const sourceFile of program.getSourceFiles()) {
    const normalizedFile = normalize(sourceFile.fileName)
    if (!normalizedFile.includes(`/${packagePath}/src/`)) continue
    const relativeFile = normalize(path.relative(path.join(root, packagePath), sourceFile.fileName))
    function visit (node) {
      if (ts.isPropertyAccessExpression(node)) {
        const access = propertyAccess(node, checker)
        if (access) {
          const usages = manifest.usages.filter(usage => usage.upstreamSymbol === access.symbol && usage.files.some(file => normalize(file) === relativeFile))
          if (usages.length > 0) {
            const declared = access.kind === 'method'
              ? usages.flatMap(usage => usage.methodsCalled ?? [])
              : usages.flatMap(usage => [...(usage.propertiesRead ?? []), ...(usage.propertiesWritten ?? []), ...(usage.propertiesValidated ?? [])])
            const covered = declared.some(candidate => candidate === access.path || candidate.replace(/\[\]/g, '').split('.')[0] === access.path.split('.')[0])
            const key = `${relativeFile}:${access.symbol}:${access.kind}:${access.path}`
            if (!covered && !reported.has(key)) {
              reported.add(key)
              const field = access.kind === 'method' ? 'methodsCalled' : access.kind === 'write' ? 'propertiesWritten' : 'propertiesRead'
              add(findings, 'usage-stale', `${packagePath}/${relativeFile}`, `${access.symbol}.${access.path} is statically ${access.kind === 'method' ? 'called' : access.kind === 'write' ? 'written' : 'read'} but absent from the usage manifest.`, `Add ${JSON.stringify(access.path)} to ${field} for ${access.symbol}.`, access.symbol, sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1)
            }
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }
}

function propertyAccess (node, checker) {
  const segments = [node.name.text]
  let expression = node.expression
  while (ts.isPropertyAccessExpression(expression)) {
    segments.unshift(expression.name.text)
    expression = expression.expression
  }
  const type = checker.getTypeAtLocation(expression)
  const symbol = upstreamTypeSymbol(type)
  if (!symbol) return undefined
  const parent = node.parent
  const method = ts.isCallExpression(parent) && parent.expression === node
  if (method && segments.length > 1) return undefined
  const write = ts.isBinaryExpression(parent) && parent.left === node && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment
  return { symbol, path: segments.join('.'), kind: method ? 'method' : write ? 'write' : 'read' }
}

function upstreamTypeSymbol (type) {
  if (type.isUnionOrIntersection?.()) {
    for (const member of type.types) {
      const symbol = upstreamTypeSymbol(member)
      if (symbol) return symbol
    }
    return undefined
  }
  const symbol = type.aliasSymbol ?? type.symbol
  return symbol && comesFromTeamsApi(symbol) ? symbol.getName() : undefined
}

function comesFromTeamsApi (symbol) {
  return (symbol.declarations ?? []).some(declaration => {
    const file = normalize(declaration.getSourceFile().fileName)
    return file.includes('/node_modules/@microsoft/teams.api/')
  })
}

function validateChangeReviews (root, git, manifest, capabilities, currentImports, findings) {
  const baseManifest = readGitJson(root, git.base, manifestPath)
  const baseCapabilities = readGitYaml(root, git.base, capabilitiesPath)
  if (!baseManifest || !baseCapabilities) return

  const currentUsageFiles = usageFiles(manifest)
  const baseUsageFiles = usageFiles(baseManifest)
  const currentImportFiles = new Set(currentImports.map(item => item.file))
  const changedSourceFiles = [...git.changedFiles]
    .filter(file => file.startsWith(sourcePrefix))
    .map(file => normalize(path.relative(packagePath, file)))

  const usageRelevant = changedSourceFiles.filter(file => currentUsageFiles.has(file) || baseUsageFiles.has(file) || currentImportFiles.has(file) || gitFileImportsTeamsApi(root, git.base, `${packagePath}/${file}`))
  const removedImportsStillRecorded = changedSourceFiles.flatMap(file => {
    const currentSymbols = new Set(currentImports.filter(item => item.file === file).map(item => item.symbol))
    const baseText = readGitFile(root, git.base, `${packagePath}/${file}`)
    if (baseText === undefined) return []
    return collectTeamsImports(file, baseText)
      .filter(item => !currentSymbols.has(item.symbol) && manifest.usages.some(usage => usage.upstreamSymbol === item.symbol && usage.files.some(candidate => normalize(candidate) === file)))
      .map(item => `${item.symbol} in ${file}`)
  })
  const usageReviewFresh = metadataChangeIsFresh(root, git, usageRelevant.map(file => `${packagePath}/${file}`), manifestPath)
  const explicitUsageReview = reviewChanged(baseManifest.sourceReview, manifest.sourceReview, 'no-usage-metadata-change') && usageReviewFresh
  let usageReviewReported = false
  if (removedImportsStillRecorded.length > 0 && !explicitUsageReview) {
    usageReviewReported = true
    add(findings, 'usage-review', manifestPath, `Removed direct Teams API import(s) remain recorded in the usage manifest: ${removedImportsStillRecorded.join(', ')}.`, `Update the affected usage entries, or follow ${sourceReviewGuide} and explain why the indirect usage remains.`)
  }
  if (!usageReviewReported && usageRelevant.length > 0 && (!metadataReviewed(baseManifest, manifest, 'usages', 'no-usage-metadata-change') || !usageReviewFresh)) {
    add(findings, 'usage-review', manifestPath, `${usageRelevant.length} Teams API usage-related source file(s) changed without a usage-manifest update or non-impact review.`, `Update usages in ${manifestPath}, or follow ${sourceReviewGuide}.`, usageRelevant.slice(0, 4).join(', '))
  }

  const capabilityChanges = changedSourceFiles.map(file => {
    const currentExists = fs.existsSync(path.join(root, packagePath, file))
    const baseExists = gitFileExists(root, git.base, `${packagePath}/${file}`)
    const currentOwners = currentExists ? capabilitiesForFile(capabilities, file).map(([name]) => name).sort() : []
    const baseOwners = baseExists ? capabilitiesForFile(baseCapabilities, file).map(([name]) => name).sort() : []
    const currentSymbols = currentImports.filter(item => item.file === file).map(item => item.symbol).sort()
    const baseText = readGitFile(root, git.base, `${packagePath}/${file}`)
    const baseSymbols = baseText === undefined ? [] : collectTeamsImports(file, baseText).map(item => item.symbol).sort()
    return {
      file,
      currentExists,
      baseExists,
      currentOwners,
      baseOwners,
      importChanged: (currentOwners.length > 0 || baseOwners.length > 0) && !isDeepStrictEqual(currentSymbols, baseSymbols)
    }
  }).filter(change => change.currentExists !== change.baseExists || !isDeepStrictEqual(change.currentOwners, change.baseOwners) || change.importChanged)
  const capabilityRelevant = capabilityChanges.map(change => change.file)
  const capabilityReviewFresh = metadataChangeIsFresh(root, git, capabilityRelevant.map(file => `${packagePath}/${file}`), capabilitiesPath)
  const explicitCapabilityReview = reviewChanged(baseCapabilities.sourceReview, capabilities.sourceReview, 'no-capability-metadata-change') && capabilityReviewFresh
  const targetedCapabilitiesUpdate = capabilityReviewFresh && capabilityChanges.every(change => capabilityChangeAddressed(change, baseCapabilities, capabilities))
  if (capabilityRelevant.length > 0 && !explicitCapabilityReview && !targetedCapabilitiesUpdate) {
    add(findings, 'capabilities-review', capabilitiesPath, `${capabilityRelevant.length} capability ownership or upstream-area source change(s) lack a targeted capabilities update or non-impact review.`, `Add or remove owner patterns for the affected paths in ${capabilitiesPath}, or follow ${sourceReviewGuide}.`, capabilityRelevant.slice(0, 4).join(', '))
  }
}

function capabilityChangeAddressed (change, before, after) {
  if (!change.baseExists && change.currentExists) {
    return ownerPatternsForFile(after, change.file).some(pattern => !ownerPatternsForFile(before, change.file).includes(pattern))
  }
  if (change.baseExists && !change.currentExists) {
    return ownerPatternsForFile(before, change.file).some(pattern => !ownerPatternsForFile(after, change.file).includes(pattern))
  }
  if (!isDeepStrictEqual(change.currentOwners, change.baseOwners)) return true
  if (!change.importChanged) return false
  return [...new Set([...change.currentOwners, ...change.baseOwners])].some(name => {
    const beforeCapability = before.capabilities?.[name]
    const afterCapability = after.capabilities?.[name]
    return !isDeepStrictEqual(beforeCapability?.owners, afterCapability?.owners) || !isDeepStrictEqual(beforeCapability?.upstreamAreas, afterCapability?.upstreamAreas)
  })
}

function ownerPatternsForFile (document, file) {
  return Object.values(document.capabilities ?? {}).flatMap(capability => (capability.owners ?? []).filter(owner => matchesOwner(owner, file))).sort()
}

function metadataReviewed (before, after, substantiveField, expectedOutcome) {
  if (!isDeepStrictEqual(before[substantiveField], after[substantiveField])) return true
  return reviewChanged(before.sourceReview, after.sourceReview, expectedOutcome)
}

function reviewChanged (beforeReview, afterReview, expectedOutcome) {
  return !isDeepStrictEqual(beforeReview, afterReview) && afterReview?.outcome === expectedOutcome && typeof afterReview.reason === 'string' && afterReview.reason.trim() !== ''
}

function metadataChangeIsFresh (root, git, sourceFiles, metadataFile) {
  const normalizedSources = sourceFiles.map(normalize)
  const metadata = normalize(metadataFile)
  if (normalizedSources.some(file => git.workingFiles.has(file))) return git.workingFiles.has(metadata)
  if (git.workingFiles.has(metadata)) return true
  const sourceCommit = latestCommitFor(root, git.base, normalizedSources)
  const metadataCommit = latestCommitFor(root, git.base, [metadata])
  return Boolean(sourceCommit && metadataCommit && (sourceCommit === metadataCommit || gitSucceeds(root, ['merge-base', '--is-ancestor', sourceCommit, metadataCommit])))
}

function latestCommitFor (root, base, files) {
  return gitText(root, ['log', '-1', '--format=%H', `${base}..HEAD`, '--', ...files])?.trim()
}

function collectGitChanges (root, explicitBaseRef) {
  if (!gitSucceeds(root, ['rev-parse', '--is-inside-work-tree'])) return undefined
  const baseRef = resolveBaseRef(root, explicitBaseRef)
  const base = gitText(root, ['merge-base', 'HEAD', baseRef])?.trim()
  if (!base) {
    if (explicitBaseRef) throw new Error(`Unable to resolve Git base ref ${explicitBaseRef}.`)
    return undefined
  }
  const committedFiles = new Set(gitNullList(root, ['diff', '--name-only', '--no-renames', '-z', base, 'HEAD']).map(normalize))
  const workingFiles = new Set([
    ...gitNullList(root, ['diff', '--name-only', '--no-renames', '-z', 'HEAD']),
    ...gitNullList(root, ['ls-files', '--others', '--exclude-standard', '-z'])
  ].map(normalize))
  return { base, committedFiles, workingFiles, changedFiles: new Set([...committedFiles, ...workingFiles]) }
}

function resolveBaseRef (root, explicit) {
  const candidates = []
  if (explicit) candidates.push(explicit)
  else if (process.env.GITHUB_BASE_REF) candidates.push(`origin/${process.env.GITHUB_BASE_REF}`, process.env.GITHUB_BASE_REF)
  else if (process.env.SYSTEM_PULLREQUEST_TARGETBRANCH) {
    const branch = process.env.SYSTEM_PULLREQUEST_TARGETBRANCH.replace(/^refs\/heads\//, '')
    candidates.push(`origin/${branch}`, branch, process.env.SYSTEM_PULLREQUEST_TARGETBRANCH)
  }
  if (!explicit) candidates.push('origin/main', 'upstream/main', 'main', 'HEAD')
  return candidates.find(candidate => gitSucceeds(root, ['rev-parse', '--verify', `${candidate}^{commit}`])) ?? explicit ?? 'HEAD'
}

function gitText (root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return undefined
  }
}

function gitSucceeds (root, args) { return gitText(root, args) !== undefined }
function gitNullList (root, args) { return (gitText(root, args) ?? '').split('\0').filter(Boolean) }
function readGitFile (root, base, file) { return gitText(root, ['show', `${base}:${normalize(file)}`]) }
function gitFileExists (root, base, file) { return readGitFile(root, base, file) !== undefined }
function gitFileImportsTeamsApi (root, base, file) { const text = readGitFile(root, base, file) ?? ''; return text.includes(`from '${dependency}'`) || text.includes(`from "${dependency}"`) }
function readGitJson (root, base, file) { const text = readGitFile(root, base, file); try { return text === undefined ? undefined : JSON.parse(text) } catch { return undefined } }
function readGitYaml (root, base, file) { const text = readGitFile(root, base, file); try { return text === undefined ? undefined : parseYaml(text) } catch { return undefined } }

function readJsonFile (root, file, findings, kind) {
  if (!fs.existsSync(path.join(root, file))) {
    add(findings, `${kind}-stale`, file, 'Required Teams API metadata file is missing.', `Restore ${file}.`)
    return undefined
  }
  try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')) } catch (error) {
    add(findings, `${kind}-stale`, file, `Unable to parse JSON: ${error instanceof Error ? error.message : String(error)}`, `Correct the JSON syntax in ${file}.`)
    return undefined
  }
}

function readYamlFile (root, file, findings) {
  if (!fs.existsSync(path.join(root, file))) {
    add(findings, 'capabilities-stale', file, 'Required Teams API capabilities file is missing.', `Restore ${file}.`)
    return undefined
  }
  try { return parseYaml(fs.readFileSync(path.join(root, file), 'utf8')) } catch (error) {
    add(findings, 'capabilities-stale', file, `Unable to parse YAML: ${error instanceof Error ? error.message : String(error)}`, `Correct the YAML syntax in ${file}.`)
    return undefined
  }
}

function collectTeamsImports (file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  /** @type {TeamsImport[]} */
  const imports = []
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== dependency) continue
    const clause = statement.importClause
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue
    for (const specifier of clause.namedBindings.elements) {
      imports.push({
        symbol: specifier.propertyName?.text ?? specifier.name.text,
        localName: specifier.name.text,
        typeOnly: clause.isTypeOnly || specifier.isTypeOnly,
        file: normalize(file),
        line: source.getLineAndCharacterOfPosition(specifier.getStart(source)).line + 1
      })
    }
  }
  return imports
}

function walkSourceFiles (root) {
  const sourceRoot = path.join(root, packagePath, 'src')
  if (!fs.existsSync(sourceRoot)) return []
  const files = []
  function visit (directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(target)
      else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(normalize(path.relative(path.join(root, packagePath), target)))
    }
  }
  visit(sourceRoot)
  return files.sort()
}

function capabilitiesForFile (document, file) {
  return Object.entries(document.capabilities ?? {}).filter(([, capability]) => Array.isArray(capability.owners) && capability.owners.some(owner => matchesOwner(owner, file)))
}

function matchesOwner (pattern, file) {
  if (typeof pattern !== 'string') return false
  const expression = '^' + normalize(pattern).split(/(\*\*|\*)/).map(part => part === '**' ? '.*' : part === '*' ? '[^/]*' : escapeRegExp(part)).join('') + '$'
  return new RegExp(expression).test(normalize(file))
}

function upstreamAreasFor (symbol) {
  if (symbol === 'Client') return ['clients']
  if (symbol.endsWith('Client')) return [`clients.${symbol.slice(0, -'Client'.length).toLowerCase()}`]
  if (symbol === 'ChannelData') return ['models.channel-data']
  if (symbol === 'ChannelInfo') return ['models.channel-data.channel-info']
  if (symbol === 'TeamInfo') return ['models.channel-data.team-info']
  if (symbol.startsWith('Meeting')) return ['models.meeting']
  if (symbol.startsWith('MessagingExtension')) return ['models.messaging-extension']
  if (symbol.startsWith('TaskModule')) return ['models.task-module']
  if (symbol.startsWith('File')) return ['models.file']
  if (symbol.startsWith('Config')) return ['models.config']
  return []
}

function usageFiles (manifest) { return new Set((manifest.usages ?? []).flatMap(usage => usage.files ?? []).map(normalize)) }
function isCapabilitiesRecord (value) { return value && typeof value === 'object' && !Array.isArray(value) }
function hasModifier (node, kind) { return Boolean(ts.getModifiers(node)?.some(modifier => modifier.kind === kind)) }
function normalize (value) { return String(value).replaceAll('\\', '/').replace(/^\.\//, '') }
function escapeRegExp (value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function add (findings, kind, file, message, fix, subject, line = 0) {
  const ruleId = {
    'usage-stale': 'compat/teams-api-usage-manifest-stale',
    'usage-review': 'compat/teams-api-usage-review-missing',
    'capabilities-stale': 'compat/teams-api-capabilities-stale',
    'capabilities-review': 'compat/teams-api-capabilities-review-missing'
  }[kind]
  findings.push({ ruleId, path: normalize(file), message, fix, line, column: line > 0 ? 1 : 0, ...(subject ? { subject } : {}) })
}
