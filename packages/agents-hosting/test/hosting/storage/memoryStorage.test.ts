import assert from 'node:assert'
import { beforeEach, describe, it } from 'node:test'
import { MemoryStorage, Storage, StorageOperationStatus, StorageV2, StorageWriteMode } from '../../../src'

describe('MemoryStorage V2', () => {
  let storage: MemoryStorage<2>

  beforeEach(() => {
    storage = new MemoryStorage(undefined, { storageVersion: 2 })
  })

  it('declares the V2 contract and returns one read result per key', async () => {
    assert.strictEqual(storage.storageVersion, 2)
    await storage.write({ existing: { value: 'test' } })

    const results = await storage.read<{ value: string }>(['existing', 'missing'])

    assert.strictEqual(results.existing.status, StorageOperationStatus.Succeeded)
    assert.strictEqual(results.existing.value?.value, 'test')
    assert.strictEqual('eTag' in results.existing.value!, false)
    assert.strictEqual(results.missing.status, StorageOperationStatus.NotFound)
  })

  it('creates only when the key does not exist', async () => {
    const first = await storage.write({ key: { value: 1 } }, { mode: StorageWriteMode.CreateOnly })
    const second = await storage.write({ key: { value: 2 } }, { mode: StorageWriteMode.CreateOnly })

    assert.strictEqual(first.key.status, StorageOperationStatus.Succeeded)
    assert.strictEqual(second.key.status, StorageOperationStatus.Conflict)
    assert.strictEqual(second.key.version, first.key.version)
  })

  it('keeps value eTag data separate from the storage version', async () => {
    const written = await storage.write({ key: { eTag: 'business-value', value: 1 } })

    const read = await storage.read<{ eTag: string, value: number }>(['key'])

    assert.strictEqual(read.key.value?.eTag, 'business-value')
    assert.strictEqual(read.key.version, written.key.version)
    assert.notStrictEqual(read.key.version, read.key.value?.eTag)
  })

  it('uses expected versions for replace and delete', async () => {
    const created = await storage.write({ key: { value: 1 } })
    const replaced = await storage.write(
      { key: { value: 2 } },
      { mode: StorageWriteMode.Replace, expectedVersion: created.key.version }
    )
    const stale = await storage.write(
      { key: { value: 3 } },
      { mode: StorageWriteMode.Replace, expectedVersion: created.key.version }
    )
    const deleted = await storage.delete(['key'], { expectedVersion: replaced.key.version })

    assert.strictEqual(replaced.key.status, StorageOperationStatus.Succeeded)
    assert.notStrictEqual(replaced.key.version, created.key.version)
    assert.strictEqual(stale.key.status, StorageOperationStatus.ConditionNotMet)
    assert.strictEqual(deleted.key.status, StorageOperationStatus.Succeeded)
  })

  it('returns not found when replace or delete targets a missing key', async () => {
    const write = await storage.write({ key: { value: 1 } }, { mode: StorageWriteMode.Replace })
    const remove = await storage.delete(['key'])

    assert.strictEqual(write.key.status, StorageOperationStatus.NotFound)
    assert.strictEqual(remove.key.status, StorageOperationStatus.NotFound)
  })

  it('accepts empty V2 batches', async () => {
    assert.deepStrictEqual(await storage.read([]), {})
    assert.deepStrictEqual(await storage.write({}), {})
    assert.deepStrictEqual(await storage.delete([]), {})
  })

  it('rejects empty expected versions', async () => {
    await assert.rejects(
      storage.write({ key: {} }, { expectedVersion: '' }),
      /expectedVersion cannot be empty/
    )
    await assert.rejects(
      storage.delete(['key'], { expectedVersion: '' }),
      /expectedVersion cannot be empty/
    )
  })

  it('rejects values that are not object records', async () => {
    await assert.rejects(
      // @ts-expect-error Verify runtime validation for JavaScript callers.
      storage.write({ key: 42 }),
      /values must be non-null, non-array objects/
    )
    await assert.rejects(
      // @ts-expect-error Verify runtime validation for JavaScript callers.
      storage.write({ key: [1, 2] }),
      /values must be non-null, non-array objects/
    )
    await assert.rejects(
      // @ts-expect-error Verify runtime validation for JavaScript callers.
      storage.write({ key: null }),
      /values must be non-null, non-array objects/
    )
  })

  it('rejects unsupported write modes', async () => {
    await assert.rejects(
      // @ts-expect-error Verify runtime validation for JavaScript callers.
      storage.write({ key: {} }, { mode: 'invalid' }),
      /write mode "invalid" is not supported/
    )
  })

  it('rejects unsupported singleton storage versions', () => {
    assert.throws(
      // @ts-expect-error Verify runtime validation for JavaScript callers.
      () => MemoryStorage.getSingleInstance({ storageVersion: 3 }),
      /Storage version "3" is not supported/
    )
  })
})

