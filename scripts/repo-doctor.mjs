// @ts-check

import fs from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { fileURLToPath } from 'node:url'

const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage'])
const ignoredDocumentPrefixes = ['compat/', 'packages/agents-hosting-dialogs/vendor/']
const workspaceRoots = ['packages', 'test-agents']

export const ruleDefinitions = {
  'repository/root-private': {
    what: 'The root manifest is private.',
    why: 'Protects the repository-wide contract used by contributors and CI.',
    fix: 'Set "private": true in the root package.json.',
  },
  'repository/root-module-type': {
    what: 'The root manifest declares ESM.',
    why: 'Protects the repository-wide contract used by contributors and CI.',
    fix: 'Set "type": "module" in the root package.json.',
  },
  'repository/root-metadata-invalid': {
    what: 'Required root metadata is valid.',
    why: 'Protects the repository-wide contract used by contributors and CI.',
    fix: 'Restore the required non-empty root metadata used as the workspace canonical value.',
  },
  'repository/doctor-script-missing': {
    what: 'The repo:doctor command invokes the Doctor entry point.',
    why: 'Protects the repository-wide contract used by contributors and CI.',
    fix: 'Set scripts.repo:doctor to "node scripts/repo-doctor.mjs".',
  },
  'repository/doctor-ci-missing': {
    what: 'Primary CI runs Repo Doctor before the build.',
    why: 'Protects the repository-wide contract used by contributors and CI.',
    fix: 'Run npm run repo:doctor after install and before build in the primary CI pipeline.',
  },
  'scripts/implicit-hook-disallowed': {
    what: 'An authored manifest has an implicit pre/post npm hook.',
    why: 'npm --ignore-scripts skips implicit hooks; explicit commands remain reliable and limit supply-chain execution paths.',
    fix: 'Move the command into an explicitly invoked script and remove the implicit npm lifecycle hook.',
  },
  'scripts/install-hook-disallowed': {
    what: 'An authored manifest has an install-time npm lifecycle hook.',
    why: 'npm --ignore-scripts skips install hooks; explicit commands remain reliable and limit supply-chain execution paths.',
    fix: 'Remove install-time lifecycle hooks; use an explicitly invoked, reviewed setup command instead.',
  },
  'workspace/pattern-missing': {
    what: 'Root workspaces include every required package root.',
    why: 'Keeps workspace discovery, versioning, and local dependencies predictable.',
    fix: 'Add the missing workspace root pattern to package.json workspaces.',
  },
  'workspace/unlisted': {
    what: 'Each discovered package is matched by a workspace pattern.',
    why: 'Keeps workspace discovery, versioning, and local dependencies predictable.',
    fix: 'Add a workspace pattern that includes this package.json.',
  },
  'workspace/manifest-missing': {
    what: 'Each publishable package directory has a manifest.',
    why: 'Keeps workspace discovery, versioning, and local dependencies predictable.',
    fix: 'Create package.json for the publishable package directory.',
  },
  'workspace/name-missing': {
    what: 'Each workspace has a package name.',
    why: 'Keeps workspace discovery, versioning, and local dependencies predictable.',
    fix: 'Set "name" to a unique workspace package name.',
  },
  'workspace/name-duplicate': {
    what: 'Workspace package names are unique.',
    why: 'Keeps workspace discovery, versioning, and local dependencies predictable.',
    fix: 'Rename one package and update its dependent workspace manifests.',
  },
  'workspace/version-mismatch': {
    what: 'Workspace versions match the root version.',
    why: 'Keeps workspace discovery, versioning, and local dependencies predictable.',
    fix: 'Set "version" to the version declared by the root package.json.',
  },
  'workspace/internal-dependency-invalid': {
    what: 'Internal dependencies use the declared local package name.',
    why: 'Keeps workspace discovery, versioning, and local dependencies predictable.',
    fix: 'Point the dependency at the local workspace with the declared package name.',
  },
  'workspace/internal-dependency-missing': {
    what: 'Internal dependencies resolve to a local workspace.',
    why: 'Keeps workspace discovery, versioning, and local dependencies predictable.',
    fix: 'Add the missing SDK workspace or use the intended external package name.',
  },
  'build/duplicate-reference': {
    what: 'The TypeScript build graph has no duplicate references.',
    why: 'Keeps the TypeScript build graph complete and correctly ordered.',
    fix: 'Remove the duplicate project reference.',
  },
  'build/missing-reference': {
    what: 'Each workspace project appears in the build graph.',
    why: 'Keeps the TypeScript build graph complete and correctly ordered.',
    fix: 'Add the workspace path to the references array.',
  },
  'build/orphan-reference': {
    what: 'Each build reference targets an existing workspace project.',
    why: 'Keeps the TypeScript build graph complete and correctly ordered.',
    fix: 'Remove the reference or restore the matching workspace project.',
  },
  'build/dependency-order': {
    what: 'Dependencies precede consumers in the build graph.',
    why: 'Keeps the TypeScript build graph complete and correctly ordered.',
    fix: 'Move the dependency reference before the dependent workspace reference.',
  },
  'package/metadata-missing': {
    what: 'Publishable packages include required npm metadata.',
    why: 'Keeps published packages consumable and consistent.',
    fix: 'Copy the field from a comparable publishable package and adapt its value.',
  },
  'package/metadata-invalid': {
    what: 'Required npm metadata has the expected shape.',
    why: 'Keeps published packages consumable and consistent.',
    fix: 'Replace the field with a non-empty value of the expected type.',
  },
  'package/name-path-mismatch': {
    what: 'The package name matches its directory convention.',
    why: 'Keeps published packages consumable and consistent.',
    fix: 'Set "name" to @microsoft/<package-directory>.',
  },
  'package/shared-metadata-mismatch': {
    what: 'Shared package metadata matches the root value.',
    why: 'Keeps published packages consumable and consistent.',
    fix: 'Replace the value with the canonical root package.json value.',
  },
  'runtime/engine-mismatch': {
    what: 'Package engines.node matches the root Node range.',
    why: 'Keeps local, CI, container, and type-level runtime support aligned.',
    fix: 'Replace engines.node with the root package Node range.',
  },
  'package/private': {
    what: 'Publishable packages are not marked private.',
    why: 'Keeps published packages consumable and consistent.',
    fix: 'Remove private: true so npm can publish the package.',
  },
  'package/export-incomplete': {
    what: 'Package exports include import, require, types, and package metadata.',
    why: 'Keeps published packages consumable and consistent.',
    fix: 'Declare root import, require, and types exports plus the package.json export.',
  },
  'package/export-target-invalid': {
    what: 'Export targets are safe files included in the published package.',
    why: 'Keeps published packages consumable and consistent.',
    fix: 'Use a safe relative export target included by the package files list.',
  },
  'package/readme-missing': {
    what: 'Publishable packages include a README.',
    why: 'Keeps published packages consumable and consistent.',
    fix: 'Create README.md with installation and usage guidance.',
  },
  'package/readme-heading': {
    what: 'The README begins with the exact package name.',
    why: 'Keeps published packages consumable and consistent.',
    fix: 'Replace the first heading with the exact package name.',
  },
  'package/main-export-mismatch': {
    what: 'The main entry matches the resolved CommonJS export.',
    why: 'Keeps published packages consumable and consistent.',
    fix: 'Replace main with the resolved CommonJS/default export target.',
  },
  'package/types-export-mismatch': {
    what: 'The types entry matches the exported declarations.',
    why: 'Keeps published packages consumable and consistent.',
    fix: 'Replace types with the exported declaration target.',
  },
  'test-agent/not-private': {
    what: 'Test-agent manifests are private.',
    why: 'Keeps test agents reproducible for contributors and automation.',
    fix: 'Set "private": true to prevent accidental publication.',
  },
  'test-agent/script-missing': {
    what: 'Test agents provide required npm scripts.',
    why: 'Keeps test agents reproducible for contributors and automation.',
    fix: 'Add the required script under package.json scripts.',
  },
  'test-agent/script-invalid': {
    what: 'Test-agent build, start, and main agree on one entry point.',
    why: 'Keeps test agents reproducible for contributors and automation.',
    fix: 'Align build, start, and main with the test-agent entrypoint.',
  },
  'test-agent/tsconfig-invalid': {
    what: 'Test-agent tsconfig extends the root config and emits src to dist.',
    why: 'Keeps test agents reproducible for contributors and automation.',
    fix: 'Extend ../../tsconfig.json and emit src into dist.',
  },
  'test-agent/tsconfig-missing': {
    what: 'Test agents provide the required tsconfig.',
    why: 'Keeps test agents reproducible for contributors and automation.',
    fix: 'Create tsconfig.json extending ../../tsconfig.json.',
  },
  'test-agent/readme-missing': {
    what: 'Test agents include operational documentation.',
    why: 'Keeps test agents reproducible for contributors and automation.',
    fix: 'Create README.md describing purpose, configuration, and startup.',
  },
  'test-agent/env-template-missing': {
    what: 'Test agents include an environment template.',
    why: 'Keeps test agents reproducible for contributors and automation.',
    fix: 'Create env.TEMPLATE containing every environment key used by the agent.',
  },
  'test-agent/env-key-missing': {
    what: 'The environment template declares every used key.',
    why: 'Keeps test agents reproducible for contributors and automation.',
    fix: 'Add the required environment key to env.TEMPLATE.',
  },
  'test-agent/env-key-duplicate': {
    what: 'Environment template keys are declared once.',
    why: 'Keeps test agents reproducible for contributors and automation.',
    fix: 'Keep one declaration for each environment key.',
  },
  'test-agent/dockerfile-missing': {
    what: 'Docker scripts point to an existing Dockerfile.',
    why: 'Keeps test agents reproducible for contributors and automation.',
    fix: 'Add the Dockerfile used by the docker script or remove the script.',
  },
  'test-agent/docker-script-missing': {
    what: 'Dockerfiles have matching explicit bundle and docker commands.',
    why: 'Keeps test agents reproducible for contributors and automation.',
    fix: 'Add explicit bundle and docker scripts for the Dockerfile.',
  },
  'test-agent/docker-artifact-mismatch': {
    what: 'The bundle output matches Docker COPY and CMD paths.',
    why: 'Keeps test agents reproducible for contributors and automation.',
    fix: 'Align the bundle outfile with Dockerfile COPY and CMD.',
  },
  'docs/package-catalog-heading-missing': {
    what: 'README contains the Packages Overview section.',
    why: 'Keeps repository documentation accurate and navigable.',
    fix: 'Add a "## Packages Overview" section containing the package table.',
  },
  'docs/package-catalog-missing': {
    what: 'Each publishable package appears in Packages Overview.',
    why: 'Keeps repository documentation accurate and navigable.',
    fix: 'Add a package row under Packages Overview.',
  },
  'docs/package-catalog-orphan': {
    what: 'Packages Overview has no stale package entries.',
    why: 'Keeps repository documentation accurate and navigable.',
    fix: 'Remove the stale row or restore the matching publishable package.',
  },
  'docs/test-agent-catalog-heading-missing': {
    what: 'README contains the Test-agent catalog section.',
    why: 'Keeps repository documentation accurate and navigable.',
    fix: 'Add a "## Test-agent catalog" section containing linked agent entries.',
  },
  'docs/test-agent-catalog-missing': {
    what: 'Each test agent appears in the catalog.',
    why: 'Keeps repository documentation accurate and navigable.',
    fix: 'Add a linked entry under Test-agent catalog.',
  },
  'docs/test-agent-catalog-orphan': {
    what: 'The test-agent catalog has no stale entries.',
    why: 'Keeps repository documentation accurate and navigable.',
    fix: 'Remove the stale entry or restore the matching test-agent directory.',
  },
  'docs/unexported-import': {
    what: 'Documentation imports only exported package subpaths.',
    why: 'Keeps repository documentation accurate and navigable.',
    fix: 'Choose a package subpath declared in package.json exports.',
  },
  'docs/relative-link-missing': {
    what: 'Documentation relative links resolve inside the repository.',
    why: 'Keeps repository documentation accurate and navigable.',
    fix: 'Update the link to an existing repository-relative file or directory.',
  },
  'compat/baseline-directory-missing': {
    what: 'The API compatibility baseline directory exists.',
    why: 'Keeps public API compatibility checks complete and attributable.',
    fix: 'Create compat/baseline and generate API reports with npm run compat -- --local.',
  },
  'compat/baseline-missing': {
    what: 'Each publishable package has an API baseline.',
    why: 'Keeps public API compatibility checks complete and attributable.',
    fix: 'Generate the package API report with npm run compat -- --local.',
  },
  'compat/baseline-orphan': {
    what: 'API baselines belong to an existing package.',
    why: 'Keeps public API compatibility checks complete and attributable.',
    fix: 'Remove the stale API report or restore its package.',
  },
  'compat/baseline-name-mismatch': {
    what: 'The API baseline header matches its package name.',
    why: 'Keeps public API compatibility checks complete and attributable.',
    fix: 'Regenerate the API report so its header matches the package name.',
  },
  'runtime/toolchain-mismatch': {
    what: 'Configured Node versions match the .nvmrc major.',
    why: 'Keeps local, CI, container, and type-level runtime support aligned.',
    fix: 'Replace the configured version with the .nvmrc major.',
  },
  'runtime/unpinned-image': {
    what: 'Node container images use major-pinned tags.',
    why: 'Keeps local, CI, container, and type-level runtime support aligned.',
    fix: 'Replace the floating tag with a major-pinned Node image.',
  },
  'runtime/unsupported-image': {
    what: 'Node container image majors are supported by engines.node.',
    why: 'Keeps local, CI, container, and type-level runtime support aligned.',
    fix: 'Replace the image with a Node major allowed by engines.node.',
  },
  'runtime/node-types-unsupported': {
    what: '@types/node supports the minimum Node major.',
    why: 'Keeps local, CI, container, and type-level runtime support aligned.',
    fix: 'Use @types/node for the minimum supported Node major.',
  },
}

