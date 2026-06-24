// @ts-check

import fs from 'fs'
import path from 'path'

import { Extractor, ExtractorConfig } from '@microsoft/api-extractor'
import { Colorize } from '@rushstack/terminal'

const folders = {
  reports: {
    _: 'compat',
    baseline: 'baseline',
    generated: 'generated',
  },
  packages: 'packages'
}

const paths = {
  _: import.meta.dirname,
  reports: {
    _: path.join(import.meta.dirname, folders.reports._),
    baseline: path.join(import.meta.dirname, folders.reports._, folders.reports.baseline),
    generated: path.join(import.meta.dirname, folders.reports._, folders.reports.generated),
  },
}

// Load tsconfig references
const tsconfigPath = path.join(paths._, 'tsconfig.build.json')
if (!fs.existsSync(tsconfigPath)) {
  console.error(Colorize.red(`Error: ${tsconfigPath} not found.`))
  process.exit(1)
}
const tsconfigContent = fs.readFileSync(tsconfigPath, 'utf-8')
let packagesFromTsConfig
try {
  packagesFromTsConfig = JSON.parse(tsconfigContent)
    .references
    .filter(ref => ref.path.startsWith(folders.packages))
    .map(ref => ref.path)
} catch (error) {
  console.error(Colorize.red(`Error parsing tsconfig.build.json: ${error.message}`))
  process.exit(1)
}

// Ensure report directories exist
fs.mkdirSync(paths.reports.baseline, { recursive: true })
fs.mkdirSync(paths.reports.generated, { recursive: true })

const helpMessage = `
${Colorize.cyan('Usage:')}
  npm run compat ${Colorize.blue('[package]')} ${Colorize.dim('[--local] [--verbose] [--diagnostics]')}

${Colorize.cyan('Options:')}
  ${Colorize.blue('[package]')}          ${Colorize.dim('Name of the package to analyze (e.g. agents-hosting). If omitted, all packages are analyzed.')}
  -l, --local        ${Colorize.dim(`Copy temporary API report files to the final report folder (${folders.reports._}/${folders.reports.baseline}).`)}
  -v, --verbose      ${Colorize.dim('Show verbose output from API Extractor.')}
  -d, --diagnostics  ${Colorize.dim('Show diagnostics output from API Extractor.')}
  -h, --help         ${Colorize.dim('Show this help message.')}

${Colorize.cyan('Examples:')}
  npm run compat
  npm run compat agents-hosting
  npm run compat agents-hosting ${Colorize.dim('-- --local --verbose --diagnostics')}
`

console.log(`${Colorize.magenta('API Compatibility Report')}

${Colorize.cyan('Tips:')}
  ${Colorize.dim(`- use --local to synchronize the ${folders.reports._} folder from ${folders.reports.generated} to ${folders.reports.baseline}.`)}
  ${Colorize.dim('- run "npm run compat -- --help" for more information.')}`)

const settings = loadSettings()

if (settings.help) {
  console.log(helpMessage)
  process.exit(0)
}

const packages = settings.package ? [settings.package] : packagesFromTsConfig

console.time('Total Duration')

const packagesWithFailures = []
const { _console, restore } = stubConsole()

for (const projectFolder of packages) {
  _console.log(`\n┌─ [${Colorize.blue(projectFolder)}] analyzing compatibility...`)
  try {
    const packageCompat = resolvePackageCompat(projectFolder)
    const reportResult = runCompatibilityReport({
      packageCompat,
      projectFolder,
      settings,
    })

    if (reportResult.updated) {
      _console.log(`└─ ${Colorize.green('updated')}`)
      continue
    }

    if (reportResult.succeeded) {
      _console.log(`└─ ${Colorize.green('passed')}`)
      continue
    }

    _console.log(`└─ ${Colorize.red(`${reportResult.errorCount} error(s)`)} ── ${Colorize.yellow(`${reportResult.warningCount} warning(s)`)}`)
    packagesWithFailures.push(projectFolder)
  } catch (error) {
    _console.error(Colorize.red(error.message))
    _console.log(`└─ ${Colorize.red('failed')}`)
    packagesWithFailures.push(projectFolder)
  }
}

restore()

if (packagesWithFailures.length === 0) {
  console.log(`\n${Colorize.green(`${packages.length} package(s) passed the compatibility analysis!`)}\n`)
} else {
  console.log(`\n${Colorize.red(`${packagesWithFailures.length} package(s) failed the compatibility analysis!`)}\n`)
}

console.timeEnd('Total Duration')

if (packagesWithFailures.length === 0) {
  process.exit(0)
} else {
  process.exit(1)
}

/**
 * Stub console methods to prefix messages with a pipe character.
 * Useful to make the API extractor output more readable in the terminal.
 */
function stubConsole () {
  const _console = { ...console }
  console.log = (...args) => _console.log('│ ', ...args)
  console.warn = (...args) => _console.warn('│ ', ...args)
  console.error = (...args) => _console.error('│ ', ...args)
  return {
    _console,
    restore: () => {
      console.log = _console.log.bind(console)
      console.warn = _console.warn.bind(console)
      console.error = _console.error.bind(console)
    },
  }
}

/**
 * Load settings from command line arguments.
 */
