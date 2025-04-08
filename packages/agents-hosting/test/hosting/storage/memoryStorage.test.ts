import assert from 'assert'
import { MemoryStorage } from '../../../src'
import { describe, it, beforeEach } from 'node:test'

describe('MemoryStorage', () => {
  let memoryStorage: MemoryStorage

  beforeEach(() => {
    memoryStorage = new MemoryStorage()
  })

  describe('read', () => {
    it('should throw an error if keys are empty', async () => {
      await assert.rejects(
        async () => await memoryStorage.read([]),
        {
          name: 'ReferenceError',
          message: 'Keys are required when reading.'
        }
      )
    })

    it('should throw an error if keys are null', async () => {
      await assert.rejects(
        // @ts-expect-error
        async () => await memoryStorage.read(null),
        {
          name: 'ReferenceError',
          message: 'Keys are required when reading.'
        }
      )
    })

    it('should return an empty object if no keys match', async () => {
      const result = await memoryStorage.read(['nonexistent'])
      assert.deepStrictEqual(result, {})
    })

    it('should return stored items for matching keys', async () => {
      await memoryStorage.write({ key1: { value: 'test', eTag: '*' } })
      const result = await memoryStorage.read(['key1'])
      assert.deepStrictEqual(result, { key1: { value: 'test', eTag: '1' } })
    })
  })

  describe('write', () => {
    it('should throw an error if changes are not empty array', async () => {
      await assert.rejects(
        async () => await memoryStorage.write([]),
        {
          name: 'ReferenceError',
          message: 'Changes are required when writing.'
        }
      )
    })

    it('should throw an error if changes are null', async () => {
      await assert.rejects(
        // @ts-expect-error
        async () => await memoryStorage.write(null),
        {
          name: 'ReferenceError',
          message: 'Changes are required when writing.'
        }
      )
    })

    it('should add new items to storage', async () => {
      await memoryStorage.write({ key1: { value: 'test', eTag: '*' } })
      const result = await memoryStorage.read(['key1'])
      assert.deepStrictEqual(result, { key1: { value: 'test', eTag: '1' } })
    })

    it('should update items with matching eTags', async () => {
      await memoryStorage.write({ key1: { value: 'test', eTag: '*' } })
      const initialRead = await memoryStorage.read(['key1'])
      await memoryStorage.write({ key1: { value: 'updated', eTag: initialRead.key1.eTag } })
      const updatedRead = await memoryStorage.read(['key1'])
      assert.deepStrictEqual(updatedRead, { key1: { value: 'updated', eTag: '2' } })
    })

    it('should throw an error on eTag conflict', async () => {
      await memoryStorage.write({ key1: { value: 'test', eTag: '*' } })
      await assert.rejects(
        async () =>
          await memoryStorage.write({ key1: { value: 'conflict', eTag: 'invalid' } }),
        {
          name: 'Error',
          message: 'Storage: error writing "key1" due to eTag conflict.'
        }
      )
    })
  })

  describe('delete', () => {
    it('should delete items by keys', async () => {
      await memoryStorage.write({ key1: { value: 'test', eTag: '*' } })
      await memoryStorage.delete(['key1'])
      const result = await memoryStorage.read(['key1'])
      assert.deepStrictEqual(result, {})
    })

    it('should handle deleting non-existent keys gracefully', async () => {
      await assert.doesNotReject(async () => await memoryStorage.delete(['nonexistent']))
    })
  })

  describe('saveItem (private method)', () => {
    it('should correctly increment eTag on each save', async () => {
      await memoryStorage.write({ key1: { value: 'test', eTag: '*' } })
      const result1 = await memoryStorage.read(['key1'])
      assert.strictEqual(result1.key1.eTag, '1')

      await memoryStorage.write({ key2: { value: 'another', eTag: '*' } })
      const result2 = await memoryStorage.read(['key2'])
      assert.strictEqual(result2.key2.eTag, '2')
    })
  })
})