const ruleCategories = {
  repository: 'Repository',
  scripts: 'Scripts and supply chain',
  workspace: 'Workspaces',
  build: 'Build graph',
  package: 'Published packages',
  runtime: 'Runtime and toolchain',
  'test-agent': 'Test agents',
  docs: 'Documentation',
  compat: 'API compatibility',
}

/** @typedef {{ ruleId: keyof typeof ruleDefinitions, message: string, fix: string, path: string, line: number, column: number, subject?: string }} Finding */

/**
 * Runs the repository consistency checks without modifying the checkout.
 * @param {string} root
 */
export function checkRepository (root) {
  const normalizedRoot = path.resolve(root)
  const rootManifestFile = 'package.json'
  const rootManifestText = readRequiredText(normalizedRoot, rootManifestFile)
  const rootManifest = parseJson(rootManifestFile, rootManifestText)
  const workspacePatterns = Array.isArray(rootManifest.workspaces) ? rootManifest.workspaces : rootManifest.workspaces?.packages
  if (!Array.isArray(workspacePatterns) || workspacePatterns.some(pattern => typeof pattern !== 'string')) {
    throw new DoctorConfigurationError(rootManifestFile, 'Root package.json must declare a workspaces array of strings.')
  }

  /** @type {Finding[]} */
  const findings = []
  checkRepositoryConfiguration(normalizedRoot, rootManifest, rootManifestText, workspacePatterns, findings)
  checkScriptPolicies(rootManifest, rootManifestText, rootManifestFile, findings)

  const packageDirectories = childDirectories(normalizedRoot, 'packages')
  const testAgentDirectories = childDirectories(normalizedRoot, 'test-agents')
  const packages = []
  for (const directory of packageDirectories) {
    const manifestFile = `${directory}/package.json`
    if (!fs.existsSync(path.join(normalizedRoot, manifestFile))) {
      add(findings, 'workspace/manifest-missing', manifestFile, 'Publishable package directory has no package.json.', 0, directory)
      continue
    }
    packages.push(createWorkspace(normalizedRoot, manifestFile))
  }
  const testAgents = testAgentDirectories
    .filter(directory => fs.existsSync(path.join(normalizedRoot, directory, 'package.json')))
    .map(directory => createWorkspace(normalizedRoot, `${directory}/package.json`))
  const catalogAgents = testAgentDirectories
    .filter(directory => fs.existsSync(path.join(normalizedRoot, directory, 'package.json')) || fs.existsSync(path.join(normalizedRoot, directory, 'README.md')))
    .map(directory => ({ path: directory, name: path.posix.basename(directory) }))
  const manifests = [...packages, ...testAgents].sort(byPath)
  for (const workspace of manifests) {
    if (!isWorkspacePath(workspace.path, workspacePatterns)) {
      const location = jsonPropertyLocation(rootManifestText, 'workspaces')
      add(findings, 'workspace/unlisted', rootManifestFile, 'Workspace package.json is not included by the root workspace patterns.', location.line, workspace.path, location.column, `Add a workspace pattern that includes "${workspace.path}".`)
    }
  }
  const documents = walk(normalizedRoot, file => file.endsWith('.md'))
    .map(file => relative(normalizedRoot, file))
    .filter(file => !ignoredDocumentPrefixes.some(prefix => file.startsWith(prefix)) && !file.includes('/test/'))
    .sort()

  checkWorkspaceManifests(packages, testAgents, rootManifest, findings)
  for (const workspace of manifests) checkScriptPolicies(workspace.manifest, workspace.text, `${workspace.path}/package.json`, findings)
  const workspaceManifestFiles = new Set(manifests.map(workspace => `${workspace.path}/package.json`))
  for (const manifestFile of walk(normalizedRoot, file => path.basename(file) === 'package.json').map(file => relative(normalizedRoot, file)).filter(file => file !== rootManifestFile && !workspaceManifestFiles.has(file))) {
    const manifestText = readRequiredText(normalizedRoot, manifestFile)
    checkScriptPolicies(parseJson(manifestFile, manifestText), manifestText, manifestFile, findings)
  }
  const buildReferences = checkBuildReferences(normalizedRoot, manifests, findings)
  checkPackages(normalizedRoot, packages, rootManifest, findings)
  checkTestAgents(normalizedRoot, testAgents, findings)
  checkInternalDependencies(normalizedRoot, manifests, buildReferences, findings)
  checkCatalogs(normalizedRoot, packages, catalogAgents, findings)
  checkDocumentationImports(normalizedRoot, documents, packages, findings)
  checkRelativeDocumentationLinks(normalizedRoot, documents, findings)
  checkCompatibilityBaselines(normalizedRoot, packages, findings)
  checkRuntimeConfiguration(normalizedRoot, rootManifest, findings)

  findings.sort((left, right) => left.path.localeCompare(right.path) ||
    left.line - right.line ||
    left.column - right.column ||
    left.ruleId.localeCompare(right.ruleId))

  return {
    status: findings.length > 0 ? 'fail' : 'pass',
    inventory: {
      packages: packages.map(workspace => ({ name: workspace.manifest.name, path: workspace.path })),
      testAgents: catalogAgents,
      documentCount: documents.length,
    },
    summary: {
      errors: findings.length,
    },
    findings,
  }
}

/** @param {string[]} argv */
export function parseArguments (argv) {
  let root = process.cwd()
  let rules = false
  const ruleIds = []
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') return { help: true }
    if (argument === '--rules') {
      rules = true
      while (argv[index + 1] && !argv[index + 1].startsWith('-')) ruleIds.push(argv[++index])
      continue
    }
    if (argument === '--root') {
      root = argv[++index]
      if (!root) throw new DoctorConfigurationError('scripts/repo-doctor.mjs', '--root requires a path.')
      continue
    }
    throw new DoctorConfigurationError('scripts/repo-doctor.mjs', `Unknown argument: ${argument}`)
  }
  for (const ruleId of ruleIds) {
    if (!Object.hasOwn(ruleDefinitions, ruleId)) throw new DoctorConfigurationError('scripts/repo-doctor.mjs', `Unknown rule ID: ${ruleId}`)
  }
  return { help: false, rules, ruleIds, root }
}

