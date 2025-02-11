import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { Attachment } from '../'
import { attachmentZodSchema } from './attachment'

describe('Attachment', () => {
  it('should create a Attachment with valid properties', () => {
    const content = { test: 'test' }
    const attachment: Attachment = {
      contentType: 'contentType',
      contentUrl: 'contentUrl',
      content,
      name: 'name',
      thumbnailUrl: 'thumbnailUrl'
    }
    assert.equal(attachment.contentType, 'contentType')
    assert.equal(attachment.contentUrl, 'contentUrl')
    assert.strictEqual(attachment.content, content)
    assert.strictEqual(attachment.name, 'name')
    assert.strictEqual(attachment.thumbnailUrl, 'thumbnailUrl')
  })

  it('should throw an error if contentType is missing', () => {
    // @ts-expect-error
    const attachment: Attachment = { }
    assert.strictEqual(attachment.contentType, undefined)
  })
})

describe('Attachment json deserialization', () => {
  it('Deserialize with known contentType, contentUrl, content, name and thumbnailUrl', () => {
    const json = '{ "contentType" : "contentType", "contentUrl" : "contentUrl", "content" : { "test": "test" }, "name": "name", "thumbnailUrl": "thumbnailUrl" }'
    const attachment: Attachment = attachmentZodSchema.parse(JSON.parse(json))
    const content = { test: 'test' }
    assert.equal(attachment.contentType, 'contentType')
    assert.equal(attachment.contentUrl, 'contentUrl')
    assert.deepEqual(attachment.content, content)
    assert.strictEqual(attachment.name, 'name')
    assert.strictEqual(attachment.thumbnailUrl, 'thumbnailUrl')
  })
})
