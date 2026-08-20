import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { FileStorage } from '../../../src'

describe('FileStorage', () => {
  let folder: string
  let storage: FileStorage

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-file-storage-'))
    storage = new FileStorage(folder)
  })

  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true })
  })

  it('should read items before ttl expires', async () => {
    await storage.write({ key1: { value: 'test' } }, { ttl: 60 })
    const result = await storage.read(['key1'])
    assert.deepStrictEqual(result, { key1: { value: 'test' } })
  })

  it('should omit items after ttl expires', async () => {
    await storage.write({ key1: { value: 'test' } }, { ttl: 0.01 })
    await new Promise(resolve => setTimeout(resolve, 20))
    const result = await storage.read(['key1'])
    assert.deepStrictEqual(result, {})
  })

  it('should keep expiry metadata outside the state payload', async () => {
    await storage.write({ key1: { value: 'test' } }, { ttl: 60 })
    const state = JSON.parse(fs.readFileSync(path.join(folder, 'state.json'), 'utf8'))
    const metadata = JSON.parse(fs.readFileSync(path.join(folder, 'state.metadata.json'), 'utf8'))

    assert.deepStrictEqual(state, { key1: { value: 'test' } })
    assert.strictEqual(typeof metadata.expirations.key1, 'number')
  })

  it('should clear ttl when rewriting without ttl', async () => {
    await storage.write({ key1: { value: 'test' } }, { ttl: 0.01 })
    await storage.write({ key1: { value: 'persistent' } })
    await new Promise(resolve => setTimeout(resolve, 20))
    const result = await storage.read(['key1'])
    assert.deepStrictEqual(result, { key1: { value: 'persistent' } })
  })

  it('should reject invalid ttl values', async () => {
    await assert.rejects(
      async () => await storage.write({ key1: { value: 'test' } }, { ttl: Number.POSITIVE_INFINITY }),
      (err: any) => {
        assert.strictEqual(err.name, 'RangeError')
        assert.strictEqual(err.code, -120703)
        assert.match(err.message, /StorageWriteOptions\.ttl must be a finite number greater than zero\./)
        return true
      }
    )
  })
})