/**
 * Formats the stable, ESLint-style report shared by humans and AI agents.
 * @param {ReturnType<typeof checkRepository>} report
 * @param {{ color?: boolean }} [options]
 */
export function formatReport (report, options = {}) {
  const color = options.color ?? supportsColor(process.stdout)
  if (report.findings.length === 0) {
    return style(`✓ No repository errors found — ${report.inventory.packages.length} packages, ${report.inventory.testAgents.length} test agents, ${report.inventory.documentCount} documents checked`, 'green', color)
  }
  const lines = []
  const groups = new Map()
  for (const finding of report.findings) {
    const group = groups.get(finding.path) ?? []
    group.push(finding)
    groups.set(finding.path, group)
  }
  for (const [file, findings] of groups) {
    if (lines.length > 0) lines.push('')
    lines.push(style(file, 'heading', color))
    const messages = findings.map(finding => finding.subject ? `${finding.subject}: ${finding.message}` : finding.message)
    const messageWidth = Math.max(...messages.map(message => message.length))
    for (const [index, finding] of findings.entries()) {
      const location = formatLocation(finding.line, finding.column)
      const plainMessage = messages[index]
      const message = finding.subject ? `${style(finding.subject, 'cyan', color)}: ${finding.message}` : finding.message
      const ruleSpacing = ' '.repeat(messageWidth - plainMessage.length + 2)
      lines.push(`  ${location}  ${style('error', 'red', color)}  ${message}${ruleSpacing}${style(finding.ruleId, 'dim', color)}`)
      lines.push(style('           fix    ' + finding.fix, 'dim', color))
    }
  }
  const fileCount = groups.size
  lines.push('', style(`✖ ${report.summary.errors} repository error${report.summary.errors === 1 ? '' : 's'} across ${fileCount} file${fileCount === 1 ? '' : 's'}`, 'red', color))
  return lines.join('\n')
}

/** Formats the rule guide from the Doctor's rule metadata. */
export function formatRuleGuide (options = {}) {
  const color = options.color ?? supportsColor(process.stdout)
  const selectedRuleIds = options.ruleIds ?? []
  const lines = [
    style('Repo Doctor rules', 'heading', color),
    '',
    'Each rule shows what is checked, why it matters, and the usual fix.',
  ]
  for (const [category, title] of Object.entries(ruleCategories)) {
    const rules = Object.entries(ruleDefinitions).filter(([ruleId]) => ruleId.startsWith(`${category}/`) && (selectedRuleIds.length === 0 || selectedRuleIds.includes(ruleId)))
    if (rules.length === 0) continue
    const ruleWidth = Math.max(...rules.map(([ruleId]) => ruleId.length))
    lines.push('', style(title, 'heading', color))
    for (const [ruleId, definition] of rules) {
      const padding = ' '.repeat(ruleWidth - ruleId.length)
      lines.push(`  ${style(ruleId, 'cyan', color)}${padding}  ${definition.what}`)
      lines.push(style(`  ${' '.repeat(ruleWidth)}  why  ${definition.why}`, 'dim', color))
      lines.push(style(`  ${' '.repeat(ruleWidth)}  fix  ${definition.fix}`, 'dim', color))
    }
  }
  return lines.join('\n') + '\n'
}

function runCli () {
  try {
    const options = parseArguments(process.argv.slice(2))
    if (options.help) {
      console.log('Usage: npm run repo:doctor -- [--root <path>] [--rules [<rule-id>...]]')
      console.log('  --rules  List every rule, or selected rule IDs, with their purpose and typical resolution.')
      return
    }
    if (options.rules) {
      console.log(formatRuleGuide({ ruleIds: options.ruleIds }))
      return
    }
    const report = checkRepository(options.root)
    console.log(formatReport(report))
    process.exitCode = report.status === 'fail' ? 1 : 0
  } catch (error) {
    console.error(formatFailure(error))
    process.exitCode = 2
  }
}

function checkRepositoryConfiguration (root, manifest, manifestText, workspacePatterns, findings) {
  for (const field of ['name', 'version', 'license', 'homepage']) {
    if (typeof manifest[field] !== 'string' || manifest[field].trim() === '') {
      const location = jsonPropertyLocation(manifestText, field)
      add(findings, 'repository/root-metadata-invalid', 'package.json', `Root metadata field "${field}" must be a non-empty string.`, location.line, field, location.column, `Set "${field}" to the repository's canonical value.`)
    }
  }
  for (const field of ['repository', 'author', 'engines']) {
    if (!isNonEmptyObject(manifest[field])) {
      const location = jsonPropertyLocation(manifestText, field)
      add(findings, 'repository/root-metadata-invalid', 'package.json', `Root metadata field "${field}" must be a non-empty object.`, location.line, field, location.column, `Set "${field}" to a non-empty canonical object.`)
    }
  }
  const privateLocation = jsonPropertyLocation(manifestText, 'private')
  if (manifest.private !== true) add(findings, 'repository/root-private', 'package.json', 'Repository root package is publishable.', privateLocation.line, manifest.name, privateLocation.column)
  const typeLocation = jsonPropertyLocation(manifestText, 'type')
  if (manifest.type !== 'module') add(findings, 'repository/root-module-type', 'package.json', 'Repository root does not use the expected ES module mode.', typeLocation.line, manifest.name, typeLocation.column)
  const scriptLocation = jsonPropertyLocation(manifestText, 'repo:doctor')
  if (manifest.scripts?.['repo:doctor'] !== 'node scripts/repo-doctor.mjs') {
    add(findings, 'repository/doctor-script-missing', 'package.json', 'Root scripts do not expose the canonical repository doctor command.', scriptLocation.line, 'scripts.repo:doctor', scriptLocation.column)
  }
  for (const workspaceRoot of workspaceRoots) {
    const expected = `${workspaceRoot}/*`
    if (!workspacePatterns.includes(expected)) {
      const location = jsonPropertyLocation(manifestText, 'workspaces')
      add(findings, 'workspace/pattern-missing', 'package.json', 'Required workspace root pattern is absent.', location.line, expected, location.column, `Add "${expected}" to workspaces.`)
    }
  }
  for (const ciFile of ['.github/workflows/ci.yml', '.azdo/ci-pr.yaml']) {
    const fullPath = path.join(root, ciFile)
    if (!fs.existsSync(fullPath)) continue
    const text = fs.readFileSync(fullPath, 'utf8')
    if (!hasDoctorInExecutableCiSequence(ciFile, text)) {
      add(findings, 'repository/doctor-ci-missing', ciFile, 'Primary CI does not run the repository doctor after install and before build.', 0, undefined, 0, 'Add `npm run repo:doctor` after dependency installation and before the first build step.')
    }
  }
}

function checkScriptPolicies (manifest, manifestText, manifestFile, findings) {
  const scripts = manifest.scripts
  if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) return
  const installHooks = new Set(['preinstall', 'install', 'postinstall', 'preprepare', 'prepare', 'postprepare'])
  const standaloneHooks = new Set(['prepublish', 'prepublishOnly', 'postpublish', 'prepack', 'postpack', 'preversion', 'version', 'postversion', 'prestart', 'poststart', 'prestop', 'poststop', 'prerestart', 'postrestart', 'pretest', 'posttest', 'dependencies'])
  for (const scriptName of Object.keys(scripts)) {
    const location = jsonPropertyLocation(manifestText, scriptName)
    if (installHooks.has(scriptName)) {
      add(findings, 'scripts/install-hook-disallowed', manifestFile, `Install-time lifecycle script "${scriptName}" is disallowed.`, location.line, scriptName, location.column, `Remove scripts.${scriptName} and invoke its work from an explicit reviewed command.`)
      continue
    }
    const wrapper = /^(?:pre|post)(.+)$/.exec(scriptName)
    if (standaloneHooks.has(scriptName) || (wrapper && Object.hasOwn(scripts, wrapper[1]))) {
      add(findings, 'scripts/implicit-hook-disallowed', manifestFile, `Implicit npm lifecycle script "${scriptName}" is disallowed.`, location.line, scriptName, location.column, `Move scripts.${scriptName} into an explicitly invoked command, then remove scripts.${scriptName}.`)
    }
  }
}

function checkWorkspaceManifests (packages, testAgents, rootManifest, findings) {
  const names = new Set()
  for (const workspace of [...packages, ...testAgents]) {
    const manifestFile = `${workspace.path}/package.json`
    const nameLocation = jsonPropertyLocation(workspace.text, 'name')
    if (!workspace.manifest.name) add(findings, 'workspace/name-missing', manifestFile, 'Workspace package.json must declare a name.', nameLocation.line, undefined, nameLocation.column)
    if (workspace.manifest.name && names.has(workspace.manifest.name)) add(findings, 'workspace/name-duplicate', manifestFile, 'Workspace package names must be unique.', nameLocation.line, workspace.manifest.name, nameLocation.column)
    if (workspace.manifest.name) names.add(workspace.manifest.name)
    if (workspace.path.startsWith('packages/') && workspace.manifest.version !== rootManifest.version) {
      const location = jsonPropertyLocation(workspace.text, 'version')
      add(findings, 'workspace/version-mismatch', manifestFile, `Workspace version ${workspace.manifest.version} does not match root version ${rootManifest.version}.`, location.line, workspace.manifest.name, location.column, `Change "version" from "${workspace.manifest.version}" to "${rootManifest.version}".`)
    }
  }
}

