import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { ClientCitation, ClientCitationIconName } from '../../src'

describe('ClientCitationIconName', () => {
  it('exposes named members that map to the documented icon strings', () => {
    // Values match the `citation.appearance.image.name` list documented at
    // https://learn.microsoft.com/microsoftteams/platform/bots/how-to/bot-messages-ai-generated-content#add-citations
    const expected: Record<string, string> = {
      MicrosoftWord: 'Microsoft Word',
      MicrosoftExcel: 'Microsoft Excel',
      MicrosoftPowerPoint: 'Microsoft PowerPoint',
      MicrosoftOneNote: 'Microsoft OneNote',
      MicrosoftSharePoint: 'Microsoft SharePoint',
      MicrosoftVisio: 'Microsoft Visio',
      MicrosoftLoop: 'Microsoft Loop',
      MicrosoftWhiteboard: 'Microsoft Whiteboard',
      AdobeIllustrator: 'Adobe Illustrator',
      AdobePhotoshop: 'Adobe Photoshop',
      AdobeInDesign: 'Adobe InDesign',
      AdobeFlash: 'Adobe Flash',
      Sketch: 'Sketch',
      SourceCode: 'Source Code',
      Image: 'Image',
      GIF: 'GIF',
      Video: 'Video',
      Sound: 'Sound',
      ZIP: 'ZIP',
      Text: 'Text',
      PDF: 'PDF'
    }

    for (const [key, value] of Object.entries(expected)) {
      assert.strictEqual((ClientCitationIconName as Record<string, string>)[key], value)
    }
    assert.strictEqual(Object.keys(ClientCitationIconName).length, Object.keys(expected).length)
  })

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
