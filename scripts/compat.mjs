import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArguments } from './compat/config.mjs'
import { runCompat } from './compat/runner.mjs'
import { prepareArtifacts, writeFailure } from './compat/artifacts.mjs'

function formatHelp (color) {
  const cyan = text => color ? `\u001B[36m${text}\u001B[39m` : text
  const bold = text => color ? `\u001B[1m${text}\u001B[22m` : text
  const dim = text => color ? `\u001B[2m${text}\u001B[22m` : text
  const row = (command, description, width) => `  ${bold(command.padEnd(width))}${dim(description)}`

  return `${cyan('API compatibility')}

Check public TypeScript APIs for potential breaking changes.
Builds declarations first and checks packages in parallel.

${cyan('Usage:')} ${bold('npm run compat -- [package] [options]')}
${dim('Package: short name (agents-hosting), scoped name (@microsoft/agents-hosting), or directory (packages/agents-hosting).')}
${dim('Omit package to check all publishable packages.')}

${cyan('Common commands')}
${row('npm run compat', 'Check all packages', 40)}
${row('npm run compat -- agents-hosting', 'Check one package', 40)}
${row('npm run compat -- --update', 'Refresh reviewed baselines', 40)}
${row('npm run compat -- --base origin/main', 'Compare with a Git reference', 40)}

${cyan('Options')}
${row('--update', 'Update baselines, including possible breaks; review before committing', 20)}
${row('--base <git-ref>', 'Include Git-reference context in the report (also COMPAT_BASE)', 20)}
${row('--no-color', 'Disable colors', 20)}
${row('--help, -h', 'Show this help', 20)}

${cyan('Advanced')}
${row('--skip-build', 'Reuse an existing build; quality does this automatically', 20)}
${row('--concurrency <n>', 'Parallel package limit: 1–8 (default: 2)', 20)}

${cyan('Results:')} compat/generated/report.json
${cyan('Build log:')} scripts/logs/compat/build.log
${cyan('Review:')} ${dim('follow the baseline → generated links in the output.')}
${cyan('Workflow:')} docs/API-COMPATIBILITY.md

${cyan('Exit codes')}
${row('0', 'Baselines current or updated; possible breaks are warnings', 5)}
${row('1', 'Baselines need updating', 5)}
${row('2', 'Analysis, configuration, build, or file-write error', 5)}
${row('130', 'Interrupted (Ctrl+C or termination request)', 5)}
`
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let started = false

try {
  const settings = parseArguments(process.argv.slice(2))
  if (settings.help) {
    const color = settings.color && !!process.stdout.isTTY && process.env.TERM !== 'dumb'
    process.stdout.write(formatHelp(color))
  } else {
    started = true
    process.exitCode = await runCompat(root, settings)
  }
} catch (error) {
  if (!started) {
    try {
      writeFailure(prepareArtifacts(root), error.message)
    } catch (reportError) {
      console.error(`Cannot write compatibility diagnostics: ${reportError.message}`)
    }
  }
  console.error(`API compatibility: ${error.message}`)
  process.exitCode = 2
}