function checkBuildReferences (root, workspaces, findings) {
  const file = 'tsconfig.build.json'
  const text = readRequiredText(root, file)
  const config = parseJson(file, text)
  if (!Array.isArray(config.references)) {
    throw new DoctorConfigurationError(file, 'tsconfig.build.json references must be an array.')
  }
  const references = []
  const referenceSet = new Set()
  const referenceLocations = new Map()
  const referenceOffsets = jsonArrayPropertyValueOffsets(text, 'references', 'path')
  for (const [index, reference] of config.references.entries()) {
    if (!reference || typeof reference !== 'object' || typeof reference.path !== 'string' || reference.path.trim() === '') {
      throw new DoctorConfigurationError(file, 'Every tsconfig.build.json reference must be an object with a non-empty path string.')
    }
    const referencePath = normalize(reference.path)
    const offset = referenceOffsets[index] ?? -1
    const location = offset >= 0 ? { line: lineAt(text, offset), column: columnAt(text, offset) } : { line: 0, column: 0 }
    if (referenceSet.has(referencePath)) {
      add(findings, 'build/duplicate-reference', file, 'Root build references contain the same workspace more than once.', location.line, referencePath, location.column, `Remove the duplicate { "path": "${referencePath}" } entry.`)
      continue
    }
    referenceSet.add(referencePath)
    referenceLocations.set(referencePath, location)
    references.push(referencePath)
  }
  const projects = workspaces.filter(workspace => fs.existsSync(path.join(root, workspace.path, 'tsconfig.json')))
  const requiredProjects = projects.filter(workspace => workspace.path.startsWith('packages/'))
  for (const workspace of requiredProjects) {
    if (!referenceSet.has(workspace.path)) {
      const location = jsonPropertyLocation(text, 'references')
      add(findings, 'build/missing-reference', file, 'Workspace has tsconfig.json but is absent from the root build references.', location.line, workspace.path, location.column, `Add { "path": "${workspace.path}" } to references.`)
    }
  }
  for (const reference of references) {
    if (!projects.some(workspace => workspace.path === reference)) {
      const location = referenceLocations.get(reference) ?? { line: 0, column: 0 }
      add(findings, 'build/orphan-reference', file, 'Root build reference does not resolve to a workspace TypeScript project.', location.line, reference, location.column, `Remove { "path": "${reference}" } or restore that workspace project.`)
    }
  }
  return references
}

function checkPackages (root, packages, rootManifest, findings) {
  const requiredStrings = ['name', 'version', 'description', 'license', 'homepage', 'main', 'types']
  for (const workspace of packages) {
    const manifest = workspace.manifest
    const manifestFile = `${workspace.path}/package.json`
    const invalidFields = new Set()
    for (const field of requiredStrings) {
      const location = jsonPropertyLocation(workspace.text, field)
      if (manifest[field] === undefined) {
        invalidFields.add(field)
        add(findings, 'package/metadata-missing', manifestFile, `Publishable package is missing required metadata field "${field}".`, location.line, manifest.name, location.column, `Add a non-empty "${field}" value to package.json.`)
      } else if (typeof manifest[field] !== 'string' || manifest[field].trim() === '') {
        invalidFields.add(field)
        add(findings, 'package/metadata-invalid', manifestFile, `Package metadata field "${field}" must be a non-empty string.`, location.line, manifest.name, location.column, `Replace "${field}" with a non-empty string.`)
      }
    }
    for (const field of ['repository', 'author']) {
      const location = jsonPropertyLocation(workspace.text, field)
      if (manifest[field] === undefined) {
        invalidFields.add(field)
        add(findings, 'package/metadata-missing', manifestFile, `Publishable package is missing required metadata field "${field}".`, location.line, manifest.name, location.column, `Copy "${field}" from the root package.json.`)
      } else if (!isNonEmptyObject(manifest[field])) {
        invalidFields.add(field)
        add(findings, 'package/metadata-invalid', manifestFile, `Package metadata field "${field}" must be a non-empty object.`, location.line, manifest.name, location.column, `Replace "${field}" with ${JSON.stringify(rootManifest[field])}.`)
      }
    }
    const filesLocation = jsonPropertyLocation(workspace.text, 'files')
    if (manifest.files === undefined) {
      invalidFields.add('files')
      add(findings, 'package/metadata-missing', manifestFile, 'Publishable package is missing required metadata field "files".', filesLocation.line, manifest.name, filesLocation.column, 'Add a non-empty "files" array containing the published output.')
    } else if (!Array.isArray(manifest.files) || manifest.files.length === 0 || manifest.files.some(file => typeof file !== 'string' || file.trim() === '')) {
      invalidFields.add('files')
      add(findings, 'package/metadata-invalid', manifestFile, 'Package files must be a non-empty array of paths.', filesLocation.line, manifest.name, filesLocation.column, 'Replace "files" with a non-empty array of published paths.')
    }
    const expectedName = `@microsoft/${path.posix.basename(workspace.path)}`
    if (manifest.name && manifest.name !== expectedName) {
      const location = jsonPropertyLocation(workspace.text, 'name')
      add(findings, 'package/name-path-mismatch', manifestFile, `Package name must match directory name (${expectedName}).`, location.line, manifest.name, location.column, `Change "name" from "${manifest.name}" to "${expectedName}".`)
    }
    for (const field of ['license', 'homepage', 'repository', 'author']) {
      if (!invalidFields.has(field) && manifest[field] !== undefined && rootManifest[field] !== undefined && !isDeepStrictEqual(manifest[field], rootManifest[field])) {
        const location = jsonPropertyLocation(workspace.text, field)
        add(findings, 'package/shared-metadata-mismatch', manifestFile, `Package ${field} must match the root manifest.`, location.line, manifest.name, location.column, `Change "${field}" to ${JSON.stringify(rootManifest[field])}.`)
      }
    }
    if (!isNonEmptyObject(manifest.engines)) {
      const location = jsonPropertyLocation(workspace.text, 'engines')
      add(findings, 'package/metadata-invalid', manifestFile, 'Package engines must be a non-empty object.', location.line, manifest.name, location.column, `Set "engines" to ${JSON.stringify(rootManifest.engines)}.`)
    }
    if (manifest.engines?.node !== rootManifest.engines?.node) {
      const location = jsonPropertyLocation(workspace.text, 'node')
      add(findings, 'runtime/engine-mismatch', manifestFile, `Package Node engine must match root engine ${rootManifest.engines?.node}.`, location.line, manifest.name, location.column, `Change engines.node from "${manifest.engines?.node}" to "${rootManifest.engines?.node}".`)
    }
    if (manifest.private === true) {
      const location = jsonPropertyLocation(workspace.text, 'private')
      add(findings, 'package/private', manifestFile, 'Publishable SDK package is marked private.', location.line, manifest.name, location.column)
    }
    const readme = path.join(root, workspace.path, 'README.md')
    if (!fs.existsSync(readme)) {
      add(findings, 'package/readme-missing', `${workspace.path}/README.md`, 'Publishable package must include README.md.', 0, manifest.name)
    } else {
      const readmeText = fs.readFileSync(readme, 'utf8')
      const headingMatch = /^#\s+(.+)$/m.exec(readmeText)
      const heading = headingMatch?.[1]?.trim()
      if (heading !== manifest.name) {
        const location = headingMatch ? { line: lineAt(readmeText, headingMatch.index), column: columnAt(readmeText, headingMatch.index) } : { line: 0, column: 0 }
        const replacement = heading ? `Replace "# ${heading}" with "# ${manifest.name}".` : `Add "# ${manifest.name}" as the first heading.`
        add(findings, 'package/readme-heading', relative(root, readme), 'Package README first heading must equal the package name.', location.line, manifest.name, location.column, replacement)
      }
    }
    checkPackageExports(workspace, invalidFields, findings)
  }
}

