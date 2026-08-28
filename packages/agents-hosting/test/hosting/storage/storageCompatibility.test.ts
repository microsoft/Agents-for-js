import assert from 'node:assert'
import { describe, it } from 'node:test'
import { Storage, StorageOperationStatus, StorageWriteMode, StoreItem } from '../../../src'
import {
  asStorage,
  asStorageV2,
  assertStorageDeleteSucceeded,
  assertStorageWriteSucceeded,
  getStorageReadValue,
  isStorageV2,
} from '../../../src/storage/storageCompatibility'

class LegacyStorage implements Storage {
  private readonly values: StoreItem = {}

  async read (keys: string[]): Promise<StoreItem> {
    return Object.fromEntries(keys.filter(key => Object.hasOwn(this.values, key)).map(key => [key, this.values[key]]))
  }

  async write (changes: StoreItem): Promise<void> {
    Object.assign(this.values, changes)
  }

  async delete (keys: string[]): Promise<void> {
    keys.forEach(key => delete this.values[key])
  }
}

describe('Storage compatibility', () => {
  it('wraps a legacy storage implementation', async () => {
    const legacy = new LegacyStorage()
    const storage = asStorageV2(legacy)
    await legacy.write({ existing: { value: 1, eTag: 'legacy-version' } })

    const read = await storage.read<{ value: number }>(['existing', 'missing'])
    const write = await storage.write({ created: { value: 2 } })
    const remove = await storage.delete(['existing', 'missing'])

    assert.strictEqual(isStorageV2(legacy), false)
    assert.strictEqual(isStorageV2(storage), true)
    assert.strictEqual(read.existing.status, StorageOperationStatus.Succeeded)
    assert.strictEqual(read.existing.version, 'legacy-version')
    assert.strictEqual(read.missing.status, StorageOperationStatus.NotFound)
    assert.strictEqual(write.created.status, StorageOperationStatus.Succeeded)
    assert.strictEqual(remove.existing.status, StorageOperationStatus.Succeeded)
    assert.strictEqual(remove.missing.status, StorageOperationStatus.Succeeded)
  })

  it('rejects V2 conditions unsupported by legacy storage', async () => {
    const storage = asStorageV2(new LegacyStorage())

    await assert.rejects(
      storage.write({ key: {} }, { mode: StorageWriteMode.CreateOnly }),
      /does not support the V2 storage option "mode"/
    )
    await assert.rejects(
      storage.delete(['key'], { expectedVersion: 'version' }),
      /does not support the V2 storage option "expectedVersion"/
    )
  })

  it('retains the legacy interface when adapting V2 storage', async () => {
    const storageV2 = asStorageV2(new LegacyStorage())
    const storage = asStorage(storageV2)
    await storage.write({ key: { value: 1 } })

    const stored = await storage.read(['key'])

    assert.strictEqual(stored.key.value, 1)
  })

  it('does not add a read dependency to legacy deletes', async () => {
    let deleted = false
    const legacy: Storage = {
      read: async () => { assert.fail('read should not be called') },
      write: async () => {},
      delete: async () => { deleted = true },
    }

    const result = await asStorageV2(legacy).delete(['key'])

    assert.strictEqual(deleted, true)
    assert.strictEqual(result.key.status, StorageOperationStatus.Succeeded)
  })

  it('preserves values accepted by a legacy provider', async () => {
    const legacy = new LegacyStorage()
    const storage = asStorageV2(legacy)

    await storage.write({ primitive: 1, array: [1], nullable: null } as any)

    assert.deepStrictEqual(await legacy.read(['primitive', 'array', 'nullable']), {
      primitive: 1,
      array: [1],
      nullable: null,
    })
  })

  it('rejects failed or missing V2 operation results', () => {
    assert.deepStrictEqual(getStorageReadValue({
      key: { key: 'key', status: StorageOperationStatus.Succeeded, value: { value: 1 } },
    }, 'key'), { value: 1 })
    assert.strictEqual(getStorageReadValue({
      key: { key: 'key', status: StorageOperationStatus.NotFound },
    }, 'key'), undefined)
    assert.throws(
      () => getStorageReadValue({}, 'key'),
      /read failed for key "key" with status "missing"/
    )
    assert.throws(
      () => getStorageReadValue(undefined, 'key'),
      /read failed for key "key" with status "missing"/
    )
    assert.throws(
      () => assertStorageWriteSucceeded({
        key: { key: 'key', status: StorageOperationStatus.Conflict },
      }, ['key']),
      /write failed for key "key" with status "conflict"/
    )
    assert.throws(
      () => assertStorageWriteSucceeded({}, ['key']),
      /write failed for key "key" with status "missing"/
    )
    assert.throws(
      () => assertStorageWriteSucceeded(undefined, ['key']),
      /write failed for key "key" with status "missing"/
    )
    assert.doesNotThrow(() => assertStorageDeleteSucceeded({
      key: { key: 'key', status: StorageOperationStatus.NotFound },
    }, ['key']))
    assert.throws(
      () => assertStorageDeleteSucceeded({
        key: { key: 'key', status: StorageOperationStatus.ConditionNotMet },
      }, ['key']),
      /delete failed for key "key" with status "conditionNotMet"/
    )
  })
})
