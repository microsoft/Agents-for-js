import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { TextHighlight } from '..'
import { textHighlightZodSchema } from '../textHighlight'

describe('TextHighlight', () => {
  it('should create a TextHighlight with valid properties', () => {
    const textHighlight: TextHighlight = { text: 'text', occurrence: 1 }
    assert.equal(textHighlight.text, 'text')
    assert.equal(textHighlight.occurrence, 1)
  })

  it('should throw an error if text is missing', () => {
    // @ts-expect-error
    const textHighlight: TextHighlight = { }
    assert.strictEqual(textHighlight.text, undefined)
  })

  it('should throw an error if occurrence is missing', () => {
    // @ts-expect-error
    const textHighlight: TextHighlight = { }
    assert.strictEqual(textHighlight.occurrence, undefined)
  })
})

describe('TextHighlight json deserialization', () => {
  it('Deserialize with known id, name, and role', () => {
    const json = '{ "text": "text", "occurrence": 1 }'
    const textHighlight: TextHighlight = textHighlightZodSchema.parse(JSON.parse(json))
    assert.equal(textHighlight.text, 'text')
    assert.equal(textHighlight.occurrence, 1)
  })
})