function checkTestAgents (root, testAgents, findings) {
  for (const workspace of testAgents) {
    const manifest = workspace.manifest
    const directory = path.join(root, workspace.path)
    const manifestFile = `${workspace.path}/package.json`
    if (manifest.private !== true) {
      const location = jsonPropertyLocation(workspace.text, 'private')
      add(findings, 'test-agent/not-private', manifestFile, 'Test-agent workspace is publishable.', location.line, manifest.name, location.column)
    }
    for (const script of ['build', 'start']) {
      if (!manifest.scripts?.[script]) {
        const location = jsonPropertyLocation(workspace.text, 'scripts')
        const value = script === 'build' ? 'tsc --build' : `npm run build && node --env-file .env ${manifest.main ?? './dist/index.js'}`
        add(findings, 'test-agent/script-missing', manifestFile, `Test-agent workspace must define a ${script} script.`, location.line, manifest.name, location.column, `Add "scripts.${script}": "${value}".`)
      }
    }
    if (manifest.scripts?.build && manifest.scripts.build !== 'tsc --build') {
      const location = jsonPropertyLocation(workspace.text, 'build')
      add(findings, 'test-agent/script-invalid', manifestFile, 'Test-agent build script does not use the repository build convention.', location.line, manifest.name, location.column, 'Change scripts.build to "tsc --build".')
    }
    const startScript = manifest.scripts?.start
    const startTarget = scriptJavaScriptTarget(startScript)
    if (typeof startScript === 'string' && (typeof manifest.main !== 'string' || !isCanonicalStartScript(startScript) || !startTarget || normalize(startTarget) !== normalize(manifest.main))) {
      const location = jsonPropertyLocation(workspace.text, 'start')
      add(findings, 'test-agent/script-invalid', manifestFile, 'Test-agent start script must explicitly build, load .env with Node, and launch package.json main.', location.line, manifest.name, location.column, `Change scripts.start to "npm run build && node --env-file .env ${manifest.main ?? './dist/index.js'}".`)
    }
    const tsconfigFile = `${workspace.path}/tsconfig.json`
    if (!fs.existsSync(path.join(root, tsconfigFile))) {
      add(findings, 'test-agent/tsconfig-missing', tsconfigFile, 'Test-agent workspace must include tsconfig.json.', 0, manifest.name)
    } else {
      const tsconfigText = readRequiredText(root, tsconfigFile)
      const tsconfig = parseJson(tsconfigFile, tsconfigText)
      for (const [field, actual, expected] of [
        ['extends', tsconfig.extends, '../../tsconfig.json'],
        ['rootDir', tsconfig.compilerOptions?.rootDir, 'src'],
        ['outDir', tsconfig.compilerOptions?.outDir, 'dist'],
      ]) {
        if (normalize(actual ?? '') !== expected) {
          const location = jsonPropertyLocation(tsconfigText, field)
          add(findings, 'test-agent/tsconfig-invalid', tsconfigFile, `Test-agent tsconfig ${field} does not match the repository layout.`, location.line, manifest.name, location.column, `Set "${field}" to "${expected}".`)
        }
      }
    }
    if (typeof manifest.main === 'string' && normalize(manifest.main).startsWith('dist/')) {
      const source = normalize(manifest.main).replace(/^dist\//, 'src/').replace(/\.(?:cjs|mjs|js)$/, '.ts')
      if (!fs.existsSync(path.join(directory, source))) {
        const location = jsonPropertyLocation(workspace.text, 'main')
        add(findings, 'test-agent/script-invalid', manifestFile, 'Test-agent main output has no corresponding TypeScript source entrypoint.', location.line, manifest.name, location.column, `Create "${source}" or change main and start to the emitted entrypoint.`)
      }
    }
    if (!fs.existsSync(path.join(directory, 'README.md'))) add(findings, 'test-agent/readme-missing', `${workspace.path}/README.md`, 'Test-agent workspace must include README.md.', 0, manifest.name)
    const envTemplate = path.join(directory, 'env.TEMPLATE')
    if (manifest.scripts?.start?.includes('--env-file') && !fs.existsSync(envTemplate)) {
      add(findings, 'test-agent/env-template-missing', `${workspace.path}/env.TEMPLATE`, 'Agent start script loads .env but env.TEMPLATE is missing.', 0, manifest.name)
    } else if (fs.existsSync(envTemplate)) {
      checkEnvironmentTemplate(root, workspace, envTemplate, findings)
    }
    checkDockerLifecycle(root, workspace, findings)
  }
}

function checkCatalogs (root, packages, catalogAgents, findings) {
  const rootReadme = readRequiredText(root, 'README.md')
  const packageCatalog = markdownSection(rootReadme, 'Packages Overview')
  if (!packageCatalog) {
    add(findings, 'docs/package-catalog-heading-missing', 'README.md', 'Package catalog heading is missing.', 0, 'Packages Overview')
  } else {
    const entries = packageTableEntries(packageCatalog.text)
    const expected = new Map(packages.map(workspace => [workspace.manifest.name, workspace]))
    for (const workspace of packages) {
      if (!entries.has(workspace.manifest.name)) {
        add(findings, 'docs/package-catalog-missing', 'README.md', 'Missing from the package catalog.', packageCatalog.line, workspace.manifest.name, packageCatalog.column, `Add a table row for ${workspace.manifest.name} under Packages Overview.`)
      }
    }
    for (const [entry, offset] of entries) {
      if (!expected.has(entry)) {
        const absoluteOffset = packageCatalog.offset + offset
        add(findings, 'docs/package-catalog-orphan', 'README.md', 'Package catalog entry has no matching publishable package.', lineAt(rootReadme, absoluteOffset), entry, columnAt(rootReadme, absoluteOffset), `Remove the row for ${entry} or restore its package directory.`)
      }
    }
  }

  const agentsFile = 'test-agents/README.md'
  const agentsReadme = readRequiredText(root, agentsFile)
  const testAgentCatalog = markdownSection(agentsReadme, 'Test-agent catalog')
  if (!testAgentCatalog) {
    add(findings, 'docs/test-agent-catalog-heading-missing', agentsFile, 'Test-agent catalog heading is missing.', 0, 'Test-agent catalog')
    return
  }
  const entries = testAgentLinkEntries(testAgentCatalog.text)
  const expected = new Map(catalogAgents.map(agent => [path.posix.basename(agent.path), agent]))
  for (const agent of catalogAgents) {
    const directory = path.posix.basename(agent.path)
    if (!entries.has(directory)) {
      add(findings, 'docs/test-agent-catalog-missing', agentsFile, 'Missing from the test-agent catalog.', testAgentCatalog.line, agent.path, testAgentCatalog.column, `Add [${directory}](${directory}) to the catalog.`)
    }
  }
  for (const [entry, offset] of entries) {
    if (!expected.has(entry)) {
      const absoluteOffset = testAgentCatalog.offset + offset
      add(findings, 'docs/test-agent-catalog-orphan', agentsFile, 'Test-agent catalog entry has no matching directory.', lineAt(agentsReadme, absoluteOffset), entry, columnAt(agentsReadme, absoluteOffset), `Remove [${entry}](${entry}) or restore test-agents/${entry}.`)
    }
  }
}

function checkDocumentationImports (root, documents, packages, findings) {
  const packageExports = new Map(packages.map(workspace => [workspace.manifest.name, workspace.manifest.exports ?? {}]))
  for (const document of documents) {
    const fullPath = path.join(root, document)
    const text = fs.readFileSync(fullPath, 'utf8')
    const fences = text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)
    for (const fence of fences) {
      const code = fence[1]
      const fenceOffset = fence.index ?? 0
      const codeOffset = fenceOffset + fence[0].indexOf(code)
      for (const match of code.matchAll(/(?:from\s*|require\(\s*|import\(\s*|^\s*import\s*)['"](@microsoft\/agents-[^/'"]+)(\/[^'"]+)?['"]/gm)) {
        const packageName = match[1]
        const subpath = match[2] ?? ''
        const exports = packageExports.get(packageName)
        const exportKey = subpath ? `.${subpath}` : '.'
        if (exports && exports[exportKey] === undefined) {
          const offset = codeOffset + (match.index ?? 0)
          const available = Object.keys(exports).filter(key => key !== './package.json').join(', ')
          add(findings, 'docs/unexported-import', document, 'Package specifier is not exported.', lineAt(text, offset), `${packageName}${subpath}`, columnAt(text, offset), `Use an exported specifier (${available || '.'}).`)
        }
      }
    }
  }
}

function checkRelativeDocumentationLinks (root, documents, findings) {
  for (const document of documents) {
    const fullPath = path.join(root, document)
    const text = fs.readFileSync(fullPath, 'utf8')
    const searchable = maskCodeFences(text)
    for (const match of searchable.matchAll(/!?\[[^\]]*]\(([^)]+)\)/g)) {
      let target = match[1].trim().replace(/^<|>$/g, '').split(/\s+["']/)[0]
      if (!target || target.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(target)) continue
      target = target.split('#')[0].split('?')[0]
      if (!target) continue
      try {
        target = decodeURIComponent(target)
      } catch {
        continue
      }
      const resolved = target.startsWith('/')
        ? path.join(root, target.slice(1))
        : path.resolve(path.dirname(fullPath), target)
      if (fs.existsSync(resolved) && isRepositoryPath(root, resolved)) continue
      const offset = match.index ?? 0
      const message = fs.existsSync(resolved) ? 'Repository-relative Markdown link resolves outside the repository.' : isInside(root, resolved) ? 'Repository-relative Markdown link does not resolve.' : 'Repository-relative Markdown link escapes the repository.'
      add(findings, 'docs/relative-link-missing', document, message, lineAt(text, offset), match[1].trim(), columnAt(text, offset), `Change the link target to an existing path relative to ${path.posix.dirname(document)}.`)
    }
  }
}

function checkCompatibilityBaselines (root, packages, findings) {
  const directory = path.join(root, 'compat', 'baseline')
  if (!fs.existsSync(directory)) {
    add(findings, 'compat/baseline-directory-missing', 'compat/baseline', 'API compatibility baseline directory is missing.', 0)
    return
  }
  const expected = new Map(packages.map(workspace => [`${path.posix.basename(workspace.path)}.api.md`, workspace]))
  for (const [file, workspace] of expected) {
    const reportPath = path.join(directory, file)
    if (!fs.existsSync(reportPath)) {
      add(findings, 'compat/baseline-missing', `compat/baseline/${file}`, 'Publishable package has no API compatibility baseline.', 0, workspace.manifest.name, 0, `Run npm run compat ${path.posix.basename(workspace.path)} -- --local.`)
      continue
    }
    const text = fs.readFileSync(reportPath, 'utf8')
    const expectedHeader = `## API Report File for "${workspace.manifest.name}"`
    if (!text.startsWith(expectedHeader)) {
      add(findings, 'compat/baseline-name-mismatch', `compat/baseline/${file}`, 'API report header does not match the package name.', 1, workspace.manifest.name, 1, `Regenerate the report so it starts with '${expectedHeader}'.`)
    }
  }
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.api.md') && !expected.has(entry.name)) {
      add(findings, 'compat/baseline-orphan', `compat/baseline/${entry.name}`, 'API compatibility baseline has no matching publishable package.', 1, entry.name, 1)
    }
  }
}

function checkInternalDependencies (root, workspaces, buildReferences, findings) {
  const byName = new Map(workspaces.filter(workspace => workspace.manifest.name).map(workspace => [workspace.manifest.name, workspace]))
  const buildIndex = new Map(buildReferences.map((reference, index) => [reference, index]))
  for (const workspace of workspaces) {
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const dependencies = workspace.manifest[section]
      if (!dependencies || typeof dependencies !== 'object') continue
      for (const [dependencyName, specifier] of Object.entries(dependencies)) {
        const target = byName.get(dependencyName)
        if (!target) {
          if (dependencyName.startsWith('@microsoft/agents-')) {
            const location = jsonPropertyLocation(workspace.text, dependencyName)
            add(findings, 'workspace/internal-dependency-missing', `${workspace.path}/package.json`, 'SDK dependency has no matching repository workspace.', location.line, dependencyName, location.column, `Add the ${dependencyName} workspace or replace the dependency with the intended external package.`)
          }
          continue
        }
        const location = jsonPropertyLocation(workspace.text, dependencyName)
        if (typeof specifier !== 'string' || !specifier.startsWith('file:')) {
          add(findings, 'workspace/internal-dependency-invalid', `${workspace.path}/package.json`, 'Internal SDK dependency does not use a local file reference.', location.line, dependencyName, location.column, `Change the specifier to "${localDependencySpecifier(workspace.path, target.path)}".`)
        } else {
          const resolved = path.resolve(root, workspace.path, specifier.slice(5))
          if (path.resolve(resolved) !== path.resolve(root, target.path)) {
            add(findings, 'workspace/internal-dependency-invalid', `${workspace.path}/package.json`, 'Internal dependency file reference resolves to the wrong workspace.', location.line, dependencyName, location.column, `Change the specifier to "${localDependencySpecifier(workspace.path, target.path)}".`)
          }
        }
        const dependencyIndex = buildIndex.get(target.path)
        const workspaceIndex = buildIndex.get(workspace.path)
        if (dependencyIndex !== undefined && workspaceIndex !== undefined && dependencyIndex >= workspaceIndex) {
          add(findings, 'build/dependency-order', 'tsconfig.build.json', 'Build reference appears before one of its internal dependencies.', 0, workspace.path, 0, `Move { "path": "${target.path}" } before { "path": "${workspace.path}" }.`)
        }
      }
    }
  }
}