describe('MemoryStorage V1 compatibility', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
  })

  it('uses V1 by default and keeps the legacy read shape', async () => {
    const legacyContract: Storage = storage
    assert.strictEqual(legacyContract, storage)
    assert.strictEqual(storage.storageVersion, 1)
    await storage.write({ key: { value: 'test', eTag: '*' } })

    assert.deepStrictEqual(await storage.read(['key']), {
      key: { value: 'test', eTag: '1' },
    })
    assert.deepStrictEqual(await storage.read(['missing']), {})
  })

  it('is assignable to StorageV2 when V2 is selected', () => {
    const v2Contract: StorageV2 = new MemoryStorage(undefined, { storageVersion: 2 })
    assert.strictEqual(v2Contract.storageVersion, 2)
  })

  it('keeps legacy eTag conflicts as thrown errors', async () => {
    await storage.write({ key: { value: 'test', eTag: '*' } })

    await assert.rejects(
      storage.write({ key: { value: 'conflict', eTag: 'stale' } }),
      /eTag conflict/
    )
  })

  it('keeps the legacy empty-read validation', async () => {
    await assert.rejects(storage.read([]), /Keys are required when reading/)
    await assert.rejects(
      // @ts-expect-error Verify runtime validation for JavaScript callers.
      storage.read(null),
      /Keys are required when reading/
    )
  })

  it('keeps the legacy write validation', async () => {
    await assert.rejects(
      // @ts-expect-error Verify runtime validation for JavaScript callers.
      storage.write([]),
      /Changes are required when writing/
    )
    await assert.rejects(
      // @ts-expect-error Verify runtime validation for JavaScript callers.
      storage.write([{}]),
      /Changes are required when writing/
    )
    await assert.rejects(
      // @ts-expect-error Verify runtime validation for JavaScript callers.
      storage.write(null),
      /Changes are required when writing/
    )
  })

  it('updates matching eTags and increments versions', async () => {
    await storage.write({ first: { value: 1, eTag: '*' } })
    const first = await storage.read(['first'])
    await storage.write({ first: { value: 2, eTag: first.first.eTag } })
    await storage.write({ second: { value: 3, eTag: '*' } })

    assert.deepStrictEqual(await storage.read(['first']), {
      first: { value: 2, eTag: '2' },
    })
    assert.strictEqual((await storage.read(['second'])).second.eTag, '3')
  })

  it('keeps V1 eTags recoverable from a supplied memory backing', async () => {
    const backing: Record<string, string> = {}
    const first = new MemoryStorage(backing)
    await first.write({ key: { value: 1, eTag: '*' } })
    const firstRead = await first.read(['key'])
    const reconstructed = new MemoryStorage({ ...backing })

    const reconstructedRead = await reconstructed.read(['key'])
    await reconstructed.write({ key: { value: 2, eTag: reconstructedRead.key.eTag } })

    assert.strictEqual(reconstructedRead.key.eTag, firstRead.key.eTag)
    assert.strictEqual((await reconstructed.read(['key'])).key.eTag, '2')
  })

  it('keeps legacy delete behavior', async () => {
    await storage.write({ key: { value: 1, eTag: '*' } })
    await storage.delete(['key', 'missing'])
    assert.deepStrictEqual(await storage.read(['key', 'missing']), {})
  })

  it('shares singleton data across V1 and V2 views', async () => {
    const v1 = MemoryStorage.getSingleInstance()
    const v2 = MemoryStorage.getSingleInstance({ storageVersion: 2 })
    await v1.write({ shared: { value: 'test', eTag: '*' } })

    const result = await v2.read<{ value: string }>(['shared'])
    assert.strictEqual(result.shared.value?.value, 'test')
  })
})
