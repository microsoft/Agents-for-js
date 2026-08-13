import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { checkRepository, formatFailure, formatReport, formatRuleGuide, parseArguments, ruleDefinitions, supportsColor } from '../repo-doctor.mjs'

function fixture (mutate = () => {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'repo-doctor-'))
  const write = (file, value) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), value)
  }
  const readJson = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'))
  const remove = file => rmSync(path.join(root, file), { force: true, recursive: true })
  const repository = { type: 'git', url: 'https://example.test/repo.git' }
  const author = { name: 'Example' }
  write('package.json', JSON.stringify({ name: 'repo', version: '1.0.0', private: true, type: 'module', scripts: { 'repo:doctor': 'node scripts/repo-doctor.mjs' }, workspaces: ['packages/*', 'test-agents/*'], engines: { node: '>=20.0.0' }, devDependencies: { '@types/node': '20.1.0' }, license: 'MIT', homepage: 'https://example.test', repository, author }))
  write('.nvmrc', 'v24.0.0\n')
  write('tsconfig.build.json', JSON.stringify({ references: [{ path: 'packages/agents-example' }, { path: 'test-agents/example' }] }))
  write('README.md', '# Repo\n\n## Packages Overview\n\n| Package Name | Description |\n|---|---|\n| `@microsoft/agents-example` | Example |\n')
  write('test-agents/README.md', '# Agents\n\n## Test-agent catalog\n\n- [example](example)\n')
  write('.github/workflows/ci.yml', 'jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm ci\n      - run: npm run repo:doctor\n      - run: npm run build\n        node-version: 24\n')
  write('.github/workflows/api-docs.yml', 'node-version: 24\n')
  write('.azdo/ci-pr.yaml', "customCommand: 'ci'\nversion: '24.x'\nscript: npm run repo:doctor\nscript: npm run build\n")
  write('.devcontainer/devcontainer.json', '"image": "javascript-node:1-24-bookworm"\n')
  const packageManifest = { name: '@microsoft/agents-example', version: '1.0.0', description: 'Example', license: 'MIT', repository, homepage: 'https://example.test', author, engines: { node: '>=20.0.0' }, main: './dist/index.js', types: './dist/index.d.ts', exports: { '.': { require: './dist/index.js', import: './dist/index.js', types: './dist/index.d.ts' }, './package.json': './package.json' }, files: ['dist'] }
  write('packages/agents-example/package.json', JSON.stringify(packageManifest))
  write('packages/agents-example/README.md', '# @microsoft/agents-example\n')
  write('packages/agents-example/tsconfig.json', '{}')
  write('compat/baseline/agents-example.api.md', '## API Report File for "@microsoft/agents-example"\n')
  write('test-agents/example/package.json', JSON.stringify({ name: 'example-agent', version: '1.0.0', private: true, main: './dist/index.js', scripts: { build: 'tsc --build', start: 'npm run build && node --env-file .env ./dist/index.js' } }))
  write('test-agents/example/README.md', '# Example\n')
  write('test-agents/example/tsconfig.json', JSON.stringify({ extends: '../../tsconfig.json', compilerOptions: { rootDir: 'src', outDir: 'dist' } }))
  write('test-agents/example/src/index.ts', 'console.log("example")\n')
  write('test-agents/example/env.TEMPLATE', 'KEY=\n')
  mutate({ root, write, readJson, remove })
  return root
}

