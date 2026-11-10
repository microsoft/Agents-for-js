import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { Activity, addAIToActivity, AIEntity, ClientCitation, ClientCitationIconName, SensitivityUsageInfo, TextFormatTypes } from '../../src'
import { textFormatTypesZodSchema } from '../../src/textFormatTypes'

describe('Teams stable activity metadata', () => {
  it('preserves nested sensitivity identifiers for messages and citations through activity serialization', () => {
    const label: SensitivityUsageInfo = {
      type: 'https://schema.org/Message',
      '@type': 'CreativeWork',
      '@id': 'label-identifier',
      name: 'Confidential',
      position: 1
    }
    const citation: ClientCitation = {
      '@type': 'Claim',
      position: 1,
      appearance: { '@type': 'DigitalDocument', name: 'Source', abstract: 'Summary', usageInfo: label }
    }
    const activity = new Activity('message')
    addAIToActivity(activity, [citation], label)

    const restored = Activity.fromObject(JSON.parse(JSON.stringify(activity)))
    const entity = restored.entities![0] as AIEntity
    assert.equal(entity['@id'], '')
    assert.deepEqual(entity.usageInfo, label)
    assert.deepEqual(entity.citation![0].appearance.usageInfo, label)

    const legacyLabel: SensitivityUsageInfo = {
      type: 'https://schema.org/Message', '@type': 'CreativeWork', name: 'Legacy'
    }
    assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(legacyLabel)), '@id'), false)
  })

  it('accepts extended markdown without changing the normal markdown format', () => {
    assert.equal(textFormatTypesZodSchema.parse(TextFormatTypes.ExtendedMarkdown), 'extendedmarkdown')
    const activity = Activity.fromObject({
      type: 'message', textFormat: TextFormatTypes.ExtendedMarkdown, text: '## Result'
    })
    assert.equal(JSON.parse(JSON.stringify(activity)).textFormat, 'extendedmarkdown')
    assert.equal(TextFormatTypes.Markdown, 'markdown')
  })
})

describe('ClientCitationIconName', () => {
  it('can be assigned to ClientCitation.appearance.image.name as either a named member or a string literal', () => {
    const fromMember: ClientCitation = {
      '@type': 'Claim',
      position: 1,
      appearance: {
        '@type': 'DigitalDocument',
        name: 'doc',
        abstract: 'abs',
        image: { '@type': 'ImageObject', name: ClientCitationIconName.MicrosoftWord }
      }
    }
    const fromLiteral: ClientCitation = {
      '@type': 'Claim',
      position: 2,
      appearance: {
        '@type': 'DigitalDocument',
        name: 'doc',
        abstract: 'abs',
        image: { '@type': 'ImageObject', name: 'PDF' }
      }
    }
    assert.strictEqual(fromMember.appearance.image?.name, 'Microsoft Word')
    assert.strictEqual(fromLiteral.appearance.image?.name, 'PDF')
  })
})
