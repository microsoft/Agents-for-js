// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { validateAgentReport } from '../../../../scripts/teams-api-drift/validate-teams-api-agent-report'

type Finding = {
  id: string
  classification: 'blocking' | 'required' | 'review' | 'no-action'
}

function findings (...items: Finding[]) {
  return {
    schemaVersion: 1 as const,
    dependency: '@microsoft/teams.api',
    findings: items
  }
}

function report (overrides: Partial<Record<string, string>> = {}): string {
  const sections: Array<[string, string]> = [
    ['Summary', 'This is an advisory report; it does not make or authorize implementation decisions.'],
    ['Compatibility breaks', '- No compatibility breaks were identified.'],
    ['Required adaptations', '- No required adaptations were identified.'],
    ['Feature-review candidates', '- No feature-review candidates were identified.'],
    ['Internal implementation opportunities', '- No internal implementation opportunities were identified.'],
    ['Maintainer decisions', '- No maintainer decisions are required.'],
    ['No action', '- No action is required.'],
    ['Suggested implementation issues', '- No implementation issues are suggested.'],
    ['Validation checklist', '- [x] Deterministic findings were reviewed.']
  ]
  return [
    '# teams.api Impact Report',
    ...sections.flatMap(([heading, content]) => [`## ${heading}`, overrides[heading] ?? content])
  ].join('\n')
}

describe('teams.api agent report validation', () => {
  it('should require the title to be the first line', () => {
    const validation = validateAgentReport(`Preface\n${report()}`, findings())

    assert.ok(validation.errors.includes('Report must start with "# teams.api Impact Report".'))
  })

  it('should detect missing required sections', () => {
    const validation = validateAgentReport(report().replace('## Required adaptations\n- No required adaptations were identified.\n', ''), findings())

    assert.ok(validation.errors.includes('Missing required section: Required adaptations.'))
  })

  it('should require recommendations to be labeled advisory', () => {
    const validation = validateAgentReport(report({ Summary: 'This report contains recommendations.' }), findings())

    assert.ok(validation.errors.includes('Summary section must start with: "This is an advisory report; it does not make or authorize implementation decisions.".'))
  })

  it('should require blocking and required finding IDs', () => {
    const validation = validateAgentReport(report(), findings(
      { id: 'TSAPI-0001', classification: 'blocking' },
      { id: 'TSAPI-0002', classification: 'required' }
    ))

    assert.deepEqual(validation.missingMandatoryFindingIds, ['TSAPI-0001', 'TSAPI-0002'])
  })

  it('should reject unknown finding IDs', () => {
    const validation = validateAgentReport(report({ Summary: 'This is an advisory report; it does not make or authorize implementation decisions. TSAPI-9999 requires review.' }), findings())

    assert.deepEqual(validation.unknownFindingIds, ['TSAPI-9999'])
    assert.ok(validation.errors.includes('Unknown finding ID(s): TSAPI-9999.'))
  })

  it('should reject action bullets that are not tied to a finding ID', () => {
    const validation = validateAgentReport(report({ 'Required adaptations': '- Update the conversion logic.' }), findings())

    assert.ok(validation.errors.includes('Action item is not tied to a finding ID: - Update the conversion logic.'))
  })
})
