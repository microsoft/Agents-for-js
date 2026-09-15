import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { FileStorage, Storage, StorageOperationStatus, StorageV2, StorageWriteMode } from '../../../src'

const folders: string[] = []

afterEach(() => {
  for (const folder of folders.splice(0)) fs.rmSync(folder, { recursive: true, force: true })
})

function createFolder (): string {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-file-storage-'))
  folders.push(folder)
  return folder
}

describe('FileStorage', () => {
  it('keeps V1 as the default contract and file format', async () => {
    const storage = new FileStorage(createFolder())
    const contract: Storage = storage

    await contract.write({ key: { value: 1 } })

    assert.strictEqual(storage.storageVersion, 1)
    assert.deepStrictEqual(await contract.read(['key']), { key: { value: 1 } })

    await contract.write({ falsey: 0 })
    assert.deepStrictEqual(await contract.read(['falsey']), {})
  })

  it('supports V2 results, modes, and version conditions', async () => {
    const storage = new FileStorage(createFolder(), { storageVersion: 2 })
    const contract: StorageV2 = storage

    const created = await contract.write({ key: { value: 1 } }, { mode: StorageWriteMode.CreateOnly })
    const conflict = await contract.write({ key: { value: 2 } }, { mode: StorageWriteMode.CreateOnly })
    const stale = await contract.write({ key: { value: 2 } }, { expectedVersion: 'stale' })
    const replaced = await contract.write({ key: { value: 2 } }, { expectedVersion: created.key.version })
    const read = await contract.read<{ value: number }>(['key', 'missing'])
    const removed = await contract.delete(['key'], { expectedVersion: replaced.key.version })

    assert.strictEqual(created.key.status, StorageOperationStatus.Succeeded)
    assert.strictEqual(conflict.key.status, StorageOperationStatus.Conflict)
    assert.strictEqual(stale.key.status, StorageOperationStatus.ConditionNotMet)
    assert.strictEqual(replaced.key.status, StorageOperationStatus.Succeeded)
    assert.strictEqual(read.key.value?.value, 2)
    assert.strictEqual(read.key.version, replaced.key.version)
    assert.strictEqual(read.missing.status, StorageOperationStatus.NotFound)
    assert.strictEqual(removed.key.status, StorageOperationStatus.Succeeded)
  })

  it('persists V2 values and versions across instances', async () => {
    const folder = createFolder()
    const first = new FileStorage(folder, { storageVersion: 2 })
    const written = await first.write({ key: { value: 1 } })
    const second = new FileStorage(folder, { storageVersion: 2 })

    const read = await second.read<{ value: number }>(['key'])

    assert.strictEqual(read.key.value?.value, 1)
    assert.strictEqual(read.key.version, written.key.version)
  })

  it('isolates V2 cached state from caller mutations', async () => {
    const folder = createFolder()
    const storage = new FileStorage(folder, { storageVersion: 2 })
    const input = { nested: { value: 1 } }
    await storage.write({ key: input })
    input.nested.value = 2

    const first = await storage.read<typeof input>(['key'])
    first.key.value!.nested.value = 3
    const second = await storage.read<typeof input>(['key'])
    const reloaded = await new FileStorage(folder, { storageVersion: 2 }).read<typeof input>(['key'])

    assert.strictEqual(second.key.value?.nested.value, 1)
    assert.strictEqual(reloaded.key.value?.nested.value, 1)
  })

  it('keeps value eTag data separate from the persisted storage version', async () => {
    const folder = createFolder()
    const storage = new FileStorage(folder, { storageVersion: 2 })
    const written = await storage.write({ key: { eTag: 'business-value', value: 1 } })

    const read = await new FileStorage(folder, { storageVersion: 2 })
      .read<{ eTag: string, value: number }>(['key'])

    assert.strictEqual(read.key.value?.eTag, 'business-value')
    assert.strictEqual(read.key.version, written.key.version)
    assert.notStrictEqual(read.key.version, read.key.value?.eTag)
  })

  it('accepts empty V2 batches and validates V2 input', async () => {
    const storage = new FileStorage(createFolder(), { storageVersion: 2 })

    assert.deepStrictEqual(await storage.read([]), {})
    assert.deepStrictEqual(await storage.write({}), {})
    assert.deepStrictEqual(await storage.delete([]), {})
    await assert.rejects(storage.write({ ' ': {} }), /keys must be non-empty strings/)
    await assert.rejects(
      // @ts-expect-error Verify runtime validation for JavaScript callers.
      storage.write({ key: {} }, { mode: 'invalid' }),
      /write mode "invalid" is not supported/
    )
    await assert.rejects(
      // @ts-expect-error Verify runtime validation for JavaScript callers.
      storage.write({ key: null }),
      /values must be non-null, non-array objects/
    )
  })
})