function checkRuntimeConfiguration (root, rootManifest, findings) {
  const supportedMajor = Number(String(rootManifest.engines?.node ?? '').match(/>=\s*(\d+)/)?.[1])
  const nvmText = readRequiredText(root, '.nvmrc')
  const toolchainMajor = Number(nvmText.match(/\d+/)?.[0])
  if (!supportedMajor || !toolchainMajor) throw new DoctorConfigurationError('.nvmrc', 'Unable to determine Node support/toolchain versions from package.json and .nvmrc.')
  const nodeTypes = String(rootManifest.devDependencies?.['@types/node'] ?? '')
  const nodeTypesMajor = Number(nodeTypes.match(/\d+/)?.[0])
  if (nodeTypesMajor > supportedMajor) {
    const packageText = readRequiredText(root, 'package.json')
    const location = jsonPropertyLocation(packageText, '@types/node')
    add(findings, 'runtime/node-types-unsupported', 'package.json', `@types/node ${nodeTypesMajor} exposes APIs newer than supported Node ${supportedMajor}.`, location.line, '@types/node', location.column, `Use an @types/node ${supportedMajor}.x release so compilation respects the minimum supported runtime.`)
  }
  const pipelineFiles = walk(root, file => {
    const repositoryPath = relative(root, file)
    return (/^\.github\/workflows\/.*\.ya?ml$/.test(repositoryPath) || /^\.azdo\/.*\.ya?ml$/.test(repositoryPath))
  })
  for (const pipelineFile of pipelineFiles) {
    const file = relative(root, pipelineFile)
    const text = fs.readFileSync(pipelineFile, 'utf8')
    const matches = file.startsWith('.github/')
      ? text.matchAll(/node-version:\s*['"]?(\d+)(?:\.x)?/g)
      : text.matchAll(/task:\s*UseNode@[^\n]+[\s\S]{0,300}?inputs:[\s\S]{0,160}?version:\s*['"]?(\d+)(?:\.x)?/g)
    for (const match of matches) {
      const offset = (match.index ?? 0) + Math.max(0, match[0].lastIndexOf('version:'))
      if (Number(match[1]) !== toolchainMajor) add(findings, 'runtime/toolchain-mismatch', file, `Configured Node ${match[1]} must match .nvmrc major ${toolchainMajor}.`, lineAt(text, offset), undefined, columnAt(text, offset), `Change the configured Node major from ${match[1]} to ${toolchainMajor}.`)
    }
  }
  const devcontainers = walk(root, file => /^\.devcontainer\/[^/]+\.json$/.test(relative(root, file)))
  for (const devcontainerFile of devcontainers) {
    const devcontainer = relative(root, devcontainerFile)
    const devcontainerText = fs.readFileSync(devcontainerFile, 'utf8')
    for (const match of devcontainerText.matchAll(/javascript-node:\d+-(\d+)-/g)) {
      const offset = match.index ?? 0
      if (Number(match[1]) !== toolchainMajor) add(findings, 'runtime/toolchain-mismatch', devcontainer, `Configured Node ${match[1]} must match .nvmrc major ${toolchainMajor}.`, lineAt(devcontainerText, offset), undefined, columnAt(devcontainerText, offset), `Change the devcontainer Node major from ${match[1]} to ${toolchainMajor}.`)
    }
  }
  for (const dockerfile of walk(root, file => path.basename(file) === 'Dockerfile')) {
    const text = fs.readFileSync(dockerfile, 'utf8')
    for (const match of text.matchAll(/^\s*FROM\s+(?:--platform=\S+\s+)?node:([^\s]+).*$/gmi)) {
      const tag = match[1]
      const version = tag.match(/^(\d+)(?:[.-]|$)/)?.[1]
      const offset = match.index ?? 0
      if (!version) {
        const variant = /^(?:alpine|bookworm|bullseye|slim)/.test(tag) ? `-${tag}` : ''
        add(findings, 'runtime/unpinned-image', relative(root, dockerfile), `Docker image node:${tag} does not pin a Node major version.`, lineAt(text, offset), undefined, columnAt(text, offset), `Replace node:${tag} with node:${toolchainMajor}${variant}.`)
      } else if (Number(version) < supportedMajor) add(findings, 'runtime/unsupported-image', relative(root, dockerfile), `Docker image Node ${version} is below supported major ${supportedMajor}.`, lineAt(text, offset), undefined, columnAt(text, offset), `Replace Node ${version} with the repository toolchain major ${toolchainMajor}.`)
    }
  }
}

function checkPackageExports (workspace, invalidFields, findings) {
  const manifest = workspace.manifest
  const manifestFile = `${workspace.path}/package.json`
  const location = jsonPropertyLocation(workspace.text, 'exports')
  const rootExport = manifest.exports?.['.']
  if (!rootExport || typeof rootExport !== 'object') {
    add(findings, 'package/export-incomplete', manifestFile, 'Package exports must declare an object for the root entrypoint.', location.line, manifest.name, location.column, 'Add exports["."] with import, require, and types targets.')
    return
  }
  const importTarget = exportTarget(rootExport, 'import')
  const requireTarget = findConditionalTarget(rootExport, 'require')
  const mainTarget = exportTarget(rootExport, 'require')
  const typeTargets = exportTypeTargets(rootExport)
  if (!importTarget) add(findings, 'package/export-incomplete', manifestFile, 'Root export has no import target.', location.line, manifest.name, location.column, 'Add an import target under exports["."].')
  if (!requireTarget) add(findings, 'package/export-incomplete', manifestFile, 'Root export has no require target.', location.line, manifest.name, location.column, 'Add a require target under exports["."].')
  if (typeTargets.length === 0) {
    const typesTarget = typeof manifest.types === 'string' ? `./${normalize(manifest.types)}` : './dist/src/index.d.ts'
    add(findings, 'package/export-incomplete', manifestFile, 'Root export has no types target.', location.line, manifest.name, location.column, `Add "types": "${typesTarget}" under exports["."].`)
  }
  if (manifest.exports?.['./package.json'] !== './package.json') {
    add(findings, 'package/export-incomplete', manifestFile, 'Package metadata is not exported through ./package.json.', location.line, manifest.name, location.column, 'Add "./package.json": "./package.json" to exports.')
  }

  const targets = collectExportTargets(manifest.exports)
  for (const target of targets) {
    if (target === './package.json') continue
    if (!isSafeRelativeTarget(target) || (!invalidFields.has('files') && !isTargetPublished(target, manifest.files))) {
      add(findings, 'package/export-target-invalid', manifestFile, 'Export target is unsafe or excluded from the package files list.', location.line, target, location.column, `Add the target directory to "files" or replace "${target}" with a published ./ path.`)
    }
  }
  if (typeof manifest.main === 'string' && mainTarget && normalize(mainTarget) !== normalize(manifest.main)) {
    const mainLocation = jsonPropertyLocation(workspace.text, 'main')
    add(findings, 'package/main-export-mismatch', manifestFile, 'main must match the CommonJS/default export target.', mainLocation.line, manifest.name, mainLocation.column, `Change "main" from "${manifest.main}" to "${mainTarget}".`)
  }
  if (typeTargets.length > 0 && typeof manifest.types === 'string' && !typeTargets.some(target => normalize(target) === normalize(manifest.types))) {
    const typesLocation = jsonPropertyLocation(workspace.text, 'types')
    add(findings, 'package/types-export-mismatch', manifestFile, 'types must match one of the exported declaration targets.', typesLocation.line, manifest.name, typesLocation.column, `Change "types" from "${manifest.types}" to "${typeTargets[0]}".`)
  }
}

function checkEnvironmentTemplate (root, workspace, templateFile, findings) {
  const templatePath = relative(root, templateFile)
  const templateText = fs.readFileSync(templateFile, 'utf8')
  const keys = new Map()
  for (const match of templateText.matchAll(/^\s*([A-Za-z_][A-Za-z\d_]*)\s*=/gm)) {
    const key = match[1]
    const offset = match.index ?? 0
    if (keys.has(key)) {
      add(findings, 'test-agent/env-key-duplicate', templatePath, 'Environment template declares the same key more than once.', lineAt(templateText, offset), key, columnAt(templateText, offset), `Remove the duplicate ${key}= line.`)
    } else {
      keys.set(key, offset)
    }
  }
  const sourceDirectory = path.join(root, workspace.path, 'src')
  if (!fs.existsSync(sourceDirectory)) return
  const missingKeys = new Set()
  for (const sourceFile of walk(sourceDirectory, file => /\.[cm]?ts$/.test(file))) {
    const sourceText = fs.readFileSync(sourceFile, 'utf8')
    const searchable = stripComments(sourceText)
    for (const match of searchable.matchAll(/process\.env(?:\.([A-Za-z_][A-Za-z\d_]*)|\[['"]([A-Za-z_][A-Za-z\d_]*)['"]])!/g)) {
      const key = match[1] ?? match[2]
      if (keys.has(key) || missingKeys.has(key)) continue
      missingKeys.add(key)
      const offset = match.index ?? 0
      add(findings, 'test-agent/env-key-missing', relative(root, sourceFile), 'Required environment variable is absent from env.TEMPLATE.', lineAt(sourceText, offset), key, columnAt(sourceText, offset), `Add ${key}= to ${templatePath}.`)
    }
  }
}

function checkDockerLifecycle (root, workspace, findings) {
  const manifest = workspace.manifest
  const manifestFile = `${workspace.path}/package.json`
  const dockerFile = `${workspace.path}/Dockerfile`
  const hasDockerfile = fs.existsSync(path.join(root, dockerFile))
  const hasDockerScript = typeof manifest.scripts?.docker === 'string'
  if (hasDockerScript && !hasDockerfile) {
    const location = jsonPropertyLocation(workspace.text, 'docker')
    add(findings, 'test-agent/dockerfile-missing', manifestFile, 'Docker script has no Dockerfile in the test-agent directory.', location.line, manifest.name, location.column, `Add ${dockerFile} or remove scripts.docker.`)
    return
  }
  if (!hasDockerfile) return
  for (const script of ['bundle', 'docker']) {
    if (!manifest.scripts?.[script]) {
      const location = jsonPropertyLocation(workspace.text, 'scripts')
      const fix = `Add a scripts.${script} command for ${dockerFile}.`
      add(findings, 'test-agent/docker-script-missing', manifestFile, `Dockerfile has no ${script} script.`, location.line, manifest.name, location.column, fix)
    }
  }
  const bundle = manifest.scripts?.bundle
  if (typeof bundle !== 'string') return
  const outfile = bundle.match(/--outfile=(?:"([^"]+)"|'([^']+)'|([^\s]+))/)?.slice(1).find(Boolean)
  if (!outfile) {
    const location = jsonPropertyLocation(workspace.text, 'bundle')
    add(findings, 'test-agent/docker-artifact-mismatch', manifestFile, 'Bundle script does not declare an esbuild outfile.', location.line, manifest.name, location.column, 'Add --outfile=dist/bundle.js to scripts.bundle and align the Dockerfile artifact.')
    return
  }
  const dockerText = fs.readFileSync(path.join(root, dockerFile), 'utf8')
  const artifact = path.posix.basename(normalize(outfile))
  const copy = dockerCopyMappings(dockerText).find(mapping => normalize(mapping.source) === normalize(outfile))
  const commandMatch = /^\s*CMD\s+\[\s*"node"\s*,\s*"([^"]+)"\s*]\s*$/mi.exec(dockerText)
  const deployedArtifact = copy
    ? copy.destination === '.' || copy.destination.endsWith('/')
      ? path.posix.basename(normalize(copy.source))
      : path.posix.basename(normalize(copy.destination))
    : undefined
  if (!copy || !commandMatch || path.posix.basename(normalize(commandMatch[1])) !== deployedArtifact) {
    const location = locationOf(dockerText, copy?.statement ?? commandMatch?.[0] ?? 'COPY')
    add(findings, 'test-agent/docker-artifact-mismatch', dockerFile, 'Dockerfile COPY/CMD does not run the bundle outfile.', location.line, artifact, location.column, `Copy "${normalize(outfile)}" and run "${artifact}" in the Dockerfile.`)
  }
}

function createWorkspace (root, manifestFile) {
  const file = normalize(manifestFile)
  const text = readRequiredText(root, file)
  return { path: normalize(path.posix.dirname(file)), manifest: parseJson(file, text), text }
}

function readRequiredText (root, file) {
  try {
    return fs.readFileSync(path.join(root, file), 'utf8')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new DoctorConfigurationError(file, `Unable to read required repository file: ${detail}`)
  }
}

function parseJson (file, text) {
  try {
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new DoctorConfigurationError(file, `${file} must contain a JSON object.`)
    }
    return value
  } catch (error) {
    if (error instanceof DoctorConfigurationError) throw error
    const detail = error instanceof Error ? error.message : String(error)
    throw new DoctorConfigurationError(file, `Unable to parse repository configuration: ${detail}`)
  }
}

function childDirectories (root, directory) {
  const fullPath = path.join(root, directory)
  if (!fs.existsSync(fullPath)) throw new DoctorConfigurationError(directory, `Required repository directory is missing: ${directory}`)
  return fs.readdirSync(fullPath, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !ignoredDirectories.has(entry.name))
    .map(entry => `${directory}/${entry.name}`)
    .sort()
}

function walk (root, predicate) {
  /** @type {string[]} */ const files = []
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) visit(path.join(directory, entry.name))
      } else {
        const file = path.join(directory, entry.name)
        if (predicate(file)) files.push(file)
      }
    }
  }
  visit(root)
  return files
}

function isWorkspacePath (workspacePath, patterns) {
  const included = patterns.filter(pattern => !pattern.startsWith('!'))
  const excluded = patterns.filter(pattern => pattern.startsWith('!')).map(pattern => pattern.slice(1))
  return included.some(pattern => workspaceMatches(workspacePath, pattern)) && !excluded.some(pattern => workspaceMatches(workspacePath, pattern))
}

function workspaceMatches (workspacePath, pattern) {
  const expression = `^${normalize(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, 'DOUBLE_STAR').replace(/\*/g, '[^/]*').replace(/DOUBLE_STAR/g, '.*')}$`
  return new RegExp(expression).test(workspacePath)
}

function exportTarget (entry, preferred) {
  if (typeof entry === 'string') return entry
  if (!entry || typeof entry !== 'object') return undefined
  return findConditionalTarget(entry, preferred) ?? conditionalTarget(entry.default)
}

function findConditionalTarget (entry, condition) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return undefined
  if (entry[condition] !== undefined) return conditionalTarget(entry[condition])
  for (const [nestedCondition, value] of Object.entries(entry)) {
    if (nestedCondition === 'default' || nestedCondition === 'import' || nestedCondition === 'require') continue
    const target = findConditionalTarget(value, condition)
    if (target) return target
  }
  return undefined
}

function conditionalTarget (entry) {
  if (typeof entry === 'string') return entry
  if (Array.isArray(entry)) {
    for (const value of entry) {
      const target = conditionalTarget(value)
      if (target) return target
    }
    return undefined
  }
  if (!entry || typeof entry !== 'object') return undefined
  if (entry.default !== undefined) return conditionalTarget(entry.default)
  for (const value of Object.values(entry)) {
    const target = conditionalTarget(value)
    if (target) return target
  }
  return undefined
}

function exportTypeTargets (entry) {
  const targets = []
  const visit = value => {
    if (!value || typeof value !== 'object') return
    for (const [condition, target] of Object.entries(value)) {
      if (condition === 'types' && typeof target === 'string') targets.push(target)
      else visit(target)
    }
  }
  visit(entry)
  return [...new Set(targets)]
}

function collectExportTargets (entry) {
  const targets = []
  const visit = value => {
    if (typeof value === 'string') {
      targets.push(value)
      return
    }
    if (!value || typeof value !== 'object') return
    for (const target of Object.values(value)) visit(target)
  }
  visit(entry)
  return [...new Set(targets)]
}

function isSafeRelativeTarget (target) {
  if (typeof target !== 'string' || !target.startsWith('./') || target.includes('\\') || /%(?:2f|5c)/i.test(target)) return false
  let decoded
  try {
    decoded = decodeURIComponent(target.slice(2))
  } catch {
    return false
  }
  const segments = decoded.split('/')
  if (decoded.includes('\\') || decoded.includes('%') || segments.includes('..') || segments.includes('node_modules')) return false
  const normalized = path.posix.normalize(decoded)
  return normalized !== '..' && !normalized.startsWith('../') && !path.posix.isAbsolute(normalized)
}

function isTargetPublished (target, files) {
  if (!Array.isArray(files)) return false
  const normalizedTarget = normalize(target)
  return files.some(file => {
    const normalizedFile = normalize(file).replace(/\/$/, '')
    return normalizedTarget === normalizedFile || normalizedTarget.startsWith(`${normalizedFile}/`)
  })
}

function isNonEmptyObject (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0
}

function scriptJavaScriptTarget (script) {
  if (typeof script !== 'string') return undefined
  return script.trim().split(/\s+/).filter(token => /\.(?:cjs|mjs|js)$/.test(token)).at(-1)
}

function isCanonicalStartScript (script) {
  const normalized = script.trim()
  return /^npm run build\s*&&\s*node\s+/.test(normalized) && /\s--env-file(?:=|\s+)/.test(` ${normalized} `)
}

function markdownSection (text, heading) {
  const expression = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, 'mi')
  const match = expression.exec(text)
  if (!match) return undefined
  const contentStart = match.index + match[0].length
  const nextHeading = /^##\s+/m.exec(text.slice(contentStart))
  const end = nextHeading ? contentStart + nextHeading.index : text.length
  return {
    text: text.slice(contentStart, end),
    offset: contentStart,
    line: lineAt(text, match.index),
    column: columnAt(text, match.index),
  }
}