describe('repo:doctor', () => {
  it('reports a clean fixture', () => {
    const report = checkRepository(fixture())
    assert.equal(report.status, 'pass', JSON.stringify(report.findings, null, 2))
    assert.equal(report.findings.length, 0)
  })

  it('formats every rule definition in the rule guide', () => {
    const guide = formatRuleGuide()
    for (const [ruleId, definition] of Object.entries(ruleDefinitions)) {
      assert.equal(typeof definition.fix, 'string')
      assert.equal(typeof definition.what, 'string')
      assert.equal(typeof definition.why, 'string')
      assert.equal(guide.includes('  ' + ruleId + ' '), true)
    }
  })

  it('detects missing build references and invalid documentation imports', () => {
    const root = fixture(({ write }) => {
      write('tsconfig.build.json', JSON.stringify({ references: [] }))
      write('docs/example.md', "```ts\nimport { debug } from '@microsoft/agents-example/logger'\n```\n")
    })
    const report = checkRepository(root)
    assert.deepEqual(report.findings.map(finding => finding.ruleId), ['docs/unexported-import', 'build/missing-reference'])
    for (const finding of report.findings) {
      assert.ok(finding.fix)
      assert.notEqual(finding.fix, finding.message)
    }
    const output = formatReport(report, { color: false })
    assert.match(output, /docs\/example\.md\n\s+2:\d+\s+error/)
    assert.match(output, /fix\s+Use an exported specifier/)
    assert.match(output, /packages\/agents-example: Workspace has tsconfig\.json/)
    assert.match(output, /✖ 2 repository errors across 2 files/)
    const diagnosticLines = output.split('\n')
    const errorLine = diagnosticLines.find(line => line.includes(' error  '))
    const fixLine = diagnosticLines.find(line => line.includes(' fix    '))
    assert.equal(errorLine.indexOf('error'), fixLine.indexOf('fix'))
  })

  it('does not require every TypeScript test agent in the root build graph', () => {
    const root = fixture(({ write }) => write('tsconfig.build.json', JSON.stringify({ references: [{ path: 'packages/agents-example' }] })))
    assert.equal(checkRepository(root).findings.some(finding => finding.ruleId === 'build/missing-reference'), false)
  })

  it('catalog findings use the heading location and item-specific fixes', () => {
    const root = fixture(({ write }) => write('test-agents/README.md', '# Agents\n\n## Test-agent catalog\n'))
    const report = checkRepository(root)
    const finding = report.findings.find(item => item.ruleId === 'docs/test-agent-catalog-missing')
    assert.equal(finding.line, 3)
    assert.equal(finding.column, 1)
    assert.equal(finding.message, 'Missing from the test-agent catalog.')
    assert.equal(finding.fix, 'Add [example](example) to the catalog.')
  })

  it('formats unavailable locations as a file-level marker', () => {
    const root = fixture(({ remove }) => remove('test-agents/example/README.md'))
    const output = formatReport(checkRepository(root), { color: false })
    assert.match(output, /test-agents\/example\/README\.md\n\s+--:--\s+error/)
    assert.doesNotMatch(output, /0:0/)
    assert.match(formatFailure(new Error('boom'), { color: false }), /--:--\s+error/)
  })

  it('reports one catalog heading error without cascading entries', () => {
    const root = fixture(({ write }) => write('test-agents/README.md', '# Agents\n'))
    const findings = checkRepository(root).findings
    assert.equal(findings.filter(finding => finding.ruleId === 'docs/test-agent-catalog-heading-missing').length, 1)
    assert.equal(findings.some(finding => finding.ruleId === 'docs/test-agent-catalog-missing'), false)
  })

  it('discovers workspaces independently and includes static test agents', () => {
    const root = fixture(({ write, readJson }) => {
      const manifest = readJson('package.json')
      manifest.workspaces = ['packages/*']
      write('package.json', JSON.stringify(manifest))
      write('packages/no-manifest/README.md', '# Missing manifest\n')
      write('test-agents/static-agent/README.md', '# Static agent\n')
    })
    const report = checkRepository(root)
    assert.equal(report.inventory.testAgents.some(agent => agent.path === 'test-agents/static-agent'), true)
    assert.equal(report.findings.some(finding => finding.ruleId === 'workspace/pattern-missing'), true)
    assert.equal(report.findings.some(finding => finding.ruleId === 'workspace/unlisted' && finding.subject === 'test-agents/example'), true)
    assert.equal(report.findings.some(finding => finding.ruleId === 'workspace/manifest-missing' && finding.subject === 'packages/no-manifest'), true)
    assert.equal(report.findings.some(finding => finding.ruleId === 'docs/test-agent-catalog-missing' && finding.subject === 'test-agents/static-agent'), true)
  })

  it('validates metadata and complete package exports', () => {
    const root = fixture(({ write, readJson }) => {
      const manifest = readJson('packages/agents-example/package.json')
      manifest.repository = {}
      manifest.author = {}
      manifest.files = []
      delete manifest.exports['.'].types
      delete manifest.exports['./package.json']
      write('packages/agents-example/package.json', JSON.stringify(manifest, null, 2))
    })
    const rules = checkRepository(root).findings.map(finding => finding.ruleId)
    assert.equal(rules.filter(rule => rule === 'package/metadata-invalid').length, 3)
    assert.equal(rules.includes('package/shared-metadata-mismatch'), false)
    assert.equal(rules.filter(rule => rule === 'package/export-incomplete').length, 2)
    assert.equal(rules.includes('package/export-target-invalid'), false)
  })

  it('resolves export conditions without substituting import for require', () => {
    const importOnly = fixture(({ write, readJson }) => {
      const manifest = readJson('packages/agents-example/package.json')
      manifest.exports['.'] = { import: './dist/index.js', types: './dist/index.d.ts' }
      write('packages/agents-example/package.json', JSON.stringify(manifest))
    })
    assert.equal(checkRepository(importOnly).findings.some(finding => finding.ruleId === 'package/export-incomplete' && finding.message.includes('require')), true)

    const defaultOnly = fixture(({ write, readJson }) => {
      const manifest = readJson('packages/agents-example/package.json')
      manifest.exports['.'] = { import: './dist/index.js', default: './dist/index.js', types: './dist/index.d.ts' }
      write('packages/agents-example/package.json', JSON.stringify(manifest))
    })
    assert.equal(checkRepository(defaultOnly).findings.some(finding => finding.ruleId === 'package/export-incomplete' && finding.message.includes('require')), true)

    const nested = fixture(({ write, readJson }) => {
      const manifest = readJson('packages/agents-example/package.json')
      manifest.exports['.'] = { node: { import: './dist/index.js', require: './dist/index.js' }, types: './dist/index.d.ts' }
      write('packages/agents-example/package.json', JSON.stringify(manifest))
    })
    assert.equal(checkRepository(nested).findings.some(finding => finding.ruleId === 'package/export-incomplete'), false)

    const encodedTraversal = fixture(({ write, readJson }) => {
      const manifest = readJson('packages/agents-example/package.json')
      manifest.exports['.'].import = './dist/%2e%2e/private.js'
      write('packages/agents-example/package.json', JSON.stringify(manifest))
    })
    assert.equal(checkRepository(encodedTraversal).findings.some(finding => finding.ruleId === 'package/export-target-invalid'), true)
  })

  it('validates internal dependency targets and build order', () => {
    const root = fixture(({ write, readJson }) => {
      const example = readJson('packages/agents-example/package.json')
      const core = { ...example, name: '@microsoft/agents-core' }
      example.dependencies = { '@microsoft/agents-core': 'file:../agents-missing' }
      write('packages/agents-example/package.json', JSON.stringify(example))
      write('packages/agents-core/package.json', JSON.stringify(core))
      write('packages/agents-core/README.md', '# @microsoft/agents-core\n')
      write('packages/agents-core/tsconfig.json', '{}')
      write('compat/baseline/agents-core.api.md', '## API Report File for "@microsoft/agents-core"\n')
      write('README.md', '# Repo\n\n## Packages Overview\n\n| Package Name | Description |\n|---|---|\n| `@microsoft/agents-example` | Example |\n| `@microsoft/agents-core` | Core |\n')
      write('tsconfig.build.json', JSON.stringify({ references: [{ path: 'packages/agents-example' }, { path: 'packages/agents-core' }, { path: 'test-agents/example' }] }))
    })
    const rules = checkRepository(root).findings.map(finding => finding.ruleId)
    assert.equal(rules.includes('workspace/internal-dependency-invalid'), true)
    assert.equal(rules.includes('build/dependency-order'), true)
  })

  it('validates test-agent environment, Docker lifecycle, and relative links', () => {
    const root = fixture(({ write, readJson }) => {
      const manifest = readJson('test-agents/example/package.json')
      manifest.scripts.bundle = 'npm run build && esbuild dist/index.js --bundle --outfile=dist/bundle.js'
      write('test-agents/example/package.json', JSON.stringify(manifest, null, 2))
      write('test-agents/example/src/index.ts', "console.log(process.env['REQUIRED_KEY']!)\n")
      write('test-agents/example/Dockerfile', 'FROM node:24-alpine\nCOPY dist/wrong.js .\nCMD ["node", "wrong.js"]\n')
      write('test-agents/example/README.md', '# Example\n\n[missing](./missing.md)\n')
    })
    const rules = checkRepository(root).findings.map(finding => finding.ruleId)
    assert.equal(rules.includes('test-agent/env-key-missing'), true)
    assert.equal(rules.includes('test-agent/docker-script-missing'), true)
    assert.equal(rules.includes('test-agent/docker-artifact-mismatch'), true)
    assert.equal(rules.includes('docs/relative-link-missing'), true)
  })

  it('accepts JSON-form Docker COPY when the artifact chain matches', () => {
    const root = fixture(({ write, readJson }) => {
      const manifest = readJson('test-agents/example/package.json')
      manifest.scripts.bundle = 'npm run build && esbuild dist/index.js --bundle --outfile=dist/bundle.js'
      manifest.scripts.docker = 'npm run bundle && docker build .'
      write('test-agents/example/package.json', JSON.stringify(manifest))
      write('test-agents/example/Dockerfile', 'FROM node:24-alpine\nCOPY ["dist/bundle.js", "app.js"]\nCMD ["node", "app.js"]\n')
    })
    assert.equal(checkRepository(root).findings.some(finding => finding.ruleId.startsWith('test-agent/docker-')), false)
  })

  it('rejects implicit and install-time npm lifecycle scripts', () => {
    const root = fixture(({ write, readJson }) => {
      const rootManifest = readJson('package.json')
      rootManifest.scripts.build = 'echo build'
      rootManifest.scripts.postbuild = 'echo postbuild'
      rootManifest.scripts.prestart = 'echo prestart'
      rootManifest.scripts.preprepare = 'echo preprepare'
      rootManifest.scripts.postversion = 'echo postversion'
      write('package.json', JSON.stringify(rootManifest))
      const packageManifest = readJson('packages/agents-example/package.json')
      packageManifest.scripts = { bundle: 'echo bundle', prebundle: 'echo prebundle' }
      write('packages/agents-example/package.json', JSON.stringify(packageManifest))
    })
    const findings = checkRepository(root).findings
    assert.equal(findings.some(finding => finding.ruleId === 'scripts/implicit-hook-disallowed' && finding.subject === 'postbuild'), true)
    assert.equal(findings.some(finding => finding.ruleId === 'scripts/implicit-hook-disallowed' && finding.subject === 'prestart'), true)
    assert.equal(findings.some(finding => finding.ruleId === 'scripts/implicit-hook-disallowed' && finding.subject === 'prebundle'), true)
    assert.equal(findings.some(finding => finding.ruleId === 'scripts/implicit-hook-disallowed' && finding.subject === 'postversion'), true)
    assert.equal(findings.some(finding => finding.ruleId === 'scripts/install-hook-disallowed' && finding.subject === 'preprepare'), true)
  })

  it('checks lifecycle hooks in authored manifests outside workspaces', () => {
    const root = fixture(({ write }) => write('samples/package.json', JSON.stringify({ scripts: { prepare: 'echo prepare' } })))
    const finding = checkRepository(root).findings.find(item => item.path === 'samples/package.json' && item.ruleId === 'scripts/install-hook-disallowed')
    assert.equal(finding.subject, 'prepare')
  })

  it('does not accept a commented doctor command in another CI job', () => {
    const root = fixture(({ write }) => {
      write('.github/workflows/ci.yml', 'jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm ci\n      - run: npm run build\n        node-version: 24\n  docs:\n    runs-on: ubuntu-latest\n    steps:\n      # run: npm run repo:doctor\n      - run: npm run docs\n')
    })
    assert.equal(checkRepository(root).findings.some(finding => finding.ruleId === 'repository/doctor-ci-missing' && finding.path === '.github/workflows/ci.yml'), true)
  })

  it('does not accept a doctor command from a separate CI job', () => {
    const root = fixture(({ write }) => write('.github/workflows/ci.yml', 'jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm ci\n      - run: npm run build\n  docs:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm run repo:doctor\n'))
    assert.equal(checkRepository(root).findings.some(finding => finding.ruleId === 'repository/doctor-ci-missing' && finding.path === '.github/workflows/ci.yml'), true)
  })

  it('accepts multiline and chained CI commands', () => {
    const root = fixture(({ write }) => {
      write('.github/workflows/ci.yml', 'jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: |\n          npm ci; npm run repo:doctor\n          npm run build\n')
      write('.azdo/ci-pr.yaml', '- job: build\n  steps:\n  - script: |\n      npm ci\n      npm run repo:doctor\n      npm run build\n')
    })
    assert.equal(checkRepository(root).findings.some(finding => finding.ruleId === 'repository/doctor-ci-missing'), false)
  })

  it('accepts quoted CI commands', () => {
    const root = fixture(({ write }) => {
      write('.github/workflows/ci.yml', 'jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: "npm ci && npm run repo:doctor && npm run build"\n')
    })
    assert.equal(checkRepository(root).findings.some(finding => finding.ruleId === 'repository/doctor-ci-missing'), false)
  })

  it('validates compatibility baselines and supported Node types', () => {
    const root = fixture(({ write, readJson, remove }) => {
      remove('compat/baseline/agents-example.api.md')
      const manifest = readJson('package.json')
      manifest.devDependencies['@types/node'] = '25.0.0'
      write('package.json', JSON.stringify(manifest, null, 2))
    })
    const rules = checkRepository(root).findings.map(finding => finding.ruleId)
    assert.equal(rules.includes('compat/baseline-missing'), true)
    assert.equal(rules.includes('runtime/node-types-unsupported'), true)
  })

  it('reports malformed required configuration as an expected failure', () => {
    const malformedReferences = fixture(({ write }) => write('tsconfig.build.json', JSON.stringify({ references: {} })))
    assert.throws(() => checkRepository(malformedReferences), /references must be an array/)
    const missingNvmrc = fixture(({ remove }) => remove('.nvmrc'))
    assert.throws(() => checkRepository(missingNvmrc), /Unable to read required repository file/)
  })

  it('reports valid JSON with an invalid configuration shape', () => {
    for (const [file, value] of [
      ['package.json', 'null'],
      ['package.json', 'false'],
      ['tsconfig.build.json', '[]'],
      ['packages/agents-example/package.json', '"not a manifest"'],
    ]) {
      const root = fixture(({ write }) => write(file, value))
      assert.throws(() => checkRepository(root), new RegExp(`${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} must contain a JSON object`))
    }
  })

  it('reports duplicate build references at their configured location', () => {
    const root = fixture(({ write }) => write('tsconfig.build.json', JSON.stringify({ references: [{ path: 'packages/agents-example' }, { path: 'packages/agents-example' }, { path: 'test-agents/example' }] }, null, 2)))
    const finding = checkRepository(root).findings.find(item => item.ruleId === 'build/duplicate-reference')
    assert.equal(finding.subject, 'packages/agents-example')
    assert.equal(finding.line, 7)
    assert.match(finding.fix, /Remove the duplicate/)
  })

  it('does not confuse a build reference with an earlier path string', () => {
    const root = fixture(({ write }) => write('tsconfig.build.json', JSON.stringify({ compilerOptions: { paths: { example: ['packages/agents-example'] } }, references: [{ path: 'packages/agents-example' }, { path: 'packages/agents-example' }, { path: 'test-agents/example' }] }, null, 2)))
    const finding = checkRepository(root).findings.find(item => item.ruleId === 'build/duplicate-reference')
    assert.equal(finding.line, 14)
  })

  it('locates escaped and nested build-reference paths precisely', () => {
    const root = fixture(({ write }) => write('tsconfig.build.json', '{\n  "references": [\n    { "metadata": { "path": "packages/agents-example" }, "path": "packages\\/agents-example" },\n    { "path": "packages\\/agents-example" },\n    { "path": "test-agents/example" }\n  ]\n}\n'))
    const finding = checkRepository(root).findings.find(item => item.ruleId === 'build/duplicate-reference')
    assert.equal(finding.line, 4)
    assert.equal(finding.column, 15)
  })

  it('locates references when an earlier nested key or root key is escaped', () => {
    const root = fixture(({ write }) => write('tsconfig.build.json', '{\n  "compilerOptions": { "references": [] },\n  "\\u0072eferences": [\n    { "path": "packages/agents-example" },\n    { "path": "packages/agents-example" },\n    { "path": "test-agents/example" }\n  ]\n}\n'))
    const finding = checkRepository(root).findings.find(item => item.ruleId === 'build/duplicate-reference')
    assert.equal(finding.line, 5)
    assert.equal(finding.column, 15)
  })

  it('reports orphan build references at their configured location', () => {
    const root = fixture(({ write }) => write('tsconfig.build.json', JSON.stringify({ references: [{ path: 'packages/agents-example' }, { path: 'packages/agents-missing' }, { path: 'test-agents/example' }] }, null, 2)))
    const finding = checkRepository(root).findings.find(item => item.ruleId === 'build/orphan-reference')
    assert.equal(finding.subject, 'packages/agents-missing')
    assert.equal(finding.line, 7)
    assert.match(finding.fix, /Remove/)
  })

  it('fixes preserve useful configuration details', () => {
    const root = fixture(({ write }) => write('test-agents/example/Dockerfile', 'FROM node:alpine\n'))
    const finding = checkRepository(root).findings.find(item => item.ruleId === 'runtime/unpinned-image')
    assert.equal(finding.message, 'Docker image node:alpine does not pin a Node major version.')
    assert.equal(finding.fix, 'Replace node:alpine with node:24-alpine.')
  })

  it('parses supported CLI arguments', () => {
    assert.deepEqual(parseArguments(['--root', 'fixture']), { help: false, rules: false, ruleIds: [], root: 'fixture' })
    assert.deepEqual(parseArguments(['--rules']), { help: false, rules: true, ruleIds: [], root: process.cwd() })
    assert.deepEqual(parseArguments(['--rules', 'package/private', 'docs/relative-link-missing']), { help: false, rules: true, ruleIds: ['package/private', 'docs/relative-link-missing'], root: process.cwd() })
    assert.throws(() => parseArguments(['--rules', 'missing/rule']), /Unknown rule ID/)
    assert.throws(() => parseArguments(['--format', 'json']), /Unknown argument/)
    assert.throws(() => parseArguments(['--wat']), /Unknown argument/)
  })

  it('CLI lists the rule guide without checking the repository', () => {
    const cli = path.resolve('scripts/repo-doctor.mjs')
    const result = spawnSync(process.execPath, [cli, '--rules'], { encoding: 'utf8' })
    assert.equal(result.status, 0)
    assert.match(result.stdout, /Repo Doctor rules/)
    assert.match(result.stdout, /scripts\/install-hook-disallowed/)
    assert.match(result.stdout, /why {2}npm --ignore-scripts skips implicit hooks/)
    assert.doesNotMatch(result.stdout, /\| Rule \|/)
  })

  it('CLI filters the rule guide by rule IDs', () => {
    const cli = path.resolve('scripts/repo-doctor.mjs')
    const result = spawnSync(process.execPath, [cli, '--rules', 'scripts/install-hook-disallowed', 'docs/relative-link-missing'], { encoding: 'utf8' })
    assert.equal(result.status, 0)
    assert.match(result.stdout, /scripts\/install-hook-disallowed/)
    assert.match(result.stdout, /docs\/relative-link-missing/)
    assert.doesNotMatch(result.stdout, /scripts\/implicit-hook-disallowed/)
  })

  it('CLI emits the stable formatted report and exits nonzero for findings', () => {
    const root = fixture(({ write }) => write('tsconfig.build.json', JSON.stringify({ references: [] })))
    const cli = path.resolve('scripts/repo-doctor.mjs')
    const result = spawnSync(process.execPath, [cli, '--root', root], { encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.match(result.stdout, /^tsconfig\.build\.json/m)
    assert.match(result.stdout, /\s+1:2\s+error\s+/)
    assert.match(result.stdout, /build\/missing-reference/)
    assert.match(result.stdout, /fix\s+Add \{ "path": "packages\/agents-example" \} to references\./)
    assert.doesNotMatch(result.stdout, /schemaVersion|Repository Doctor/)
  })

  it('uses automatic ANSI styles only when requested by the formatter', () => {
    const report = checkRepository(fixture())
    assert.equal(formatReport(report, { color: false }).includes('\u001B['), false)
    assert.equal(formatReport(report, { color: true }).includes('\u001B[32m'), true)
    const failingReport = checkRepository(fixture(({ write }) => write('tsconfig.build.json', JSON.stringify({ references: [] }))))
    const coloredFailure = formatReport(failingReport, { color: true })
    assert.equal(coloredFailure.includes('\u001B[36mpackages/agents-example\u001B[0m'), true)
  })

  it('automatic color respects TTY, NO_COLOR, and dumb terminals', () => {
    const originalNoColor = process.env.NO_COLOR
    const originalTerm = process.env.TERM
    try {
      delete process.env.NO_COLOR
      process.env.TERM = 'xterm-256color'
      assert.equal(supportsColor({ isTTY: true }), true)
      assert.equal(supportsColor({ isTTY: false }), false)
      process.env.NO_COLOR = ''
      assert.equal(supportsColor({ isTTY: true }), false)
      delete process.env.NO_COLOR
      process.env.TERM = 'dumb'
      assert.equal(supportsColor({ isTTY: true }), false)
    } finally {
      if (originalNoColor === undefined) delete process.env.NO_COLOR
      else process.env.NO_COLOR = originalNoColor
      if (originalTerm === undefined) delete process.env.TERM
      else process.env.TERM = originalTerm
    }
  })

  it('unexpected failures include their message and stack', () => {
    const output = formatFailure(new Error('unexpected boom'), { color: false })
    assert.match(output, /Error: unexpected boom/)
    assert.match(output, /repo-doctor\/internal/)
    assert.match(output, /repo-doctor\.test\.mjs/)
  })

  it('CLI formats configuration failures and preserves the parser error', () => {
    const root = fixture(({ write }) => write('package.json', '{ invalid json'))
    const cli = path.resolve('scripts/repo-doctor.mjs')
    const result = spawnSync(process.execPath, [cli, '--root', root], { encoding: 'utf8' })
    assert.equal(result.status, 2)
    assert.match(result.stderr, /^package\.json/m)
    assert.match(result.stderr, /repo-doctor\/configuration/)
    assert.match(result.stderr, /Unable to parse repository configuration/)
    assert.match(result.stderr, /fix\s+Open package\.json, correct the invalid value or syntax identified above/)
    assert.match(result.stderr, /✖ Repo Doctor could not complete/)
  })
})
