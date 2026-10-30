import assert from 'assert'
import { Container, CosmosClient } from '@azure/cosmos'
import { describe, it } from 'node:test'
import { CosmosDbPartitionedStorage as CosmosDbPartitionedStorageV1, CosmosDbPartitionedStorageV2 as CosmosDbPartitionedStorage } from '../src/cosmosDbPartitionedStorage'
import { Errors } from '../src/errorHelper'
import { Storage, StorageOperationStatus, StorageV2, StorageWriteMode } from '@microsoft/agents-hosting'
import { ExceptionHelper } from '@microsoft/agents-activity'

interface StorageInternals {
  client: CosmosClient;
  container: Container;
  compatibilityModePartitionKey: boolean;
  initialize: () => Promise<void>;
  getOrCreateContainer: () => Promise<{
    container: Container;
    compatibilityModePartitionKey: boolean;
  }>;
}

interface StorageError extends Error {
  code?: number;
  innerException?: StorageError;
}

function isStorageError (err: unknown): err is StorageError {
  return err instanceof Error
}

function createStatusError (code: number): Error {
  return Object.assign(ExceptionHelper.generateException(Error, Errors.DocumentUpsertError), { code })
}

function createStorage (endpoint: string): CosmosDbPartitionedStorageV1 {
  return new CosmosDbPartitionedStorageV1({
    cosmosClientOptions: { endpoint, key: 'test-key' },
    databaseId: 'shared-database',
    containerId: 'shared-container',
  })
}

function getInternals (storage: CosmosDbPartitionedStorageV1 | CosmosDbPartitionedStorage): StorageInternals {
  if (storage instanceof StorageV2) {
    return (storage as unknown as { internals: StorageInternals }).internals
  }
  return storage as unknown as StorageInternals
}

