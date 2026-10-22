import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { after, describe, it } from 'node:test'
import { PassThrough } from 'node:stream'
import { canonicalTokens, compareDeclarations } from '../compat/analysis.mjs'
import { discoverPackages, loadBaseline, packageInfo } from '../shared.mjs'
import { parseArguments, selectPackages } from '../compat/config.mjs'
import { createReporter, formatReport, summarize } from '../compat/reporter.mjs'
import { prepareArtifacts, writeReports, writeFailure } from '../compat/artifacts.mjs'
import { analyzeAll, exitCode, findingId, updateBaselines } from '../compat/runner.mjs'
import { analyzePackage } from '../compat/worker.mjs'

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-compat-test-'))

after(() => {
  if (
    path.dirname(temporaryRoot) === os.tmpdir() &&
    path.basename(temporaryRoot).startsWith('agents-compat-test-')
  ) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 3 })
  }
})
let sequence = 0
const scratch = () => path.join(temporaryRoot, String(sequence++))
const result = (name, findings = [], rest = {}) => ({
  name,
  findings,
  reports: {},
  baselineChanged: false,
  ...rest
})
const fixture = (name = '@test/example') => {
  const root = scratch()

  fs.mkdirSync(path.join(root, 'packages/example'), { recursive: true })
  fs.mkdirSync(path.join(root, 'compat/baseline'), { recursive: true })
  fs.writeFileSync(
    path.join(root, 'packages/example/package.json'),
    JSON.stringify({ name, types: './index.d.ts' })
  )
  fs.writeFileSync(path.join(root, 'compat/baseline/example.api.md'), 'old report')

  return root
}

