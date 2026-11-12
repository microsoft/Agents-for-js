// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { createFindings } from '../../../../scripts/teams-api-drift/detect-teams-api-drifts'
import { renderDeterministicReport } from '../../../../scripts/teams-api-drift/render-teams-api-drift-report'

function fixture () {
  const change = {
    id: 'TSAPI-0001',
    kind: 'property-type-changed',
    symbol: 'MeetingEvent',
    member: 'value',
    before: '{ JoinUrl: string; }',
    after: '{ JoinUrl?: string | null; }',
    compatibility: 'potentially-breaking' as const,
    evidence: ['normalized-api-model']
  }
  const review = {
    fromVersion: '2.1.0',
    toVersion: '2.2.0',
    upstreamSymbol: change.symbol,
    member: change.member,
    kind: change.kind,
    before: change.before,
    after: change.after,
    reason: 'The handler passes the payload through; omitted and null URLs are covered by tests.'
  }
  const comparison = {
    schemaVersion: 1,
    dependency: '@microsoft/teams.api',
    fromVersion: '2.1.0',
    toVersion: '2.2.0',
    changes: [change]
  }
  const manifest: Parameters<typeof createFindings>[1] = {
    dependency: comparison.dependency,
    usages: [{
      upstreamSymbol: change.symbol,
      usage: 'event-model',
      exposure: 'publicly-exposed',
      propertiesRead: ['value'],
      files: ['src/meetings/meeting.ts']
    }],
    compatibilityReviews: [review]
  }
  const capabilities: Parameters<typeof createFindings>[2] = {
    schemaVersion: 1,
    dependency: { package: comparison.dependency },
    capabilities: {}
  }

  return { change, review, comparison, manifest, capabilities }
}

function classify (value: ReturnType<typeof fixture>) {
  return createFindings(value.comparison, value.manifest, value.capabilities)
}

function assertBlocking (value: ReturnType<typeof fixture>) {
  const result = classify(value)

  assert.equal(result.summary.blocking, 1)
  assert.equal(result.findings[0].classification, 'blocking')
  assert.equal(result.findings[0].category, undefined)
  assert.equal(result.findings[0].evidence.includes('compatibility-review'), false)
}