function loadSettings () {
  let [, , packageName, ...args] = process.argv

  packageName = packageName?.trim() ?? ''
  args ??= []

  if (packageName.startsWith('--')) {
    args.push(packageName)
    packageName = ''
  } else if (packageName) {
    packageName = packageName.startsWith(folders.packages) ? packageName : `${folders.packages}/${packageName}`
  }

  return {
    package: packageName,
    verbose: args.includes('--verbose') || args.includes('-v'),
    local: args.includes('--local') || args.includes('-l'),
    diagnostics: args.includes('--diagnostics') || args.includes('-d'),
    help: args.includes('--help') || args.includes('-h'),
  }
}

/**
 * Resolve the canonical public declaration entrypoint for a package.
 *
 * @param {string} projectFolder
 */
function resolvePackageCompat (projectFolder) {
  const packageRoot = path.resolve(paths._, projectFolder)
  const packageJsonFullPath = path.join(packageRoot, 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonFullPath, 'utf-8'))
  const packageName = packageJson.name ?? projectFolder
  const importTypes = packageJson.exports?.['.']?.import?.types
  const requireTypes = packageJson.exports?.['.']?.require?.types
  const topLevelTypes = packageJson.types

  if (typeof importTypes === 'string' || typeof requireTypes === 'string') {
    return {
      packageJsonFullPath,
      mainEntryPointFilePath: resolveCanonicalTypesPath({
        packageRoot,
        packageName,
        topLevelTypes,
        importTypes,
        requireTypes,
      }),
    }
  }

  return {
    packageJsonFullPath,
    mainEntryPointFilePath: resolveDeclaredTypesPath(
      packageRoot,
      topLevelTypes,
      packageName,
      'types',
      'package.json must declare either exports["."].import.types / exports["."].require.types, or a top-level "types" entry.'
    ),
  }
}

/**
 * Resolve the canonical public types entrypoint for packages that declare module-specific types.
 *
 * @param {{
 *   packageRoot: string,
 *   packageName: string,
 *   topLevelTypes: string | undefined,
 *   importTypes: string | undefined,
 *   requireTypes: string | undefined,
 * }} options
 */
function resolveCanonicalTypesPath ({ packageRoot, packageName, topLevelTypes, importTypes, requireTypes }) {
  if (typeof topLevelTypes === 'string') {
    return resolveDeclaredTypesPath(packageRoot, topLevelTypes, packageName, 'types')
  }

  if (typeof importTypes === 'string') {
    return resolveDeclaredTypesPath(packageRoot, importTypes, packageName, 'exports["."].import.types')
  }

  if (typeof requireTypes === 'string') {
    return resolveDeclaredTypesPath(packageRoot, requireTypes, packageName, 'exports["."].require.types')
  }

  throw new Error(`Compat config error for "${packageName}": could not resolve a canonical public types entrypoint.`)
}

/**
 * Resolve and validate a public types declaration path from package metadata.
 *
 * @param {string} packageRoot
 * @param {string | undefined} declaredPath
 * @param {string} packageName
 * @param {string} fieldName
 * @param {string} [missingFieldMessage]
 */
function resolveDeclaredTypesPath (packageRoot, declaredPath, packageName, fieldName, missingFieldMessage) {
  if (typeof declaredPath !== 'string') {
    throw new Error(`Compat config error for "${packageName}": ${missingFieldMessage ?? `package.json ${fieldName} must be a string.`}`)
  }

  const resolvedPath = path.resolve(packageRoot, declaredPath)
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Compat config error for "${packageName}": package.json ${fieldName} points to a file that does not exist: ${resolvedPath}`)
  }
  return resolvedPath
}

/**
 * Run API Extractor for a resolved report target.
 *
 * @param {{
 *   packageCompat: {
 *     packageJsonFullPath: string,
 *     mainEntryPointFilePath: string,
 *   },
 *   projectFolder: string,
 *   settings: {
 *     diagnostics: boolean,
 *     local: boolean,
 *     verbose: boolean,
 *   },
 * }} options
 */
function runCompatibilityReport ({ packageCompat, projectFolder, settings }) {
  const extractorConfig = ExtractorConfig.prepare({
    packageJsonFullPath: packageCompat.packageJsonFullPath,
    configObjectFullPath: undefined,
    configObject: {
      projectFolder,
      mainEntryPointFilePath: packageCompat.mainEntryPointFilePath,
      compiler: {
        tsconfigFilePath: 'tsconfig.json'
      },
      apiReport: {
        enabled: true,
        reportFolder: paths.reports.baseline,
        reportTempFolder: paths.reports.generated,
      },
      docModel: {
        enabled: false
      },
      dtsRollup: {
        enabled: false
      },
      tsdocMetadata: {
        enabled: false
      },
    }
  })

  console.log('\r')

  let updated = false
  const extractorResult = Extractor.invoke(extractorConfig, {
    localBuild: settings.local,
    showVerboseMessages: settings.verbose,
    showDiagnostics: settings.diagnostics,
    messageCallback (message) {
      if (message.logLevel === 'warning' && message.text.includes('Updating ')) {
        updated = true
      }
    }
  })

  console.log('\r')

  return {
    updated: updated || extractorResult.apiReportChanged,
    succeeded: extractorResult.succeeded,
    errorCount: extractorResult.errorCount,
    warningCount: extractorResult.warningCount,
  }
}