describe('compatibility classification against actual declarations', () => {
  const cases = [
    [
      'required parameter',
      'export declare function f(a: string): void;',
      'export declare function f(a: string, b: number): void;',
      'breaking',
      'param.addedRequired'
    ],
    [
      'optional parameter',
      'export declare function f(a: string): void;',
      'export declare function f(a: string, b?: number): void;',
      'compatible',
      'param.addedOptional'
    ],
    [
      'optional method parameter',
      'export declare class C { f(a: string): void; }',
      'export declare class C { f(a: string, b?: number): void; }',
      'compatible',
      'param.addedOptional'
    ],
    [
      'required method parameter',
      'export declare class C { f(a: string): void; }',
      'export declare class C { f(a: string, b: number): void; }',
      'breaking',
      'param.addedRequired'
    ],
    [
      'optional function value parameter',
      'export declare const f: (a: string) => void;',
      'export declare const f: (a: string, b?: number) => void;',
      'compatible',
      'param.addedOptional'
    ],
    [
      'required function value parameter',
      'export declare const f: (a: string) => void;',
      'export declare const f: (a: string, b: number) => void;',
      'breaking',
      'param.addedRequired'
    ],
    [
      'removed export',
      'export declare function f(): void;',
      'export {};',
      'breaking',
      'export.removed'
    ],
    [
      'required options property',
      'export interface Options { a: string; }',
      'export interface Options { a: string; b: number; }',
      'breaking',
      'property.addedRequired'
    ],
    [
      'optional options property',
      'export interface Options { a: string; }',
      'export interface Options { a: string; b?: number; }',
      'compatible',
      'property.addedOptional'
    ],
    [
      'preserved overload',
      'export declare function f(a: string): void;',
      'export declare function f(a: string): void; export declare function f(a: string, b: number): void;',
      'compatible',
      'overload.added'
    ],
    [
      'widened parameter',
      'export declare function f(a: string): void;',
      'export declare function f(a: string | number): void;',
      'compatible',
      'param.typeWidened'
    ],
    [
      'narrowed parameter',
      'export declare function f(a: string | number): void;',
      'export declare function f(a: string): void;',
      'breaking',
      'param.typeChanged'
    ],
    [
      'return gains undefined',
      'export declare function f(): string;',
      'export declare function f(): string | undefined;',
      'breaking',
      'returnType.changed'
    ],
    [
      'generic constraint',
      'export declare function f<T>(a: T): T;',
      'export declare function f<T extends string>(a: T): T;',
      'breaking',
      'generics.constraintChanged'
    ],
    [
      'namespace coverage',
      'export declare namespace N { function f(): void; }',
      'export declare namespace N {}',
      'possible',
      'coverage.possible'
    ],
    [
      'index signature coverage',
      'export interface O { [key: string]: string | number; }',
      'export interface O { [key: string]: string; }',
      'possible',
      'coverage.possible'
    ]
  ]

  for (const [name, before, after, kind, code] of cases) {
    it(name, () => {
      const findings = compareDeclarations(before, after, scratch())

      assert.ok(
        findings.some(finding => finding.kind === kind && finding.code === code),
        JSON.stringify(findings)
      )

      if (kind === 'compatible') {
        assert.ok(
          findings.every(finding => finding.kind === 'compatible'),
          JSON.stringify(findings)
        )
      }
    })
  }

  it('ignores quote style and comments while preserving literal contents', () => {
    assert.deepEqual(
      compareDeclarations(
        'export declare const value: "ready";',
        "// comment\nexport declare const value: 'ready';",
        scratch()
      ),
      []
    )
    assert.notEqual(canonicalTokens("'a | b'"), canonicalTokens("'a|b'"))
  })
  it('rejects malformed declarations rather than classifying them as unchanged', () => {
    assert.throws(() => compareDeclarations('export interface {', 'export interface {', scratch()))
  })
  it('ignores equivalent type notation', () => {
    assert.deepEqual(
      compareDeclarations(
        'export declare function f(a: string[]): void;',
        'export declare function f(a: Array<string>): void;',
        scratch()
      ),
      []
    )
  })
  it('does not warn about static, abstract or inherited members inside entirely new exports', () => {
    const after =
      'export declare abstract class Base { abstract run(): void; } export declare class Added extends Base { static instance(): Added; run(): void; }'
    const findings = compareDeclarations('export {};', after, scratch())

    assert.ok(findings.length > 0)
    assert.ok(
      findings.every(finding => finding.kind === 'compatible'),
      JSON.stringify(findings)
    )
  })
  it('ignores index parameter renames and accepts widened method inputs', () => {
    const before =
      'export declare class C { constructor(values?: { [k: string]: string }); f(value: string): void; }'
    const after =
      'export declare class C { constructor(values?: { [key: string]: string }); f(value: string | number): void; }'
    const findings = compareDeclarations(before, after, scratch())

    assert.ok(findings.some(finding => finding.code === 'param.typeWidened'))
    assert.ok(
      findings.every(finding => finding.kind === 'compatible'),
      JSON.stringify(findings)
    )
  })
  it('detects removed optional arguments on aliased callable properties', () => {
    const before = 'export interface Storage { write: (data: object, options?: object) => void; }'
    const after =
      'interface Storage_2 { write: (data: object) => void; } export { Storage_2 as Storage };'
    const findings = compareDeclarations(before, after, scratch())

    assert.ok(
      findings.some(
        finding => finding.kind === 'breaking' && finding.symbol === 'Storage.write.params[1]'
      ),
      JSON.stringify(findings)
    )
    assert.ok(!findings.some(finding => finding.kind === 'possible'), JSON.stringify(findings))
  })
  it('refines independent inputs on generic classes while preserving uncertainty for dependent types', () => {
    const before = 'export declare class C<T> { f(value: string): void; g(value: T): void; }'
    const after =
      'export declare class C<T> { f(value: string | number): void; g(value: T | number): void; }'
    const findings = compareDeclarations(before, after, scratch())

    assert.ok(
      findings.some(finding => finding.symbol === 'C.f.params[0]' && finding.kind === 'compatible')
    )
    assert.ok(
      findings.some(finding => finding.symbol === 'C.g.params[0]' && finding.kind === 'possible')
    )
  })
  it('resolves inherited constructors from current declarations and warns when unavailable', () => {
    const directory = scratch()

    fs.mkdirSync(directory, { recursive: true })
    const current = path.join(directory, 'current.d.ts')
    const before = 'export declare class C { constructor(folder: string); }'
    const after = 'export declare class C extends Internal {}'

    fs.writeFileSync(current, 'declare class Internal { constructor(folder: string); } ' + after)
    const resolved = compareDeclarations(before, after, path.join(directory, 'resolved'), current)

    assert.ok(
      !resolved.some(finding => finding.symbol.startsWith('C.ctor')),
      JSON.stringify(resolved)
    )
    const unresolved = compareDeclarations(before, after, path.join(directory, 'unresolved'))

    assert.ok(!unresolved.some(finding => finding.kind === 'breaking'), JSON.stringify(unresolved))
    assert.ok(unresolved.some(finding => finding.kind === 'possible'))
    const alias = 'declare class C_2 extends Internal {} export { C_2 as C };'

    fs.writeFileSync(current, 'declare class Internal { constructor(folder: string); } ' + alias)
    const aliased = compareDeclarations(before, alias, path.join(directory, 'aliased'), current)

    assert.ok(
      !aliased.some(finding => finding.symbol.startsWith('C.ctor')),
      JSON.stringify(aliased)
    )
    assert.ok(!aliased.some(finding => finding.kind === 'breaking'), JSON.stringify(aliased))
    const incompleteBefore = 'export declare class C extends Internal { x: string; }'
    const incompleteAfter = 'export declare class C extends Internal { x: string; f(): void; }'

    fs.writeFileSync(
      current,
      'declare class Internal { constructor(folder: string); } ' + incompleteAfter
    )
    const historicalGap = compareDeclarations(
      incompleteBefore,
      incompleteAfter,
      path.join(directory, 'historical'),
      current
    )

    assert.ok(
      !historicalGap.some(finding => finding.kind === 'breaking'),
      JSON.stringify(historicalGap)
    )
    assert.ok(
      historicalGap.some(
        finding => finding.symbol.startsWith('C.ctor') && finding.kind === 'possible'
      ),
      JSON.stringify(historicalGap)
    )
  })
  it('ignores import alias churn without hiding exported-name changes', () => {
    const before = 'import { Buffer } from "node:buffer"; export interface A { value: Buffer; }'
    const after =
      'import { Buffer as Buffer_2 } from "node:buffer"; export interface A { value: Buffer_2; }'

    assert.deepEqual(compareDeclarations(before, after, scratch()), [])
  })
  it('treats new aliased abstract exports as compatible additions', () => {
    const after =
      'declare abstract class Added_2 { abstract run(): void; static create(): Added_2; } export { Added_2 as Added };'
    const findings = compareDeclarations('export {};', after, scratch())

    assert.ok(
      findings.some(finding => finding.code === 'export.added' && finding.symbol === 'Added')
    )
    assert.ok(
      findings.every(finding => finding.kind === 'compatible'),
      JSON.stringify(findings)
    )
  })
  it('ignores internal export renames while retaining public API changes', () => {
    const before =
      'declare abstract class C { abstract run(): void; static create(): C; } export { C };'
    const after =
      'declare abstract class C_2 { abstract run(): void; static create(): C_2; } export { C_2 as C };'

    assert.deepEqual(compareDeclarations(before, after, scratch()), [])
    assert.deepEqual(
      compareDeclarations(
        'export declare abstract class C { abstract run(): void; static create(): C; }',
        after,
        scratch()
      ),
      []
    )
    const renamed = compareDeclarations(before, after.replace('as C }', 'as Other }'), scratch())

    assert.ok(renamed.some(finding => finding.code === 'export.removed' && finding.symbol === 'C'))
    const changed = compareDeclarations(
      before,
      after.replace('run()', 'run(required: string)'),
      scratch()
    )

    assert.ok(
      changed.some(finding => finding.kind === 'breaking' && finding.symbol.startsWith('C.run.')),
      JSON.stringify(changed)
    )
  })
  it('preserves multiple aliases and keeps internal names distinct from public names', () => {
    const before = 'declare abstract class C { abstract run(): void; } export { C as A, C as B };'
    const after =
      'declare abstract class C_2 { abstract run(): void; } export { C_2 as A, C_2 as B };'

    assert.deepEqual(compareDeclarations(before, after, scratch()), [])
    const singleAlias =
      'declare abstract class C { abstract run(): void; static make(): C; } export { C as Z };'
    const extraAlias = singleAlias.replace('C as Z', 'C as Z, C as A')
    const added = compareDeclarations(singleAlias, extraAlias, scratch())

    assert.ok(added.some(finding => finding.code === 'export.added' && finding.symbol === 'A'))
    assert.ok(
      added.every(finding => finding.kind === 'compatible'),
      JSON.stringify(added)
    )
    const removed = compareDeclarations(extraAlias, singleAlias, scratch())

    assert.ok(removed.some(finding => finding.code === 'export.removed' && finding.symbol === 'A'))
    assert.ok(
      !removed.some(finding => finding.symbol === 'Z' || finding.symbol.startsWith('Z.')),
      JSON.stringify(removed)
    )
    const collision =
      'declare class C { value: string; } declare class C_2 { nested: C; own: string; } export { C_2 as C };'
    const changed = compareDeclarations(
      collision,
      collision.replace('own: string', 'own: number'),
      scratch()
    )

    assert.ok(
      changed.some(finding => finding.kind === 'breaking' && finding.symbol === 'C.own'),
      JSON.stringify(changed)
    )
  })
  it('does not hide an unsupported static removal behind a compatible method change', () => {
    const findings = compareDeclarations(
      'export declare class C { static value: string; f(): void; }',
      'export declare class C { f(a?: string): void; }',
      scratch()
    )

    assert.ok(findings.some(finding => finding.kind === 'possible'))
  })
  it('requires review for required tuple rests, receiver constraints and newly optional output properties', () => {
    const cases = [
      ['export declare function f(): void;', 'export declare function f(...args: [string]): void;'],
      [
        'export declare function f(): void;',
        'export declare function f(this: { a: string }, b?: number): void;'
      ],
      [
        'export interface O { a: string; } export declare function f(): O;',
        'export interface O { a?: string; } export declare function f(): O;'
      ]
    ]

    for (const [before, after] of cases) {
      const findings = compareDeclarations(before, after, scratch())

      assert.ok(
        findings.some(finding => finding.kind === 'possible' || finding.kind === 'breaking'),
        JSON.stringify(findings)
      )
    }
  })
  it('binds generic export review IDs to the actual changed declarations', () => {
    const before = 'export { Buffer } from "node:buffer";'
    const first = compareDeclarations(
      before,
      'export { Buffer as A } from "node:buffer";',
      scratch()
    )
    const second = compareDeclarations(
      before,
      'export { Buffer as B } from "node:buffer";',
      scratch()
    )
    const firstReview = first.find(finding => finding.symbol === '<exports>')
    const secondReview = second.find(finding => finding.symbol === '<exports>')

    assert.notEqual(findingId('x', firstReview), findingId('x', secondReview))
  })
})

