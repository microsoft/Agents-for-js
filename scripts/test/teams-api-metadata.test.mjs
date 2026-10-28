import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'

import { checkTeamsApiMetadata } from '../teams-api-drift/validate-teams-api-metadata.mjs'

const packagePath = 'packages/agents-hosting-extensions-msteams'
const roots = []

function fixture ({ git = false } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'teams-api-metadata-'))
  roots.push(root)
  const write = (file, value) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), value)
  }
  const read = file => readFileSync(path.join(root, file), 'utf8')
  const readJson = file => JSON.parse(read(file))
  const writeJson = (file, value) => write(file, `${JSON.stringify(value, undefined, 2)}\n`)
  const runGit = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }

  writeJson(`${packagePath}/package.json`, {
    name: '@microsoft/agents-hosting-extensions-msteams',
    type: 'module',
    dependencies: { '@microsoft/teams.api': '2.0.14' }
  })
  writeJson(`${packagePath}/tsconfig.json`, {
    compilerOptions: { module: 'node16', moduleResolution: 'node16', strict: true, skipLibCheck: true },
    include: ['src/**/*.ts']
  })
  writeJson('node_modules/@microsoft/teams.api/package.json', { name: '@microsoft/teams.api', version: '2.0.14', type: 'module', types: 'index.d.ts' })
  write('node_modules/@microsoft/teams.api/index.d.ts', 'export interface ChannelData { eventType?: string }\nexport declare class Client { send(): void }\n')
  write(`${packagePath}/src/index.ts`, "export * from './teamsActivity.js'\n")
  write(`${packagePath}/src/teamsActivity.ts`, "import type { ChannelData as TeamsChannelData } from '@microsoft/teams.api'\nexport function eventType(data: TeamsChannelData): string | undefined { return data.eventType }\n")
  writeJson(`${packagePath}/teams-api-usage-manifest.json`, {
    dependency: '@microsoft/teams.api',
    declaredVersion: '2.0.14',
    sourceRoot: 'src',
    usages: [{
      upstreamSymbol: 'ChannelData',
      usage: 'parsed-model',
      exposure: 'publicly-exposed',
      propertiesRead: ['eventType'],
      files: ['src/teamsActivity.ts']
    }]
  })
  write(`${packagePath}/config/teams-capabilities.yaml`, `schemaVersion: 1
dependency:
  package: "@microsoft/teams.api"
capabilities:
  activity-data:
    owners:
      - "src/**"
    upstreamAreas:
      - "models.channel-data"
    adoptionPolicy: "strict-compatibility"
`)

  if (git) {
    runGit('init', '-b', 'main')
    runGit('config', 'user.email', 'repo-doctor@example.test')
    runGit('config', 'user.name', 'Repo Doctor')
    runGit('add', '.')
    runGit('commit', '-m', 'baseline')
  }

  return { root, write, read, readJson, writeJson, runGit }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function rules (root, options) {
  return checkTeamsApiMetadata(root, options).map(finding => finding.ruleId)
}