function packageTableEntries (text) {
  const entries = new Map()
  for (const match of text.matchAll(/^\|\s*`(@microsoft\/agents-[a-z\d-]+)`/gm)) {
    if (!entries.has(match[1])) entries.set(match[1], match.index ?? 0)
  }
  return entries
}

function testAgentLinkEntries (text) {
  const entries = new Map()
  for (const match of text.matchAll(/\[[^\]]+]\((?:\.\/)?([a-z\d][a-z\d-]*)\/?(?:#[^)]*)?\)/gi)) {
    if (!entries.has(match[1])) entries.set(match[1], match.index ?? 0)
  }
  return entries
}

function jsonPropertyLocation (text, property) {
  const expression = new RegExp(`${escapeRegExp(JSON.stringify(property))}\\s*:`)
  const match = expression.exec(text)
  return match ? { line: lineAt(text, match.index), column: columnAt(text, match.index) } : { line: 0, column: 0 }
}

function jsonArrayRange (text, property) {
  const rootStart = skipJsonWhitespace(text, 0)
  const rootEnd = jsonValueEnd(text, rootStart)
  const start = text[rootStart] === '{'
    ? jsonObjectPropertyValueOffset(text, rootStart, rootEnd, property)
    : -1
  if (start < 0 || text[start] !== '[') return { start: 0, end: text.length }
  return { start, end: jsonValueEnd(text, start) }
}

function jsonArrayPropertyValueOffsets (text, arrayProperty, objectProperty) {
  const range = jsonArrayRange(text, arrayProperty)
  const offsets = []
  let cursor = skipJsonWhitespace(text, range.start + 1)
  while (cursor < range.end && text[cursor] !== ']') {
    const valueEnd = jsonValueEnd(text, cursor)
    if (text[cursor] === '{') offsets.push(jsonObjectPropertyValueOffset(text, cursor, valueEnd, objectProperty))
    cursor = skipJsonWhitespace(text, valueEnd)
    if (text[cursor] === ',') cursor = skipJsonWhitespace(text, cursor + 1)
  }
  return offsets
}

function jsonObjectPropertyValueOffset (text, start, end, property) {
  let cursor = skipJsonWhitespace(text, start + 1)
  while (cursor < end && text[cursor] !== '}') {
    const keyEnd = jsonStringEnd(text, cursor)
    const key = JSON.parse(text.slice(cursor, keyEnd + 1))
    cursor = skipJsonWhitespace(text, keyEnd + 1)
    if (text[cursor] !== ':') return -1
    cursor = skipJsonWhitespace(text, cursor + 1)
    const valueStart = cursor
    const valueEnd = jsonValueEnd(text, valueStart)
    if (key === property) return valueStart
    cursor = skipJsonWhitespace(text, valueEnd)
    if (text[cursor] === ',') cursor = skipJsonWhitespace(text, cursor + 1)
  }
  return -1
}

function jsonValueEnd (text, start) {
  const first = text[start]
  if (first === '"') return jsonStringEnd(text, start) + 1
  if (first !== '{' && first !== '[') {
    const match = /[\s,}\]]/.exec(text.slice(start))
    return match ? start + match.index : text.length
  }
  const closing = first === '{' ? '}' : ']'
  let depth = 0
  let quoted = false
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quoted = false
      continue
    }
    if (character === '"') quoted = true
    else if (character === first) depth += 1
    else if (character === closing) {
      depth -= 1
      if (depth === 0) return index + 1
    }
  }
  return text.length
}