describe('compatibility command and inventory', () => {
  it('accepts options in any order and rejects obsolete or misspelled options', () => {
    assert.equal(parseArguments(['--update', 'agents-hosting'], {}).package, 'agents-hosting')
    assert.throws(() => parseArguments(['--verbose'], {}))
    assert.equal(parseArguments(['-h'], {}).help, true)
    assert.throws(() => parseArguments(['--local'], {}))
    assert.throws(() => parseArguments(['--concurrency', '0'], {}))
    assert.throws(() => parseArguments(['--concurrency', 'NaN'], {}))
    assert.throws(() => parseArguments(['a', 'b'], {}))
  })
  it('enumerates subpaths and type conditions while rejecting silent coverage gaps', () => {
    const pkg = packageInfo('packages/example', {
      name: 'example',
      types: './import.d.mts',
      exports: {
        '.': { import: { types: './import.d.mts' }, require: { types: './require.d.cts' } },
        './extra': { types: './extra.d.ts' },
        './package.json': './package.json'
      }
    })

    assert.deepEqual(Object.keys(pkg.entries), ['.#import', '.#require', './extra'])
    assert.equal(pkg.entries['.#import'].report, 'example.api.md')
    assert.equal(pkg.entries['.#require'].report, 'example-require.api.md')
    assert.deepEqual(pkg.unsupported, [])
    assert.ok(
      packageInfo('packages/x', { name: 'x', exports: { './*': './*.js' } }).unsupported.length
    )
    assert.ok(
      packageInfo('packages/x', {
        name: 'x',
        types: './index.d.ts',
        typesVersions: { '*': { '*': ['legacy/*'] } }
      }).unsupported.length
    )
  })
  it('rejects uncovered conditional branches without rejecting shared types or covered fallbacks', () => {
    const inspect = exports =>
      packageInfo('packages/example', { name: 'example', exports: { '.': exports } })
    const typedImport = { types: './esm.d.mts', default: './esm.mjs' }
    const mixed = inspect({ import: typedImport, require: './cjs.cjs' })

    assert.ok(
      mixed.unsupported.some(message => message.includes('.#require')),
      JSON.stringify(mixed)
    )
    const nested = inspect({ import: typedImport, require: { node: './cjs.cjs' } })

    assert.ok(
      nested.unsupported.some(message => message.includes('.#require/node')),
      JSON.stringify(nested)
    )
    const shared = inspect({ types: './shared.d.ts', import: './esm.js', require: './cjs.js' })

    assert.deepEqual(shared.unsupported, [])
    assert.deepEqual(Object.keys(shared.entries), ['.'])
    const covered = inspect({
      import: typedImport,
      require: { types: './cjs.d.cts', default: './cjs.cjs' },
      default: './esm.mjs'
    })

    assert.deepEqual(covered.unsupported, [])
    assert.deepEqual(Object.keys(covered.entries), ['.#import', '.#require'])
  })
  it('includes removed packages and accepts explicit package names or paths', () => {
    const pkg = packageInfo('packages/example', { name: '@test/example', types: './index.d.ts' })

    assert.equal(selectPackages([], [pkg])[0].current, undefined)
    assert.equal(selectPackages([pkg], [], 'example')[0].name, '@test/example')
    assert.throws(() => selectPackages([pkg], [], 'typo'))
  })
  it('reads a fixed git baseline despite working-tree edits', () => {
    const root = fixture()
    const git = args => execFileSync('git', args, { cwd: root, stdio: 'pipe', windowsHide: true })

    git(['init'])
    const writeObject = (args, input) =>
      execFileSync('git', args, { cwd: root, input, encoding: 'utf8', windowsHide: true }).trim()
    const blob = file =>
      writeObject(['hash-object', '-w', '--stdin'], fs.readFileSync(path.join(root, file)))
    const tree = entries => writeObject(['mktree'], `${entries.join('\n')}\n`)
    const reportTree = tree([
      `100644 blob ${blob('compat/baseline/example.api.md')}\texample.api.md`
    ])
    const compatTree = tree([`040000 tree ${reportTree}\tbaseline`])
    const packageTree = tree([`100644 blob ${blob('packages/example/package.json')}\tpackage.json`])
    const packagesTree = tree([`040000 tree ${packageTree}\texample`])
    const rootTree = tree([
      `040000 tree ${compatTree}\tcompat`,
      `040000 tree ${packagesTree}\tpackages`
    ])
    const commit = writeObject(
      [
        '-c',
        'user.name=Compat Test',
        '-c',
        'user.email=compat@example.test',
        'commit-tree',
        rootTree
      ],
      'fixture\n'
    )

    fs.writeFileSync(path.join(root, 'compat/baseline/example.api.md'), 'new report')
    const baseline = loadBaseline(root, commit)

    assert.equal(baseline.read('compat/baseline/example.api.md'), 'old report')
    assert.equal(baseline.commit, commit)
  })
})

