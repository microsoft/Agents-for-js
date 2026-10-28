import path from 'node:path'
import { parseArgs } from 'node:util'

export const toolchain = { extractor: '7.59.0', checker: '0.8.0', typescript: '6.0.2' }

export function parseArguments (args, env = process.env) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      update: { type: 'boolean' },
      base: { type: 'string' },
      concurrency: { type: 'string', default: '2' },
      'skip-build': { type: 'boolean' },
      'no-color': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' }
    }
  })

  if (positionals.length > 1) {
    throw new Error('Select at most one package.')
  }

  const concurrency = Number(values.concurrency)

  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error('--concurrency must be an integer between 1 and 8.')
  }

  return {
    package: positionals[0],
    update: values.update ?? false,
    base: values.base || env.COMPAT_BASE || undefined,
    concurrency,
    skipBuild: values['skip-build'] || env.COMPAT_SKIP_BUILD === '1',
    color: !values['no-color'] && env.NO_COLOR === undefined,
    help: values.help
  }
}

export function selectPackages (current, baseline, selector) {
  const names = [...new Set([...current, ...baseline].map(pkg => pkg.name))].sort()
  const selected = names.filter(name => {
    if (!selector) {
      return true
    }

    const pkg = current.find(pkg => pkg.name === name) ?? baseline.find(pkg => pkg.name === name)

    return (
      selector === name ||
      selector === pkg.directory ||
      selector === path.posix.basename(pkg.directory)
    )
  })

  if (!selected.length) {
    throw new Error(`No publishable package matches ${selector ?? 'the workspace'}.`)
  }

  return selected.map(name => ({
    name,
    current: current.find(pkg => pkg.name === name),
    baseline: baseline.find(pkg => pkg.name === name)
  }))
}
