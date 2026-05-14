import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { ClientCitation, ClientCitationIconName } from '../../src'

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