describe('compatibility policy, scheduling and baseline writes', () => {
  it('binds removal finding IDs to the removed contract', () => {
    const baseline = packageInfo('packages/example', {
      name: '@test/example',
      types: './index.d.ts'
    })

    for (const current of [undefined, { ...baseline, entries: {} }]) {
      const findings = ['export declare const a: string;', 'export declare const a: number;'].map(
        report => {
          const task = { name: baseline.name, baseline, current, reports: { '.': report } }

          return analyzePackage({ root: temporaryRoot, directory: scratch(), task }).findings[0]
        }
      )

      assert.notEqual(findingId(baseline.name, findings[0]), findingId(baseline.name, findings[1]))
    }
  })
  it('fails stale baselines but allows explicit updates regardless of finding severity', () => {
    assert.equal(
      exitCode([result('x', [], { baselineChanged: true, error: 'extraction failed' })]),
      2
    )
    assert.equal(exitCode([result('x', [], { skipped: true })], { update: true }), 2)

    for (const kind of ['breaking', 'possible', 'compatible']) {
      assert.equal(exitCode([result('x', [{ kind }])]), 0)
      assert.equal(exitCode([result('x', [{ kind }], { baselineChanged: true })]), 1)
      assert.equal(
        exitCode([result('x', [{ kind }], { baselineChanged: true })], { update: true }),
        0
      )
    }

    assert.equal(exitCode([result('x', [{ kind: 'possible', code: 'baseline.missing' }])]), 2)
    assert.equal(
      exitCode([result('x', [{ kind: 'possible', code: 'baseline.missing' }])], { update: true }),
      0
    )
  })
  it('limits concurrency, preserves order and continues after package failure', async () => {
    let active = 0
    let peak = 0
    const tasks = ['a', 'b', 'c', 'd'].map(name => ({ name }))
    const results = await analyzeAll(tasks, {
      concurrency: 2,
      analyze: async task => {
        peak = Math.max(peak, ++active)
        await new Promise(resolve => setImmediate(resolve))
        active--

        if (task.name === 'b') {
          throw new Error('bad declarations')
        }

        return result(task.name)
      }
    })

    assert.equal(peak, 2)
    assert.deepEqual(
      results.map(entry => entry.name),
      ['a', 'b', 'c', 'd']
    )
    assert.equal(results[1].error, 'bad declarations')
    assert.equal(results[3].error, undefined)
  })
  it('does not start queued work after interruption', async () => {
    const controller = new AbortController()
    const results = await analyzeAll([{ name: 'a' }, { name: 'b' }], {
      concurrency: 1,
      signal: controller.signal,
      analyze: async task => {
        controller.abort()

        return result(task.name)
      }
    })

    assert.equal(results[1].skipped, true)
  })
  it('updates reports with findings but refuses incomplete analysis', () => {
    const root = fixture()
    const current = discoverPackages(root)[0]
    const tasks = [{ name: current.name, current }]
    const changed = result(current.name, [], {
      baselineChanged: true,
      reports: { 'example.api.md': 'new report' }
    })

    assert.equal(updateBaselines(root, tasks, [changed]), 1)
    assert.equal(
      fs.readFileSync(path.join(root, 'compat/baseline/example.api.md'), 'utf8'),
      'new report'
    )
    assert.equal(loadBaseline(root).legacy, false)
    assert.equal(
      updateBaselines(root, tasks, [
        { ...changed, findings: [{ kind: 'breaking' }, { kind: 'possible' }] }
      ]),
      1
    )
    assert.throws(
      () => updateBaselines(root, tasks, [{ ...changed, error: 'Analysis failed.' }]),
      /Incomplete analysis/
    )
    assert.throws(
      () => updateBaselines(root, tasks, [{ ...changed, skipped: true }]),
      /Incomplete analysis/
    )
    assert.equal(
      fs.readFileSync(path.join(root, 'compat/baseline/example.api.md'), 'utf8'),
      'new report'
    )
  })
  it('preserves a report when a package rename reuses its filename', () => {
    const root = fixture('@test/old')
    const old = discoverPackages(root)[0]

    updateBaselines(
      root,
      [{ name: old.name, current: old }],
      [result(old.name, [], { reports: { 'example.api.md': 'old report' } })]
    )
    const current = { ...old, name: '@test/new' }
    const tasks = [
      { name: old.name, baseline: old },
      { name: current.name, current }
    ]
    const results = [
      result(old.name, [{ kind: 'breaking' }], { baselineChanged: true }),
      result(current.name, [], {
        baselineChanged: true,
        reports: { 'example.api.md': 'new report' }
      })
    ]

    assert.equal(updateBaselines(root, tasks, results), 2)
    assert.equal(
      fs.readFileSync(path.join(root, 'compat/baseline/example.api.md'), 'utf8'),
      'new report'
    )
    assert.deepEqual(
      loadBaseline(root).packages.map(pkg => pkg.name),
      ['@test/new']
    )
  })
  it('rolls back report replacements if committing the inventory fails', t => {
    const root = fixture()
    const current = discoverPackages(root)[0]
    const rename = fs.renameSync

    t.mock.method(fs, 'renameSync', (source, destination) => {
      if (path.basename(destination) === 'inventory.json') {
        throw new Error('simulated write failure')
      }

      return rename(source, destination)
    })
    assert.throws(
      () =>
        updateBaselines(
          root,
          [{ name: current.name, current }],
          [result(current.name, [], { reports: { 'example.api.md': 'new report' } })]
        ),
      /simulated write failure/
    )
    assert.equal(
      fs.readFileSync(path.join(root, 'compat/baseline/example.api.md'), 'utf8'),
      'old report'
    )
    assert.deepEqual(fs.readdirSync(path.join(root, 'compat/baseline')), ['example.api.md'])
  })
})

