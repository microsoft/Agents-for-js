import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

/** @param {string} script */
export function npmInvocation (script) {
  if (process.env.npm_execpath) {
    return [process.execPath, [process.env.npm_execpath, 'run', '--silent', script]]
  }
  return [process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', '--silent', script]]
}

// Baseline inventory and package discovery shared by compat and repository doctor.
export const schemaVersion = 1

export function safeFile (root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || path.isAbsolute(relative)) {
    throw new Error(`Invalid compatibility path: ${relative}`)
  }
  const absolute = path.resolve(root, relative)
  const resolved = path.relative(root, absolute)
  if (resolved === '..' || resolved.startsWith(`..${path.sep}`) || path.isAbsolute(resolved)) {
    throw new Error(`Compatibility path escapes its directory: ${relative}`)
  }
  return absolute
}

function reportName (directory, key) {
  const condition = key === '.#import' ? 'import' : key === '.#require' ? 'require' : undefined
  const suffix = key === '.' ? '' : `-${condition ?? createHash('sha256').update(key).digest('hex').slice(0, 12)}`
  return `${path.posix.basename(directory)}${suffix}.api.md`
}

/** Enumerate explicit type export conditions; unsupported surfaces fail visibly. */
export function packageInfo (directory, manifest) {
  const entries = {}
  const unsupported = []
  if (manifest.typesVersions && Object.keys(manifest.typesVersions).length) {
    unsupported.push('typesVersions redirects are not analyzed. Use explicit type export conditions.')
  }
  const add = (key, target) => {
    if (typeof target !== 'string') {
      unsupported.push(`Unsupported declaration target for ${key}.`)
      return
    }
    const canonical = target === manifest.types && key.startsWith('.#')
    entries[key] = { types: target, report: reportName(directory, canonical ? '.' : key) }
  }
  const visit = (value, subpath, conditions = [], covered = false, modes = ['import', 'require']) => {
    const key = conditions.length ? `${subpath}#${conditions.join('/')}` : subpath
    if (value === null) return modes
    if (typeof value === 'string') {
      if (!covered) unsupported.push(`No explicit types declaration for export ${key}.`)
      return modes
    }
    if (!value || typeof value !== 'object') {
      unsupported.push(`Unsupported export target for ${key}.`)
      return modes
    }
    if (Array.isArray(value)) {
      unsupported.push(`Export fallback arrays are not analyzed: ${key}.`)
      return modes
    }
    if (Object.hasOwn(value, 'types')) {
      add(key, value.types)
      covered ||= typeof value.types === 'string'
    }
    let remaining = [...modes]
    for (const [condition, child] of Object.entries(value)) {
      if (condition === 'types') continue
      const active = remaining.filter(mode => !['import', 'require'].includes(condition) || condition === mode)
      if (!active.length) continue
      const handled = visit(child, subpath, [...conditions, condition], covered, active)
      // Import/require always match their resolution mode. Custom conditions may
      // be absent, so their siblings still need checking. A later default is
      // unreachable when both modes already have a target (as in telemetry).
      if (['import', 'require', 'default'].includes(condition)) {
        remaining = remaining.filter(mode => !handled.includes(mode))
      }
    }
    return covered ? modes : modes.filter(mode => !remaining.includes(mode))
  }
  if (manifest.exports) {
    const exports = typeof manifest.exports === 'object' && Object.keys(manifest.exports).some(key => key.startsWith('.'))
      ? manifest.exports
      : { '.': manifest.exports }
    for (const [subpath, value] of Object.entries(exports)) {
      if (subpath === './package.json' || value === null) continue
      if (subpath.includes('*')) {
        unsupported.push(`Wildcard exports must be made explicit for analysis: ${subpath}.`)
        continue
      }
      const count = Object.keys(entries).length
      // Preserve legacy root declarations only when there are no explicit type
      // conditions; a top-level types field must not hide an uncovered sibling.
      const hasTypes = target => target && typeof target === 'object' &&
        (Object.hasOwn(target, 'types') || Object.values(target).some(hasTypes))
      const legacyRoot = subpath === '.' && !!manifest.types && !hasTypes(value)
      visit(value, subpath, [], legacyRoot)
      if (Object.keys(entries).length === count) {
        if (subpath === '.' && manifest.types) add('.', manifest.types)
        else unsupported.push(`No explicit types declaration for export ${subpath}.`)
      }
    }
  } else if (manifest.types) {
    add('.', manifest.types)
  }
  if (!Object.keys(entries).length) unsupported.push('No public declaration entry points found.')
  return {
    name: manifest.name,
    directory,
    entries,
    dependencies: { ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.optionalDependencies },
    unsupported,
  }
}

export function discoverPackages (root) {
  return fs.readdirSync(path.join(root, 'packages'), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const directory = `packages/${entry.name}`
      const manifest = JSON.parse(fs.readFileSync(path.join(root, directory, 'package.json'), 'utf8'))
      if (!manifest.name) throw new Error(`${directory}/package.json has no name.`)
      return manifest.private ? null : packageInfo(directory, manifest)
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name))
}

function git (root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true })
}

export function loadBaseline (root, ref) {
  const commit = ref ? git(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim() : undefined
  const files = commit
    ? new Set(git(root, ['ls-tree', '-r', '--name-only', commit, '--', 'compat/baseline', 'packages']).trim().split('\n'))
    : undefined
  const read = relative => {
    const absolute = safeFile(root, relative)
    if (commit) return files.has(relative) ? git(root, ['show', `${commit}:${relative}`]) : undefined
    return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : undefined
  }
  const raw = read('compat/baseline/inventory.json')
  let packages
  let legacy = false
  if (raw) {
    const inventory = JSON.parse(raw)
    if (inventory.schemaVersion !== schemaVersion || !Array.isArray(inventory.packages)) {
      throw new Error('Unsupported compatibility inventory. See docs/API-COMPATIBILITY.md for migration.')
    }
    packages = inventory.packages
    for (const pkg of packages) {
      safeFile(root, pkg.directory)
      if (typeof pkg.name !== 'string' || !pkg.entries || typeof pkg.entries !== 'object') {
        throw new Error('Invalid package in compatibility inventory.')
      }
      for (const entry of Object.values(pkg.entries)) safeFile(path.join(root, 'compat/baseline'), entry.report)
    }
    if (new Set(packages.map(pkg => pkg.name)).size !== packages.length) throw new Error('Duplicate package in compatibility inventory.')
  } else {
    legacy = true
    if (commit) {
      packages = [...files].filter(file => /^packages\/[^/]+\/package.json$/.test(file)).map(file => {
        const manifest = JSON.parse(read(file))
        return manifest.private ? null : packageInfo(path.posix.dirname(file), manifest)
      }).filter(Boolean)
    } else {
      packages = discoverPackages(root)
    }
    // Legacy reports only cover the canonical root declaration. Never invent subpath coverage.
    packages = packages.map(pkg => {
      const canonical = Object.entries(pkg.entries).find(([, entry]) => entry.report === reportName(pkg.directory, '.'))
      return { ...pkg, entries: Object.fromEntries(canonical ? [canonical] : [['.', { report: reportName(pkg.directory, '.') }]]) }
    })
  }
  return { packages, read, commit, legacy, label: commit ? `${ref} @ ${commit.slice(0, 8)}` : 'working baseline' }
}
