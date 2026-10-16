import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { safeFile, schemaVersion } from '../shared.mjs'

/** Replace only owned artifacts; retain unrelated generated logs. */
export function prepareArtifacts (root) {
  const generated = path.resolve(root, 'compat/generated')
  if (fs.existsSync(generated) && fs.lstatSync(generated).isSymbolicLink()) throw new Error('Unsafe generated output directory.')
  fs.mkdirSync(generated, { recursive: true })
  const logs = path.resolve(root, 'scripts/logs/compat')
  fs.mkdirSync(logs, { recursive: true })
  fs.rmSync(path.join(logs, 'build.log'), { force: true })
  for (const name of ['comparison', 'baseline', 'baseline-reference']) {
    const directory = path.resolve(generated, name)
    if (path.dirname(directory) !== generated || (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink())) {
      throw new Error('Unsafe baseline snapshot output directory.')
    }
    fs.rmSync(directory, { recursive: true, force: true })
  }
  for (const entry of fs.readdirSync(generated, { withFileTypes: true })) {
    if (!entry.isDirectory() && /\.api\.md(?:\.html)?$/.test(entry.name)) {
      fs.rmSync(safeFile(generated, entry.name), { force: true })
    }
  }
  // Remove the old Markdown report when migrating from the previous output format.
  for (const file of ['review.md', 'report.json', 'build.log']) fs.rmSync(path.join(generated, file), { force: true })
  return generated
}

export function writeFailure (generated, message) {
  fs.writeFileSync(path.join(generated, 'report.json'), `${JSON.stringify({ schemaVersion, error: message }, null, 2)}\n`)
}