describe('CosmosDbPartitionedStorage initialization', () => {
  it('uses separately named V1 and V2 classes', () => {
    const v1 = createStorage('https://version-account.documents.azure.com/')
    const storage = new CosmosDbPartitionedStorage({
      cosmosClientOptions: { endpoint: 'https://version-v2-account.documents.azure.com/', key: 'test-key' },
      databaseId: 'shared-database',
      containerId: 'shared-container',
    })
    const legacyContract: Storage = v1
    const v2Contract: StorageV2 = storage
    assert.strictEqual(legacyContract, v1)
    assert.strictEqual(v2Contract, storage)
  })

  it('keeps empty V1 writes as no-ops and rejects arrays', async () => {
    const storage = createStorage('https://v1-write-validation-account.documents.azure.com/')
    const internals = getInternals(storage)
    let initializeCalls = 0
    internals.initialize = async () => {
      initializeCalls++
    }

    await storage.write({})
    assert.strictEqual(initializeCalls, 0)

    await assert.rejects(
      storage.write([{}]),
      /changes parameter is required/
    )
  })

  it('returns condition-not-met for create-only writes with an expected version on a missing item', async () => {
    const storage = new CosmosDbPartitionedStorage({
      cosmosClientOptions: { endpoint: 'https://create-only-condition-account.documents.azure.com/', key: 'test-key' },
      databaseId: 'shared-database',
      containerId: 'shared-container',
    })
    const internals = getInternals(storage)
    let createCalls = 0
    const container = {
      items: {
        create: async () => {
          createCalls++
          return { etag: 'new-version' }
        },
      },
      item: () => ({
        read: () => Promise.reject(createStatusError(404)),
      }),
    } as unknown as Container
    internals.client = {} as CosmosClient
    internals.getOrCreateContainer = async () => ({ container, compatibilityModePartitionKey: false })

    const results = await storage.write(
      { key: { value: 'test' } },
      { mode: StorageWriteMode.CreateOnly, expectedVersion: 'version' }
    )

    assert.strictEqual(results.key.status, StorageOperationStatus.ConditionNotMet)
    assert.strictEqual(createCalls, 0)
  })

  it('returns V2 read results under each requested key', async () => {
    const storage = new CosmosDbPartitionedStorage({
      cosmosClientOptions: { endpoint: 'https://read-result-key-account.documents.azure.com/', key: 'test-key' },
      databaseId: 'shared-database',
      containerId: 'shared-container',
    })
    const internals = getInternals(storage)
    const container = {
      item: () => ({
        read: async () => ({
          resource: { realId: 'stored-key', document: { value: 'test', eTag: 'business-value' }, _etag: 'version' },
        }),
      }),
    } as unknown as Container
    internals.client = {} as CosmosClient
    internals.getOrCreateContainer = async () => ({ container, compatibilityModePartitionKey: false })

    const results = await storage.read<{ value: string, eTag: string }>(['requested-key'])

    assert.strictEqual(results['requested-key'].key, 'requested-key')
    assert.strictEqual(results['requested-key'].value?.value, 'test')
    assert.strictEqual(results['requested-key'].value?.eTag, 'business-value')
    assert.strictEqual(results['requested-key'].version, 'version')
  })

  it('preserves value eTag data when writing a document', async () => {
    const storage = new CosmosDbPartitionedStorage({
      cosmosClientOptions: { endpoint: 'https://write-value-account.documents.azure.com/', key: 'test-key' },
      databaseId: 'shared-database',
      containerId: 'shared-container',
    })
    const internals = getInternals(storage)
    let document: { document?: unknown } | undefined
    const container = {
      items: {
        upsert: async (value: { document?: unknown }) => {
          document = value
          return { etag: 'storage-version' }
        },
      },
    } as unknown as Container
    internals.client = {} as CosmosClient
    internals.getOrCreateContainer = async () => ({ container, compatibilityModePartitionKey: false })

    await storage.write({ key: { eTag: 'business-value', value: 1 } })

    assert.deepStrictEqual(document?.document, { eTag: 'business-value', value: 1 })
  })

  it('does not create a missing item when upsert has an expected version', async () => {
    const storage = new CosmosDbPartitionedStorage({
      cosmosClientOptions: { endpoint: 'https://upsert-condition-account.documents.azure.com/', key: 'test-key' },
      databaseId: 'shared-database',
      containerId: 'shared-container',
    })
    const internals = getInternals(storage)
    let upsertCalls = 0
    let replaceCalls = 0
    const container = {
      items: {
        upsert: async () => {
          upsertCalls++
          return { etag: 'unexpected' }
        },
      },
      item: () => ({
        replace: () => {
          replaceCalls++
          return Promise.reject(createStatusError(404))
        },
      }),
    } as unknown as Container
    internals.client = {} as CosmosClient
    internals.getOrCreateContainer = async () => ({ container, compatibilityModePartitionKey: false })

    const results = await storage.write({ key: { value: 'test' } }, { expectedVersion: 'version' })

    assert.strictEqual(results.key.status, StorageOperationStatus.ConditionNotMet)
    assert.strictEqual(replaceCalls, 1)
    assert.strictEqual(upsertCalls, 0)
  })

  it('does not condition an unconditional V2 delete', async () => {
    const storage = new CosmosDbPartitionedStorage({
      cosmosClientOptions: { endpoint: 'https://unconditional-delete-account.documents.azure.com/', key: 'test-key' },
      databaseId: 'shared-database',
      containerId: 'shared-container',
    })
    const internals = getInternals(storage)
    let readCalls = 0
    let deleteOptions: unknown
    const container = {
      item: () => ({
        read: async () => {
          readCalls++
        },
        delete: async (options?: unknown) => {
          deleteOptions = options
        },
      }),
    } as unknown as Container
    internals.client = {} as CosmosClient
    internals.getOrCreateContainer = async () => ({ container, compatibilityModePartitionKey: false })

    const results = await storage.delete(['key'])

    assert.strictEqual(results.key.status, StorageOperationStatus.Succeeded)
    assert.strictEqual(readCalls, 0)
    assert.strictEqual(deleteOptions, undefined)
  })

  it('uses replace for matching and stale upsert version conditions', async () => {
    const storage = new CosmosDbPartitionedStorage({
      cosmosClientOptions: { endpoint: 'https://upsert-version-account.documents.azure.com/', key: 'test-key' },
      databaseId: 'shared-database',
      containerId: 'shared-container',
    })
    const internals = getInternals(storage)
    let upsertCalls = 0
    const replaceVersions: string[] = []
    const container = {
      items: {
        upsert: async () => {
          upsertCalls++
          return { etag: 'unexpected' }
        },
      },
      item: () => ({
        replace: async (_document: unknown, options: { accessCondition?: { condition?: string } }) => {
          const version = options.accessCondition?.condition ?? ''
          replaceVersions.push(version)
          if (version === 'stale') {
            return Promise.reject(createStatusError(412))
          }
          return { etag: 'next-version' }
        },
      }),
    } as unknown as Container
    internals.client = {} as CosmosClient
    internals.getOrCreateContainer = async () => ({ container, compatibilityModePartitionKey: false })

    const matched = await storage.write({ key: { value: 1 } }, { expectedVersion: 'current' })
    const stale = await storage.write({ key: { value: 2 } }, { expectedVersion: 'stale' })

    assert.strictEqual(matched.key.status, StorageOperationStatus.Succeeded)
    assert.strictEqual(matched.key.version, 'next-version')
    assert.strictEqual(stale.key.status, StorageOperationStatus.ConditionNotMet)
    assert.deepStrictEqual(replaceVersions, ['current', 'stale'])
    assert.strictEqual(upsertCalls, 0)
  })

  it('rejects V2 values that are not object records', async () => {
    const storage = new CosmosDbPartitionedStorage({
      cosmosClientOptions: { endpoint: 'https://invalid-value-account.documents.azure.com/', key: 'test-key' },
      databaseId: 'shared-database',
      containerId: 'shared-container',
    })

    await assert.rejects(
      // @ts-expect-error Verify runtime validation for JavaScript callers.
      storage.write({ key: null }),
      /values must be non-null, non-array objects/
    )
  })

  it('rejects blank V2 write keys', async () => {
    const storage = new CosmosDbPartitionedStorage({
      cosmosClientOptions: { endpoint: 'https://invalid-key-account.documents.azure.com/', key: 'test-key' },
      databaseId: 'shared-database',
      containerId: 'shared-container',
    })

    await assert.rejects(storage.write({ ' ': {} }), /keys must be non-empty strings/)
  })

  it('rejects unsupported V2 write modes', async () => {
    const storage = new CosmosDbPartitionedStorage({
      cosmosClientOptions: { endpoint: 'https://invalid-mode-account.documents.azure.com/', key: 'test-key' },
      databaseId: 'shared-database',
      containerId: 'shared-container',
    })

    await assert.rejects(
      // @ts-expect-error Verify runtime validation for JavaScript callers.
      storage.write({ key: {} }, { mode: 'invalid' }),
      /write mode "invalid" is not supported/
    )
    await assert.rejects(
      // @ts-expect-error Verify validation before the empty-batch return.
      storage.write({}, { mode: 'invalid' }),
      /write mode "invalid" is not supported/
    )
    await assert.rejects(
      // @ts-expect-error Verify runtime validation for JavaScript callers.
      storage.read(''),
      /keys/i
    )
    await assert.rejects(
      // @ts-expect-error Verify runtime validation for JavaScript callers.
      storage.delete({ length: 0 }),
      /keys/i
    )
  })

  it('should not share cached containers across Cosmos accounts', async () => {
    const firstContainer = {} as Container
    const secondContainer = {} as Container
    const firstStorage = createStorage('https://first-account.documents.azure.com/') as unknown as StorageInternals
    const secondStorage = createStorage('https://second-account.documents.azure.com/') as unknown as StorageInternals

    firstStorage.client = {} as CosmosClient
    secondStorage.client = {} as CosmosClient
    firstStorage.getOrCreateContainer = async () => ({
      container: firstContainer,
      compatibilityModePartitionKey: false,
    })
    secondStorage.getOrCreateContainer = async () => ({
      container: secondContainer,
      compatibilityModePartitionKey: false,
    })

    await firstStorage.initialize()
    await secondStorage.initialize()

    assert.strictEqual(firstStorage.container, firstContainer)
    assert.strictEqual(secondStorage.container, secondContainer)
  })

  it('shares successful initialization and partition detection within one instance', async () => {
    const storage = createStorage('https://instance-initialization.documents.azure.com/')
    const internals = getInternals(storage)
    const container = {} as Container
    let attempts = 0
    let completeInitialization!: () => void
    const pending = new Promise<void>(resolve => {
      completeInitialization = resolve
    })

    internals.client = {} as CosmosClient
    internals.getOrCreateContainer = async () => {
      attempts++
      await pending
      return { container, compatibilityModePartitionKey: true }
    }

    const initializations = [storage.initialize(), storage.initialize()]
    completeInitialization()
    await Promise.all(initializations)
    await storage.initialize()

    assert.strictEqual(attempts, 1)
    assert.strictEqual(internals.container, container)
    assert.strictEqual(storage.getPartitionKey('key'), undefined)
  })

  async function assertInitializationRetry (synchronousFailure: boolean) {
    const storage = createStorage('https://retry-instance.documents.azure.com/')
    const internals = getInternals(storage)
    const container = {} as Container
    const failure = createStatusError(503)
    let attempts = 0

    internals.client = {} as CosmosClient
    internals.getOrCreateContainer = () => {
      attempts++
      if (attempts === 1) {
        if (synchronousFailure) {
          throw failure
        }
        return Promise.reject(failure)
      }
      return Promise.resolve({ container, compatibilityModePartitionKey: false })
    }

    const results = await Promise.allSettled([storage.initialize(), storage.initialize()])
    assert.deepStrictEqual(results.map(result => result.status), ['rejected', 'rejected'])
    for (const result of results) {
      if (result.status === 'rejected') {
        assert.strictEqual(result.reason, failure)
      }
    }
    assert.strictEqual(attempts, 1)

    await storage.initialize()
    assert.strictEqual(attempts, 2)
    assert.strictEqual(internals.container, container)
  }

  it('retries asynchronous initialization failures on the same instance', async () => {
    await assertInitializationRetry(false)
  })

  it('retries synchronous initialization failures on the same instance', async () => {
    await assertInitializationRetry(true)
  })

  it('should preserve the upsert error for circular documents', async () => {
    const storage = createStorage('https://circular-document-account.documents.azure.com/')
    const storageInternals = storage as unknown as StorageInternals
    const upsertError = new Error('Cosmos DB rejected the document')
    const container = {
      items: {
        upsert: async () => {
          throw upsertError
        },
      },
    } as unknown as Container
    const document: Record<string, unknown> = {}
    document.self = document

    storageInternals.client = {} as CosmosClient
    storageInternals.getOrCreateContainer = async () => ({
      container,
      compatibilityModePartitionKey: false,
    })

    let caughtError: unknown
    try {
      await storage.write({ document })
    } catch (err) {
      caughtError = err
    }

    assert.ok(isStorageError(caughtError))
    assert.strictEqual(caughtError.code, Errors.DocumentUpsertError.code)
    assert.strictEqual(caughtError.innerException, upsertError)
  })

  it('should reject unsupported partition keys without attempting container creation', async () => {
    const storage = createStorage('https://unsupported-partition-account.documents.azure.com/') as unknown as StorageInternals
    const container = {
      read: async () => ({ resource: { partitionKey: { paths: ['/tenantId'] } } }),
    } as unknown as Container
    let createContainerCalls = 0

    storage.client = {
      databases: {
        createIfNotExists: async () => ({
          database: {
            container: () => container,
            containers: {
              createIfNotExists: async () => {
                createContainerCalls++
                return { container }
              },
            },
          },
        }),
      },
    } as unknown as CosmosClient

    let caughtError: unknown
    try {
      await storage.initialize()
    } catch (err) {
      caughtError = err
    }

    assert.ok(isStorageError(caughtError))
    assert.strictEqual(caughtError.code, Errors.InitializationError.code)
    assert.ok(isStorageError(caughtError.innerException))
    assert.strictEqual(caughtError.innerException.code, Errors.UnsupportedCustomPartitionKeyPath.code)
    assert.strictEqual(createContainerCalls, 0)
  })

  it('should create the container when compatibility-mode validation returns not found', async () => {
    const storage = createStorage('https://missing-container-account.documents.azure.com/') as unknown as StorageInternals
    const existingContainer = {
      read: async () => {
        throw Object.assign(new Error('Container not found'), { code: 404 })
      },
    } as unknown as Container
    const createdContainer = {} as Container
    let createContainerCalls = 0

    storage.client = {
      databases: {
        createIfNotExists: async () => ({
          database: {
            container: () => existingContainer,
            containers: {
              createIfNotExists: async () => {
                createContainerCalls++
                return { container: createdContainer }
              },
            },
          },
        }),
      },
    } as unknown as CosmosClient

    await storage.initialize()

    assert.strictEqual(createContainerCalls, 1)
    assert.strictEqual(storage.container, createdContainer)
  })
})