function jsonStringEnd (text, start) {
  let escaped = false
  for (let index = start + 1; index < text.length; index += 1) {
    if (escaped) escaped = false
    else if (text[index] === '\\') escaped = true
    else if (text[index] === '"') return index
  }
  return text.length
}

function skipJsonWhitespace (text, start) {
  const match = /\S/.exec(text.slice(start))
  return match ? start + match.index : text.length
}

function localDependencySpecifier (fromWorkspace, toWorkspace) {
  const relativePath = normalize(path.posix.relative(fromWorkspace, toWorkspace))
  return `file:${relativePath.startsWith('.') ? relativePath : `./${relativePath}`}`
}

function dockerCopyMappings (text) {
  const mappings = []
  for (const match of text.matchAll(/^\s*COPY\s+(.+)$/gmi)) {
    const statement = match[0]
    const body = match[1].trim()
    if (body.startsWith('[')) {
      try {
        const values = JSON.parse(body)
        if (Array.isArray(values) && values.length >= 2 && values.every(value => typeof value === 'string')) {
          const destination = values.at(-1)
          for (const source of values.slice(0, -1)) mappings.push({ source, destination, statement })
        }
      } catch {
        continue
      }
      continue
    }
    const values = body.split(/\s+/).filter(value => !value.startsWith('--'))
    if (values.length < 2) continue
    const destination = values.at(-1)
    for (const source of values.slice(0, -1)) mappings.push({ source, destination, statement })
  }
  return mappings
}

function hasDoctorInExecutableCiSequence (file, text) {
  const uncommented = text
    .split(/\r?\n/)
    .filter(line => !line.trimStart().startsWith('#'))
    .join('\n')
  const blocks = file.startsWith('.github/')
    ? githubJobBlocks(uncommented)
    : azureJobBlocks(uncommented)
  return blocks.some(block => {
    const commands = ciCommands(block)
    const doctorIndex = commands.findIndex(command => /^npm run repo:doctor(?:\s|$)/.test(command))
    const installIndices = commands
      .map((command, index) => /^npm ci(?:\s|$)/.test(command) || /^customCommand:\s*['"]?ci['"]?\s*$/.test(command) ? index : -1)
      .filter(index => index >= 0)
    const buildIndex = commands.findIndex(command => /^npm run build(?:\s|$)/.test(command))
    return doctorIndex >= 0 && installIndices.some(index => index < doctorIndex) && (buildIndex < 0 || doctorIndex < buildIndex)
  })
}

function ciCommands (block) {
  const commands = []
  const lines = block.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const match = /^(\s*)(?:-\s*)?(?:run|script):\s*(.*?)\s*$/.exec(line)
    if (match) {
      const indentation = match[1].length
      const value = match[2]
      if (/^[>|][+-]?$/.test(value)) {
        for (index += 1; index < lines.length; index += 1) {
          const isContinuation = /^\s*$/.test(lines[index]) || (lines[index].match(/^\s*/)?.[0].length ?? 0) > indentation
          if (!isContinuation) break
          const command = lines[index].trim()
          if (command) commands.push(...splitShellCommands(command))
        }
        index -= 1
      } else {
        commands.push(...splitShellCommands(value))
      }
      continue
    }
    const customCommand = /^\s*customCommand:\s*(.*?)\s*$/.exec(line)
    if (customCommand) commands.push(`customCommand: ${customCommand[1]}`)
  }
  return commands
}

function splitShellCommands (value) {
  return value.split(/(?:&&|;)/)
    .map(command => command.trim().replace(/^(?:'|")|(?:'|")$/g, ''))
    .filter(Boolean)
}

function githubJobBlocks (text) {
  const jobsIndex = text.search(/^jobs:\s*$/m)
  if (jobsIndex < 0) return []
  const jobsText = text.slice(jobsIndex)
  const matches = [...jobsText.matchAll(/^ {2}([A-Za-z\d_-]+):\s*$/gm)]
  return matches.map((match, index) => jobsText.slice(match.index, matches[index + 1]?.index ?? jobsText.length))
}

function azureJobBlocks (text) {
  const matches = [...text.matchAll(/^\s*-\s+job:\s*\S+\s*$/gm)]
  if (matches.length === 0) return [text]
  return matches.map((match, index) => text.slice(match.index, matches[index + 1]?.index ?? text.length))
}

function maskCodeFences (text) {
  return text.replace(/```[\s\S]*?```/g, value => value.replace(/[^\n]/g, ' '))
}

function stripComments (text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, value => value.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (value, prefix) => prefix + ' '.repeat(value.length - prefix.length))
}

function isInside (root, target) {
  const relativePath = path.relative(root, target)
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

function isRepositoryPath (root, target) {
  if (!isInside(root, target)) return false
  try {
    return isInside(fs.realpathSync(root), fs.realpathSync(target))
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EPERM') return true
    return false
  }
}

function escapeRegExp (value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function add (findings, ruleId, file, message, line = 0, subject, column = 0, customFix) {
  const fix = customFix ?? ruleDefinitions[ruleId]?.fix
  if (!fix) throw new Error(`Rule ${ruleId} must define a concrete fix.`)
  findings.push({ ruleId, message, fix, path: normalize(file), line, column, ...(subject ? { subject } : {}) })
}

class DoctorConfigurationError extends Error {
  constructor (file, message) {
    super(message)
    this.name = 'DoctorConfigurationError'
    this.file = normalize(file)
  }
}

export function formatFailure (error, options = {}) {
  const color = options.color ?? supportsColor(process.stderr)
  const expected = error instanceof DoctorConfigurationError
  const file = expected ? error.file : 'scripts/repo-doctor.mjs'
  const message = expected ? error.message : `${error instanceof Error ? error.name : 'Error'}: ${error instanceof Error ? error.message : String(error)}`
  const rule = expected ? 'repo-doctor/configuration' : 'repo-doctor/internal'
  const fix = expected
    ? `Open ${file}, correct the invalid value or syntax identified above, then rerun npm run repo:doctor.`
    : 'Start at the first repository stack frame below, repair the failure, then rerun npm run repo:doctor.'
  const lines = [
    style(file, 'heading', color),
    `  ${formatLocation(0, 0)}  ${style('error', 'red', color)}  ${message}  ${style(rule, 'dim', color)}`,
    style(`           fix    ${fix}`, 'dim', color),
  ]
  if (!expected && error instanceof Error && error.stack) {
    const stack = normalizeStack(error.stack).split('\n').slice(1, 9)
    if (stack.length > 0) lines.push('', ...stack.map(frame => style(`           ${frame.trim()}`, 'dim', color)))
  }
  lines.push('', style('✖ Repo Doctor could not complete', 'red', color))
  return lines.join('\n')
}

function normalizeStack (stack) {
  const repository = normalize(process.cwd())
  return normalize(stack).replaceAll(`${repository}/`, '')
}

export function supportsColor (stream) {
  return Boolean(stream?.isTTY) && !Object.hasOwn(process.env, 'NO_COLOR') && process.env.TERM !== 'dumb'
}

function style (value, kind, enabled) {
  if (!enabled) return value
  const codes = { red: '31', green: '32', cyan: '36', dim: '2', heading: '1;4' }
  return `\u001B[${codes[kind]}m${value}\u001B[0m`
}

function relative (root, file) { return normalize(path.relative(root, file)) }
function normalize (value) { return String(value).replaceAll('\\', '/').replace(/^\.\//, '') }
function formatLocation (line, column) { return line > 0 && column > 0 ? `${line}:${column}`.padStart(7) : '--:--'.padStart(7) }
function lineAt (text, offset) { return text.slice(0, offset).split('\n').length }
function columnAt (text, offset) { return offset - text.lastIndexOf('\n', offset - 1) }
function locationOf (text, value) {
  const offset = text.indexOf(value)
  return offset < 0 ? { line: 0, column: 0 } : { line: lineAt(text, offset), column: columnAt(text, offset) }
}
function byPath (left, right) { return left.path.localeCompare(right.path) }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli()