/** Locate declarations in the original report, preserving actual report line numbers. */
function indexReport (text) {
  const match = /```(?:ts|typescript)\r?\n([\s\S]*?)\r?\n```/.exec(text)
  if (!match) return () => undefined
  const offset = match.index + match[0].indexOf(match[1])
  const file = ts.createSourceFile('report.d.ts', match[1], ts.ScriptTarget.Latest, true)
  const nodes = new Map()
  const bases = new Map()
  const aliases = new Map()
  const visit = (node, owner = '') => {
    const declaration = ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) ||
      ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node) || ts.isModuleDeclaration(node) ||
      ts.isEnumDeclaration(node) || ts.isEnumMember(node) || ts.isMethodDeclaration(node) || ts.isMethodSignature(node) ||
      ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)
    const memberName = declaration && node.name
    const name = ts.isConstructorDeclaration(node)
      ? 'ctor'
      : memberName && (ts.isStringLiteral(memberName) || ts.isNumericLiteral(memberName) ? memberName.text : memberName.getText(file))
    const key = name ? (owner ? `${owner}.${name}` : name) : owner
    if (name) {
      const previous = nodes.get(key)
      nodes.set(key, { start: previous?.start ?? node.getStart(file), end: node.end })
    }
    if ((ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) && node.heritageClauses) {
      bases.set(key, node.heritageClauses.flatMap(clause => clause.types.map(type => type.expression.getText(file))))
    }
    if (ts.isExportDeclaration(node) && !node.moduleSpecifier && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) aliases.set(element.name.text, element.propertyName?.text ?? element.name.text)
    }
    ts.forEachChild(node, child => visit(child, key))
  }
  visit(file)
  const resolve = (key, seen = new Set()) => {
    if (seen.has(key)) return undefined
    seen.add(key)
    const parts = key.split('.')
    parts[0] = aliases.get(parts[0]) ?? parts[0]
    key = parts.join('.')
    if (nodes.has(key)) return nodes.get(key)
    if (parts.length > 1) {
      for (const base of bases.get(parts[0]) ?? []) {
        const inherited = resolve([base, ...parts.slice(1)].join('.'), seen)
        if (inherited) return inherited
      }
    }
    return undefined
  }
  return symbol => {
    let key = symbol.replaceAll('()', '').replace(/ modifiers$/, '').replace(/\.(?:params\[|typeParams\[|returnType).*/, '')
    const requested = key
    while (key) {
      const location = resolve(key)
      if (location) {
        return {
          start: offset + location.start,
          end: offset + location.end,
          exact: key === requested,
          line: text.slice(0, offset + location.start).split('\n').length,
          endLine: text.slice(0, offset + location.end).split('\n').length,
        }
      }
      key = key.includes('.') ? key.slice(0, key.lastIndexOf('.')) : ''
    }
    return undefined
  }
}

function snapshot (generated, relative, text) {
  const file = safeFile(generated, relative)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  return { file: `compat/generated/${relative}`, locate: indexReport(text) }
}

/** Group only the display; preserve every original finding and its ID. */
export function writeReports (generated, tasks, results, { snapshotBaseline = false, baselineDirectory = 'baseline-reference' } = {}) {
  for (const result of results) {
    const task = tasks.find(task => task.name === result.name)
    const entries = new Map()
    for (const side of ['baseline', 'generated']) {
      const pkg = side === 'baseline' ? task.baseline : task.current
      for (const [entry, info] of Object.entries(pkg?.entries ?? {})) {
        const content = side === 'baseline' ? task.reports[entry] : result.reports[info.report]
        if (content === undefined) continue
        const sources = entries.get(entry) ?? {}
        if (side === 'baseline' && !snapshotBaseline) {
          safeFile(path.resolve(generated, '../baseline'), info.report)
          sources[side] = { file: `compat/baseline/${info.report}`, locate: indexReport(content) }
        } else {
          sources[side] = snapshot(generated, `${side === 'baseline' ? `${baselineDirectory}/` : ''}${info.report}`, content)
        }
        entries.set(entry, sources)
      }
    }
    result.comparisons = Object.fromEntries([...entries].map(([entry, sources]) => [entry,
      Object.fromEntries(Object.entries(sources).map(([side, source]) => [side, { file: source.file }])),
    ]))
    const groups = new Map()
    for (const finding of result.findings.filter(finding => finding.kind !== 'compatible')) {
      // Package/dependency metadata is already preserved in the JSON finding's before/after fields.
      const candidates = finding.code === 'dependencies.changed' || finding.code === 'package.removed' ? {} : entries.get(finding.entry ?? '.') ?? {}
      const removesDeclaration = /^(?:export|property|method|constructor)\.removed$/.test(finding.code)
      // A removed declaration has no generated counterpart (and conversely for an addition).
      const sources = Object.fromEntries(Object.entries(candidates).filter(([side]) => {
        if (side === 'generated' && removesDeclaration) return false
        if (side === 'baseline' && /^(?:export|property|method)\.added/.test(finding.code)) return false
        const field = side === 'baseline' ? 'before' : 'after'
        return !Object.hasOwn(finding, field) || !!finding[field]
      }))
      const locations = Object.fromEntries(Object.entries(sources).map(([side, source]) => [side, source.locate(finding.symbol)]))
      const origins = ['baseline', 'generated'].map(side => sources[side] && [sources[side].file, locations[side]?.start, locations[side]?.end])
      // Removal messages name each inheriting class, even when the origin is shared.
      const reason = removesDeclaration ? undefined : finding.message
      const key = Object.keys(sources).length && Object.values(locations).every(location => location?.exact)
        ? JSON.stringify([finding.code, finding.kind, reason, finding.entry, origins])
        : finding.id ?? finding
      finding.sources = Object.fromEntries(Object.entries(sources).map(([side, source]) => [side, {
        file: source.file, line: locations[side]?.line, endLine: locations[side]?.endLine,
      }]))
      const group = groups.get(key) ?? { findingIds: [], sources: finding.sources }
      group.findingIds.push(finding.id)
      groups.set(key, group)
    }
    result.breaks = [...groups.values()]
  }
}