function runDetector (value: ReturnType<typeof fixture>) {
  const root = mkdtempSync(join(tmpdir(), 'teams-api-reviews-'))

  try {
    const comparison = join(root, 'comparison.json')
    const manifest = join(root, 'manifest.json')
    const capabilities = join(root, 'capabilities.json')
    const output = join(root, 'findings.json')
    writeFileSync(comparison, JSON.stringify(value.comparison))
    writeFileSync(manifest, JSON.stringify(value.manifest))
    writeFileSync(capabilities, JSON.stringify(value.capabilities))

    const result = spawnSync(process.execPath, [
      '--import', 'tsx', resolve('scripts/teams-api-drift/detect-teams-api-drifts.ts'),
      '--comparison', comparison,
      '--manifest', manifest,
      '--capabilities', capabilities,
      '--output', output,
      '--fail-on-drift'
    ], { encoding: 'utf8', timeout: 30000 })

    assert.equal(result.error, undefined)
    const findings = result.status === 0 || result.stdout.includes('Wrote findings')
      ? JSON.parse(readFileSync(output, 'utf8'))
      : undefined

    return { ...result, findings }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('teams.api compatibility reviews', () => {
  it('should retain an exactly reviewed public change and its justification in the report', () => {
    const value = fixture()
    const result = classify(value)
    const finding = result.findings[0]

    assert.equal(result.summary.blocking, 0)
    assert.equal(result.summary['no-action'], 1)
    assert.equal(finding.classification, 'no-action')
    assert.equal(finding.category, 'reviewed-compatible')
    assert.ok(finding.evidence.includes('compatibility-review'))
    assert.equal(finding.before, value.change.before)
    assert.equal(finding.after, value.change.after)
    assert.equal(finding.exposure, 'publicly-exposed')
    assert.deepEqual(finding.affectedFiles, ['src/meetings/meeting.ts'])

    const report = renderDeterministicReport(result, {
      findingsPath: 'findings.json', outputPath: 'report.md', artifactPaths: [], checks: {}
    })
    assert.match(report, /## Reviewed compatibility changes/)
    assert.ok(report.includes(value.review.reason))
    assert.match(report, /Evidence: normalized-api-model, dependency-usage, compatibility-review/)
    assert.equal(report.split('**TSAPI-0001**').length - 1, 1)
    assert.match(report, /## No-action upstream changes\n\nNo no-action upstream changes were recorded\./)
  })

  it('should accept an exactly reviewed required adaptation', () => {
    const value = fixture()
    value.manifest.usages[0].exposure = 'internal-only'
    delete value.manifest.compatibilityReviews
    assert.equal(classify(value).summary.required, 1)

    value.manifest.compatibilityReviews = [value.review]
    assert.equal(classify(value).summary.required, 0)
    assert.equal(classify(value).findings[0].category, 'reviewed-compatible')
  })

  it('should keep changes blocking when the manifest has no compatibility reviews', () => {
    const value = fixture()
    delete value.manifest.compatibilityReviews
    assertBlocking(value)
  })

  it('should not apply a review to a different baseline version', () => {
    const value = fixture()
    value.review.fromVersion = '2.0.0'
    assertBlocking(value)
  })

  it('should not apply a historical review to a different candidate version', () => {
    const value = fixture()
    value.comparison.toVersion = '2.3.0'
    assertBlocking(value)
  })

  it('should not apply a review to a different upstream symbol', () => {
    const value = fixture()
    value.review.upstreamSymbol = 'OtherEvent'
    assertBlocking(value)
  })

  it('should not apply a review to a different member', () => {
    const value = fixture()
    value.review.member = 'other'
    assertBlocking(value)
  })

  it('should not apply a review to a different change kind', () => {
    const value = fixture()
    value.review.kind = 'property-removed'
    assertBlocking(value)
  })

  it('should not apply a review to a different before signature', () => {
    const value = fixture()
    value.review.before = '{ JoinUrl: number; }'
    assertBlocking(value)
  })

  it('should not apply a review to a different after signature', () => {
    const value = fixture()
    value.review.after = '{ JoinUrl?: number; }'
    assertBlocking(value)
  })

  it('should match the change independently of generated finding IDs', () => {
    const value = fixture()
    value.change.id = 'TSAPI-0044'

    assert.equal(classify(value).findings[0].category, 'reviewed-compatible')
  })

  it('should accept explicit null for an absent member and signatures', () => {
    const value = fixture()
    value.change.kind = 'symbol-removed'
    Reflect.deleteProperty(value.change, 'member')
    Reflect.deleteProperty(value.change, 'before')
    Reflect.deleteProperty(value.change, 'after')
    value.manifest.compatibilityReviews = [{
      ...value.review, kind: 'symbol-removed', member: null, before: null, after: null
    }]

    assert.equal(classify(value).findings[0].category, 'reviewed-compatible')
  })

  it('should keep unrelated breaking changes blocking', () => {
    const value = fixture()
    value.comparison.changes.push({ ...value.change, id: 'TSAPI-0002', member: 'unreviewed' })
    value.manifest.usages[0].propertiesRead!.push('unreviewed')
    const result = classify(value)

    assert.equal(result.summary.blocking, 1)
    assert.equal(result.summary['no-action'], 1)
    assert.equal(result.findings[1].classification, 'blocking')
  })

  it('should not suppress advisory review findings', () => {
    const value = fixture()
    value.change.kind = 'deprecation-added'
    value.review.kind = 'deprecation-added'

    assert.equal(classify(value).findings[0].classification, 'review')
    assert.equal(classify(value).findings[0].category, undefined)
  })

  it('should not treat a null review member as a wildcard', () => {
    const value = fixture()
    value.manifest.compatibilityReviews = [{ ...value.review, member: null }]
    assertBlocking(value)
  })

  it('should not treat a null review signature as a wildcard', () => {
    const value = fixture()
    value.manifest.compatibilityReviews = [{ ...value.review, after: null }]
    assertBlocking(value)
  })

  it('should preserve separate public API review findings', () => {
    const value = fixture()
    const result = createFindings(value.comparison, value.manifest, value.capabilities, {
      schemaVersion: 1,
      package: '@microsoft/agents-hosting-extensions-msteams',
      baseline: 'baseline.api.md',
      entrypoint: 'src/index.ts',
      status: 'changed',
      releaseDecision: 'major',
      upstreamTypeLeaks: [],
      publicSymbolChanges: [{
        kind: 'public-symbol-changed', symbol: 'MeetingStartHandler', releaseDecision: 'major'
      }]
    })

    assert.equal(result.summary['no-action'], 1)
    assert.equal(result.summary.review, 1)
    assert.equal(result.findings[1].source, 'public-api')
    assert.equal(result.findings[1].classification, 'review')
  })

  it('should reject a null compatibilityReviews collection', () => {
    const value = fixture()
    Reflect.set(value.manifest, 'compatibilityReviews', null)

    assert.throws(() => classify(value), /compatibilityReviews must be an array/)
  })

  it('should reject an object instead of a compatibilityReviews array', () => {
    const value = fixture()
    Reflect.set(value.manifest, 'compatibilityReviews', {})

    assert.throws(() => classify(value), /compatibilityReviews must be an array/)
  })

  it('should reject a null review entry', () => {
    const value = fixture()
    Reflect.set(value.manifest, 'compatibilityReviews', [null])

    assert.throws(() => classify(value), /Every compatibility review must specify/)
  })

  it('should reject a review without a reason', () => {
    const value = fixture()
    value.review.reason = ' '

    assert.throws(() => classify(value), /non-empty reason/)
  })

  it('should reject a review without an exact after signature', () => {
    const value = fixture()
    Reflect.deleteProperty(value.review, 'after')

    assert.throws(() => classify(value), /Use null for absent change fields/)
  })

  it('should reject non-string version fields', () => {
    const value = fixture()
    Reflect.set(value.review, 'fromVersion', 2)

    assert.throws(() => classify(value), /Every compatibility review must specify/)
  })

  it('should pass the CLI drift gate for an exactly reviewed change', () => {
    const result = runDetector(fixture())

    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.findings.summary.blocking, 0)
    assert.equal(result.findings.findings[0].category, 'reviewed-compatible')
  })

  it('should fail the CLI drift gate and preserve findings for an unmatched change', () => {
    const value = fixture()
    value.review.after = 'different'
    const result = runDetector(value)

    assert.equal(result.status, 1, result.stderr)
    assert.equal(result.findings.summary.blocking, 1)
  })

  it('should fail classification explicitly for a malformed review', () => {
    const value = fixture()
    value.review.reason = ''
    const result = runDetector(value)

    assert.equal(result.status, 1)
    assert.match(result.stderr, /Every compatibility review must specify/)
    assert.equal(result.findings, undefined)
  })
})