describe('compatibility comparison artifacts', () => {
  it('links ordinary checks directly to working baselines and generated reports', () => {
    const root = fixture()
    const generated = prepareArtifacts(root)
    const before = '```ts\nexport interface A { value: string; }\n```\n'
    const after = before.replace('string', 'number')

    fs.writeFileSync(path.join(root, 'compat/baseline/example.api.md'), before)
    const pkg = discoverPackages(root)[0]
    const finding = {
      kind: 'breaking',
      code: 'property.typeChanged',
      symbol: 'A.value',
      id: 'change'
    }
    const entry = result(pkg.name, [finding], { reports: { 'example.api.md': after } })

    writeReports(
      generated,
      [{ name: pkg.name, baseline: pkg, current: pkg, reports: { '.': before } }],
      [entry]
    )
    assert.equal(finding.sources.baseline.file, 'compat/baseline/example.api.md')
    assert.equal(finding.sources.generated.file, 'compat/generated/example.api.md')
    assert.equal(finding.sources.baseline.line, 2)
    assert.equal(fs.readFileSync(path.join(root, finding.sources.baseline.file), 'utf8'), before)
    assert.equal(fs.readFileSync(path.join(root, finding.sources.generated.file), 'utf8'), after)
    assert.ok(!fs.existsSync(path.join(generated, 'baseline')))
    assert.ok(!fs.existsSync(path.join(generated, 'baseline-reference')))
    assert.ok(!fs.existsSync(path.join(generated, 'comparison')))
  })
  it('preserves compared snapshots, locates exact lines, and groups inherited declarations', () => {
    const root = fixture()
    const generated = prepareArtifacts(root)
    const before =
      '# API report\r\n\r\n```ts\r\nexport class Base {\r\n  protected value: string;\r\n}\r\nexport class Child extends Base {}\r\n```\r\n'
    const after = before.replace('value: string', 'value: string | number')
    const pkg = discoverPackages(root)[0]
    const task = { name: pkg.name, baseline: pkg, current: pkg, reports: { '.': before } }
    const findings = ['Base.value', 'Child.value'].map((symbol, index) => ({
      kind: 'breaking',
      code: 'property.typeChanged',
      message: 'Property value changed.',
      symbol,
      entry: '.',
      id: `id${index}`
    }))
    const first = result(pkg.name, findings, {
      reports: { 'example.api.md': after },
      baselineChanged: true
    })
    const other = { name: '@test/other', reports: {}, current: { entries: {} } }
    const second = result(other.name)

    writeReports(generated, [task, other], [first, second], { snapshotBaseline: true })
    assert.equal(first.breaks.length, 1)
    assert.deepEqual(first.breaks[0].findingIds, ['id0', 'id1'])
    assert.equal(summarize([first, second]).possibleBreaks, 1)
    assert.ok(!fs.existsSync(path.join(generated, 'review.md')))
    assert.equal(findings[0].sources.baseline.line, 5)
    assert.equal(findings[1].sources.baseline.line, 5)
    const saved = path.join(root, findings[0].sources.baseline.file)

    updateBaselines(root, [task], [first])
    assert.equal(fs.readFileSync(path.join(root, 'compat/baseline/example.api.md'), 'utf8'), after)
    assert.equal(
      findings[0].sources.baseline.file,
      'compat/generated/baseline-reference/example.api.md'
    )
    assert.equal(findings[0].sources.generated.file, 'compat/generated/example.api.md')
    assert.equal(fs.readFileSync(saved, 'utf8'), before)
    assert.ok(!fs.existsSync(`${saved}.html`))
  })
  it('replaces stale results and preserves unrelated generated logs', () => {
    const root = fixture()
    const generated = prepareArtifacts(root)

    fs.mkdirSync(path.join(generated, 'comparison/old'), { recursive: true })
    fs.writeFileSync(path.join(generated, 'comparison/old/report.api.md'), 'stale')
    fs.writeFileSync(path.join(generated, 'report.json'), '{"stale":true}')
    fs.writeFileSync(path.join(generated, 'custom.log'), 'keep')
    const logs = path.join(root, 'scripts/logs/compat')

    fs.writeFileSync(path.join(logs, 'build.log'), 'stale build')
    fs.writeFileSync(path.join(logs, 'custom.log'), 'keep')
    fs.writeFileSync(path.join(generated, 'review.md'), 'legacy review')
    fs.writeFileSync(path.join(generated, 'comparison/old/report.api.md.html'), 'legacy HTML')
    fs.mkdirSync(path.join(generated, 'baseline'))
    fs.writeFileSync(path.join(generated, 'baseline/example.api.md'), 'stale snapshot')
    fs.mkdirSync(path.join(generated, 'baseline-reference'))
    fs.writeFileSync(path.join(generated, 'baseline-reference/example.api.md'), 'stale reference')
    fs.writeFileSync(path.join(generated, 'example.api.md'), 'stale generated report')
    prepareArtifacts(root)
    assert.ok(!fs.existsSync(path.join(generated, 'comparison/old/report.api.md')))
    assert.ok(!fs.existsSync(path.join(generated, 'report.json')))
    assert.ok(!fs.existsSync(path.join(generated, 'review.md')))
    assert.ok(!fs.existsSync(path.join(generated, 'baseline')))
    assert.ok(!fs.existsSync(path.join(generated, 'baseline-reference')))
    assert.ok(!fs.existsSync(path.join(generated, 'example.api.md')))
    assert.equal(
      fs.readFileSync(path.join(root, 'compat/baseline/example.api.md'), 'utf8'),
      'old report'
    )
    assert.equal(fs.readFileSync(path.join(generated, 'custom.log'), 'utf8'), 'keep')
    assert.ok(!fs.existsSync(path.join(logs, 'build.log')))
    assert.equal(fs.readFileSync(path.join(logs, 'custom.log'), 'utf8'), 'keep')
    writeFailure(generated, 'Build failed.')
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(generated, 'report.json'), 'utf8')).error,
      'Build failed.'
    )
  })
  it('does not merge independent declarations or invent missing source line numbers', () => {
    const root = fixture()
    const generated = prepareArtifacts(root)
    const before =
      '```ts\nexport interface A { value: string; }\nexport interface B { value: string; }\n```\n'
    const pkg = discoverPackages(root)[0]
    const findings = ['A.value', 'B.value', '<dependencies>'].map((symbol, index) => ({
      kind: 'possible',
      code: 'changed',
      message: 'Changed.',
      symbol,
      id: String(index)
    }))
    const entry = result(pkg.name, findings, {
      reports: { 'example.api.md': before.replaceAll('string', 'number') }
    })

    writeReports(
      generated,
      [{ name: pkg.name, baseline: pkg, current: pkg, reports: { '.': before } }],
      [entry]
    )
    assert.equal(entry.breaks.length, findings.length)
    assert.equal(findings[0].sources.baseline.line, 2)
    assert.equal(findings[1].sources.baseline.line, 3)
    assert.equal(findings[2].sources.baseline.line, undefined)
  })
  it('keeps same-line declarations and ancestor fallbacks separate and resolves quoted members', () => {
    const root = fixture()
    const generated = prepareArtifacts(root)
    const before =
      '```ts\nexport interface A { value: string; } export interface B { value: string; }\nexport interface C {\n  "value": string;\n}\n```\n'
    const pkg = discoverPackages(root)[0]
    const symbols = ['A.value', 'B.value', 'C.value', 'C.unknownA', 'C.unknownB']
    const findings = symbols.map((symbol, index) => ({
      kind: 'possible',
      code: 'changed',
      message: 'Changed.',
      symbol,
      id: String(index)
    }))
    const entry = result(pkg.name, findings, {
      reports: { 'example.api.md': before.replaceAll('string', 'number') }
    })

    writeReports(
      generated,
      [{ name: pkg.name, baseline: pkg, current: pkg, reports: { '.': before } }],
      [entry]
    )
    assert.equal(entry.breaks.length, findings.length)
    assert.equal(findings[0].sources.baseline.line, 2)
    assert.equal(findings[1].sources.baseline.line, 2)
    assert.equal(findings[2].sources.baseline.line, 4)
    assert.equal(findings[3].sources.baseline.line, 3)
  })
  it('links removed declarations only to the baseline and retains metadata comparisons', () => {
    const root = fixture()
    const generated = prepareArtifacts(root)
    const before = 'export interface A { value: string; }'
    const after = 'export interface A {}'
    const pkg = discoverPackages(root)[0]
    const findings = compareDeclarations(before, after, scratch())

    findings.push({
      kind: 'possible',
      code: 'dependencies.changed',
      symbol: '<dependencies>',
      before: '{}',
      after: '{"dep":"2"}'
    })

    for (const finding of findings) {
      finding.id = findingId(pkg.name, finding)
    }

    const entry = result(pkg.name, findings, {
      reports: { 'example.api.md': `\`\`\`ts\n${after}\n\`\`\`\n` }
    })

    writeReports(
      generated,
      [
        {
          name: pkg.name,
          baseline: pkg,
          current: pkg,
          reports: { '.': `\`\`\`ts\n${before}\n\`\`\`\n` }
        }
      ],
      [entry]
    )
    const removed = findings.find(finding => finding.symbol === 'A.value')

    assert.equal(removed.sources.baseline.line, 2)
    assert.equal(removed.sources.generated, undefined)
    const dependencies = findings.find(finding => finding.code === 'dependencies.changed')

    assert.deepEqual(dependencies.sources, {})
    assert.equal(dependencies.before, '{}')
    assert.equal(dependencies.after, '{"dep":"2"}')
    assert.ok(entry.comparisons['.'].generated.file.endsWith('example.api.md'))
  })
  it('groups inherited removals using their shared baseline declaration', () => {
    const root = fixture()
    const generated = prepareArtifacts(root)
    const before = 'export class Base { value: string; } export class Child extends Base {}'
    const after = 'export class Base {} export class Child extends Base {}'
    const pkg = discoverPackages(root)[0]
    const findings = compareDeclarations(before, after, scratch())

    for (const finding of findings) {
      finding.id = findingId(pkg.name, finding)
    }

    assert.equal(findings.filter(finding => finding.code === 'property.removed').length, 2)
    const entry = result(pkg.name, findings, {
      reports: { 'example.api.md': `\`\`\`ts\n${after}\n\`\`\`\n` }
    })

    writeReports(
      generated,
      [
        {
          name: pkg.name,
          baseline: pkg,
          current: pkg,
          reports: { '.': `\`\`\`ts\n${before}\n\`\`\`\n` }
        }
      ],
      [entry]
    )
    assert.equal(entry.breaks.length, 1)
    assert.equal(entry.breaks[0].findingIds.length, 2)
    assert.equal(entry.breaks[0].sources.generated, undefined)
    assert.equal(summarize([entry]).possibleBreaks, 1)
  })
})