describe('Teams API metadata validation', () => {
  it('accepts aligned imports, members, public exposure, and capability ownership', () => {
    assert.deepEqual(checkTeamsApiMetadata(fixture().root), [])
  })

  it('detects missing aliased imports, stale files, and dependency versions', () => {
    const repo = fixture()
    const manifest = repo.readJson(`${packagePath}/teams-api-usage-manifest.json`)
    manifest.declaredVersion = '2.0.13'
    manifest.usages[0].upstreamSymbol = 'OtherSymbol'
    manifest.usages[0].files.push('src/missing.ts')
    repo.writeJson(`${packagePath}/teams-api-usage-manifest.json`, manifest)

    const findings = checkTeamsApiMetadata(repo.root)
    assert.equal(findings.some(finding => finding.message.includes('declaredVersion')), true)
    assert.equal(findings.some(finding => finding.message.includes('Direct @microsoft/teams.api import ChannelData')), true)
    assert.equal(findings.some(finding => finding.message.includes('src/missing.ts')), true)
  })

  it('detects statically resolved members and public exposure missing from the manifest', () => {
    const repo = fixture()
    const manifest = repo.readJson(`${packagePath}/teams-api-usage-manifest.json`)
    delete manifest.usages[0].propertiesRead
    delete manifest.usages[0].exposure
    repo.writeJson(`${packagePath}/teams-api-usage-manifest.json`, manifest)

    const findings = checkTeamsApiMetadata(repo.root)
    assert.equal(findings.some(finding => finding.message.includes('ChannelData.eventType is statically read')), true)
    assert.equal(findings.some(finding => finding.message.includes('not marked publicly exposed')), true)
  })

  it('detects statically resolved Teams API method calls', () => {
    const repo = fixture()
    repo.write(`${packagePath}/src/teamsActivity.ts`, "import type { ChannelData as TeamsChannelData } from '@microsoft/teams.api'\nimport { Client as TeamsClient } from '@microsoft/teams.api'\nexport function eventType(data: TeamsChannelData): string | undefined { return data.eventType }\nexport function send(client: TeamsClient): void { client.send() }\n")
    const manifest = repo.readJson(`${packagePath}/teams-api-usage-manifest.json`)
    manifest.usages.push({ upstreamSymbol: 'Client', usage: 'type-reference', exposure: 'publicly-exposed', files: ['src/teamsActivity.ts'] })
    repo.writeJson(`${packagePath}/teams-api-usage-manifest.json`, manifest)
    repo.write(`${packagePath}/config/teams-capabilities.yaml`, repo.read(`${packagePath}/config/teams-capabilities.yaml`).replace('      - "models.channel-data"', '      - "models.channel-data"\n      - "clients"'))

    assert.equal(checkTeamsApiMetadata(repo.root).some(finding => finding.message.includes('Client.send is statically called')), true)
  })

  it('detects invalid capability owners and confidently mismatched upstream areas', () => {
    const repo = fixture()
    repo.write(`${packagePath}/config/teams-capabilities.yaml`, `schemaVersion: 1
dependency:
  package: "@microsoft/teams.api"
capabilities:
  activity-data:
    owners:
      - "src/missing/**"
    upstreamAreas:
      - "models.meeting"
    adoptionPolicy: "strict-compatibility"
`)
    const findings = checkTeamsApiMetadata(repo.root)
    assert.equal(findings.some(finding => finding.message.includes('matches no source files')), true)
    assert.equal(findings.some(finding => finding.message.includes('has no capability owner')), true)
  })

  it('requires a usage-specific review and does not accept a capabilities-only change', () => {
    const repo = fixture({ git: true })
    repo.write(`${packagePath}/src/teamsActivity.ts`, `${repo.read(`${packagePath}/src/teamsActivity.ts`)}// implementation-only refactor\n`)
    repo.write(`${packagePath}/config/teams-capabilities.yaml`, `${repo.read(`${packagePath}/config/teams-capabilities.yaml`)}\n`)

    assert.equal(rules(repo.root, { baseRef: 'main' }).includes('compat/teams-api-usage-review-missing'), true)
  })

  it('does not let unrelated manifest edits hide a removed direct import', () => {
    const repo = fixture({ git: true })
    repo.write(`${packagePath}/src/teamsActivity.ts`, 'export function eventType(data) { return data.eventType }\n')
    const manifest = repo.readJson(`${packagePath}/teams-api-usage-manifest.json`)
    manifest.usages[0].usageKinds = ['parsed-model']
    repo.writeJson(`${packagePath}/teams-api-usage-manifest.json`, manifest)

    let findings = checkTeamsApiMetadata(repo.root, { baseRef: 'main' })
    assert.equal(findings.some(finding => finding.message.includes('Removed direct Teams API import(s) remain recorded')), true)
    assert.equal(findings.some(finding => finding.message.includes('marked publicly-exposed but no longer appears')), true)

    manifest.usages[0].exposure = 'internal-only'
    manifest.sourceReview = { outcome: 'no-usage-metadata-change', reason: 'The payload remains consumed dynamically.' }
    repo.writeJson(`${packagePath}/teams-api-usage-manifest.json`, manifest)
    findings = checkTeamsApiMetadata(repo.root, { baseRef: 'main' })
    assert.equal(findings.some(finding => finding.ruleId === 'compat/teams-api-usage-review-missing'), false)
  })

  it('accepts a changed, valid usage non-impact review and rejects empty or stale reviews', () => {
    const repo = fixture({ git: true })
    repo.write(`${packagePath}/src/teamsActivity.ts`, `${repo.read(`${packagePath}/src/teamsActivity.ts`)}// implementation-only refactor\n`)
    const manifest = repo.readJson(`${packagePath}/teams-api-usage-manifest.json`)
    manifest.sourceReview = { outcome: 'no-usage-metadata-change', reason: 'Only a comment changed.' }
    repo.writeJson(`${packagePath}/teams-api-usage-manifest.json`, manifest)
    assert.equal(rules(repo.root, { baseRef: 'main' }).includes('compat/teams-api-usage-review-missing'), false)

    manifest.sourceReview.reason = ''
    repo.writeJson(`${packagePath}/teams-api-usage-manifest.json`, manifest)
    assert.equal(rules(repo.root, { baseRef: 'main' }).includes('compat/teams-api-usage-manifest-stale'), true)

    manifest.sourceReview.reason = 'Only a comment changed.'
    repo.writeJson(`${packagePath}/teams-api-usage-manifest.json`, manifest)
    repo.runGit('add', '.')
    repo.runGit('commit', '-m', 'reviewed source change')
    repo.write(`${packagePath}/src/teamsActivity.ts`, `${repo.read(`${packagePath}/src/teamsActivity.ts`)}// another refactor\n`)
    assert.equal(rules(repo.root, { baseRef: 'main' }).includes('compat/teams-api-usage-review-missing'), true)
  })

  it('requires capability review for structural source changes and accepts its own acknowledgment', () => {
    const repo = fixture({ git: true })
    repo.write(`${packagePath}/src/newFeature.ts`, 'export const enabled = true\n')
    assert.equal(rules(repo.root, { baseRef: 'main' }).includes('compat/teams-api-capabilities-review-missing'), true)

    repo.write(`${packagePath}/config/teams-capabilities.yaml`, `${repo.read(`${packagePath}/config/teams-capabilities.yaml`)}\n`)
    assert.equal(rules(repo.root, { baseRef: 'main' }).includes('compat/teams-api-capabilities-review-missing'), true)

    repo.write(`${packagePath}/config/teams-capabilities.yaml`, repo.read(`${packagePath}/config/teams-capabilities.yaml`).replace('  activity-data:\n', '  activity-data:\n    description: "Unrelated metadata edit"\n'))
    assert.equal(rules(repo.root, { baseRef: 'main' }).includes('compat/teams-api-capabilities-review-missing'), true)

    repo.write(`${packagePath}/config/teams-capabilities.yaml`, repo.read(`${packagePath}/config/teams-capabilities.yaml`).replace('      - "src/**"', '      - "src/**"\n      - "src/newFeature.ts"'))
    assert.equal(rules(repo.root, { baseRef: 'main' }).includes('compat/teams-api-capabilities-review-missing'), false)

    repo.write(`${packagePath}/config/teams-capabilities.yaml`, repo.read(`${packagePath}/config/teams-capabilities.yaml`).replace('      - "src/newFeature.ts"\n', ''))
    repo.write(`${packagePath}/config/teams-capabilities.yaml`, `${repo.read(`${packagePath}/config/teams-capabilities.yaml`)}sourceReview:
  outcome: "no-capability-metadata-change"
  reason: "The new helper remains part of activity-data."
`)
    assert.equal(rules(repo.root, { baseRef: 'main' }).includes('compat/teams-api-capabilities-review-missing'), false)
    assert.equal(rules(repo.root, { baseRef: 'main' }).includes('compat/teams-api-usage-review-missing'), false)
  })

  it('accepts reviews committed after the source change across a multi-commit branch', () => {
    const repo = fixture({ git: true })
    repo.runGit('checkout', '-b', 'feature')
    repo.write(`${packagePath}/src/teamsActivity.ts`, `${repo.read(`${packagePath}/src/teamsActivity.ts`)}// refactor\n`)
    repo.runGit('add', '.')
    repo.runGit('commit', '-m', 'change source')
    const manifest = repo.readJson(`${packagePath}/teams-api-usage-manifest.json`)
    manifest.sourceReview = { outcome: 'no-usage-metadata-change', reason: 'No Teams API usage changed.' }
    repo.writeJson(`${packagePath}/teams-api-usage-manifest.json`, manifest)
    repo.runGit('add', '.')
    repo.runGit('commit', '-m', 'review metadata')

    assert.equal(rules(repo.root, { baseRef: 'main' }).includes('compat/teams-api-usage-review-missing'), false)
  })
})