describe('compatibility terminal output', () => {
  const results = [
    result(
      'agents-hosting',
      [
        {
          kind: 'breaking',
          symbol: 'Adapter.process',
          message: 'Required parameter added.',
          before: 'process(context)',
          after: 'process(context, options)',
          id: 'abc'
        }
      ],
      {
        baselineChanged: true,
        breaks: [
          {
            findingIds: ['abc'],
            sources: {
              baseline: { file: 'compat/generated/baseline.api.md', line: 235 },
              generated: { file: 'compat/generated/current.api.md', line: 236 }
            }
          }
        ],
        durationMs: 1200
      }
    ),
    result('agents-express', [{ kind: 'compatible', symbol: 'helper', message: 'Export added.' }])
  ]

  it('prints a single clickable source pair without finding descriptions or diffs', () => {
    const text = formatReport(results, {
      color: true,
      hyperlinks: true,
      terminal: 'other',
      durationMs: 8400
    })
    const pair = text.split('\n').find(line => line.includes('baseline:235'))

    assert.ok(pair.includes('generated:236'))
    assert.ok(pair.includes('#L235'))
    assert.ok(pair.includes('#L236'))
    assert.ok(text.indexOf(pair) < text.indexOf('agents-express'))
    assert.ok(!text.includes('Required parameter added.'))
    assert.ok(!text.includes('process(context)'))
    assert.match(text, /2 analyzed · 1 to review · 1 possible break · 0 errors · 8.4s/)
    assert.match(text, /1.2s/)
    assert.ok(!text.includes('\u001B[31m'))
    assert.ok(text.includes('\u001B[2;3m'))
    assert.match(text, /Tip:/)
  })
  it('counts each affected package once and keeps harmless baseline drift separate', () => {
    const summary = summarize([result('x', [{ kind: 'breaking' }, { kind: 'compatible' }])])

    assert.equal(summary.toReview, 1)
    assert.equal(summary.total, 1)
    const harmless = result('y', [{ kind: 'compatible' }], { baselineChanged: true })

    assert.equal(summarize([harmless]).toReview, 0)
    assert.match(formatReport([harmless]), /Baseline outdated/)
    assert.match(formatReport([harmless]), /npm run compat -- --update/)
    assert.match(formatReport([harmless], { updated: 1 }), /Baseline updated/)
    assert.ok(!formatReport([harmless], { updated: 1 }).includes('Baseline outdated'))
    assert.match(formatReport([harmless]), /1 baselines need updating/)
  })
  it('keeps possible changes visible and warns after an explicit update', () => {
    const results = [
      result('x', [{ kind: 'possible', symbol: 'C', message: 'Base type changed.' }], {
        baselineChanged: true
      })
    ]
    const text = formatReport(results)

    assert.match(text, /Possible breaks/)
    assert.ok(!text.includes('Review required'))
    const updated = formatReport(results, { updated: 1, updateCompleted: true })

    assert.match(
      updated,
      /Warning: Baselines were updated, but possible breaking changes still need your review\./
    )
    assert.match(updated, /Possible breaks/)
    assert.match(updated, /1 to review/)
    assert.doesNotMatch(updated, /npm run compat -- --update/)
    assert.doesNotMatch(formatReport(results, { updateError: 'write failed' }), /Warning:/)
  })
  it('uses plain deterministic output for non-interactive streams', () => {
    const stream = new PassThrough()
    let text = ''

    stream.on('data', chunk => {
      text += chunk
    })
    const reporter = createReporter([{ name: 'x' }], { color: true }, stream)

    reporter.started(0)
    reporter.finished(0, result('x'))
    reporter.finish([result('x')], {})
    assert.ok(!text.includes('\u001B'))
    assert.ok(!text.includes('◐'))
    assert.match(text, /No breaks detected/)
  })
  it('keeps source paths in plain logs and reports errors without counting them as breaks', () => {
    const failed = result('failed', [{ kind: 'possible' }], { error: 'failed analysis' })
    const skipped = result('skipped', [], { skipped: true })
    const text = formatReport([...results, failed, skipped])
    const pair = text
      .split('\n')
      .find(line => line.includes('baseline: compat/generated/baseline.api.md:235'))

    assert.ok(pair.includes('generated: compat/generated/current.api.md:236'))
    assert.ok(!text.includes('\u001B'))
    assert.match(text, /details: compat\/generated\/report.json/)
    assert.match(text, /2 analyzed · 1 to review · 1 possible break · 1 errors · 1 skipped/)
    assert.ok(!text.includes('npm run compat -- --update'))
  })
  it('keeps findings visible after updates and safely encodes hyperlink paths', () => {
    const entry = result('updated', [{ kind: 'breaking' }], {
      breaks: [{ sources: { baseline: { file: 'compat/generated/a #b.api.md', line: 2 } } }]
    })

    assert.equal(summarize([entry]).possibleBreaks, 1)
    assert.equal(summarize([entry]).toReview, 1)
    const text = formatReport([entry], { hyperlinks: true, terminal: 'other' })

    assert.match(text, /a%20%23b.api.md#L2/)
    assert.ok(text.includes('baseline:2'))
    assert.ok(!text.includes('generated:'))
  })
  it('uses VS Code editor links with explicit line and column instead of file fragments', () => {
    const entry = result('package', [{ kind: 'breaking' }], {
      breaks: [
        {
          sources: {
            baseline: { file: 'compat/generated/a #b.api.md', line: 235 },
            generated: { file: 'compat/generated/c.api.md', line: 236 }
          }
        }
      ]
    })
    const text = formatReport([entry], { hyperlinks: true, terminal: 'vscode' })
    const targets = text
      .split('\u001B]8;;')
      .slice(1)
      .map(part => part.split('\u001B')[0])
      .filter(Boolean)
      .map(target => new URL(target))

    assert.equal(targets.length, 2)
    assert.ok(
      targets.every(
        target => target.protocol === 'vscode:' && target.host === 'file' && !target.hash
      )
    )
    assert.ok(targets[0].pathname.endsWith('/a%20%23b.api.md:235:1'))
    assert.ok(targets[1].pathname.endsWith('/c.api.md:236:1'))
    assert.match(text, /baseline:235/)
    assert.match(text, /generated:236/)
    assert.ok(!formatReport([entry], { terminal: 'vscode' }).includes('vscode://'))
  })
  it('removes terminal control characters from findings', () => {
    const text = formatReport([
      result('x', [{ kind: 'breaking', symbol: '\u001B[2Jbad', message: '\u0007bad' }])
    ])

    assert.ok(!text.includes('\u001B'))
    assert.ok(!text.includes('\u0007'))
  })
  it('restores the cursor when a live display closes early', () => {
    const stream = new PassThrough()

    Object.assign(stream, { isTTY: true, columns: 100, rows: 30 })
    let text = ''

    stream.on('data', chunk => {
      text += chunk
    })
    const reporter = createReporter([{ name: 'x' }], { color: true }, stream)

    reporter.started(0)
    reporter.close()
    reporter.close()

    if (process.env.TERM !== 'dumb') {
      assert.ok(text.includes('\u001B[?25l'))
      assert.equal(text.split('\u001B[?25h').length, 2)
    }
  })
})
