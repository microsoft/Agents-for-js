import assert from 'assert'
import { Container, CosmosClient } from '@azure/cosmos'
import { describe, it } from 'node:test'
import { CosmosDbPartitionedStorage } from '../src/cosmosDbPartitionedStorage'
import { Errors } from '../src/errorHelper'

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

function createStorage (endpoint: string): CosmosDbPartitionedStorage {
  return new CosmosDbPartitionedStorage({
    cosmosClientOptions: { endpoint, key: 'test-key' },
    databaseId: 'shared-database',
    containerId: 'shared-container',
  })
}

describe('CosmosDbPartitionedStorage initialization', () => {
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

  it('should share the detected partition-key mode with cached containers', async () => {
    const container = {} as Container
    const endpoint = 'https://partition-mode-account.documents.azure.com/'
    const firstStorage = createStorage(endpoint) as unknown as StorageInternals
    const secondStorage = createStorage(endpoint) as unknown as StorageInternals

    firstStorage.client = {} as CosmosClient
    secondStorage.client = {} as CosmosClient
    firstStorage.getOrCreateContainer = async () => ({
      container,
      compatibilityModePartitionKey: true,
    })
    secondStorage.getOrCreateContainer = async () => {
      throw new Error('The cached initialization should be reused')
    }

    await firstStorage.initialize()
    await secondStorage.initialize()

    assert.strictEqual(secondStorage.container, container)
    assert.strictEqual(secondStorage.compatibilityModePartitionKey, true)
  })

  it('should not create a client when container initialization is cached', async () => {
    const container = {} as Container
    const endpoint = 'https://cached-initialization-account.documents.azure.com/'
    const initializingStorage = createStorage(endpoint) as unknown as StorageInternals
    const cachedStorage = createStorage(endpoint) as unknown as StorageInternals

    initializingStorage.client = {} as CosmosClient
    initializingStorage.getOrCreateContainer = async () => ({
      container,
      compatibilityModePartitionKey: false,
    })
    cachedStorage.getOrCreateContainer = async () => {
      throw new Error('The cached initialization should be reused')
    }

    await initializingStorage.initialize()
    await cachedStorage.initialize()

    assert.strictEqual(cachedStorage.container, container)
    assert.strictEqual(cachedStorage.client, undefined)
  })

  it('should evict failed initialization attempts so a later call can retry', async () => {
    const endpoint = 'https://retry-account.documents.azure.com/'
    const firstStorage = createStorage(endpoint) as unknown as StorageInternals
    const concurrentStorage = createStorage(endpoint) as unknown as StorageInternals
    const retryStorage = createStorage(endpoint) as unknown as StorageInternals
    const container = {} as Container
    let attempts = 0
    let rejectInitialization!: (reason: Error) => void
    const failedInitialization = new Promise<{
      container: Container;
      compatibilityModePartitionKey: boolean;
    }>((_resolve, reject) => {
      rejectInitialization = reject
    })

    firstStorage.client = {} as CosmosClient
    concurrentStorage.client = {} as CosmosClient
    retryStorage.client = {} as CosmosClient
    firstStorage.getOrCreateContainer = async () => {
      attempts++
      return failedInitialization
    }
    concurrentStorage.getOrCreateContainer = async () => {
      throw new Error('Concurrent callers should share the cached attempt')
    }
    retryStorage.getOrCreateContainer = async () => {
      attempts++
      return { container, compatibilityModePartitionKey: false }
    }

    const initializations = Promise.allSettled([
      firstStorage.initialize(),
      concurrentStorage.initialize(),
    ])
    rejectInitialization(new Error('Transient initialization failure'))

    const results = await initializations
    assert.deepStrictEqual(results.map(result => result.status), ['rejected', 'rejected'])
    assert.strictEqual(attempts, 1)

    await retryStorage.initialize()

    assert.strictEqual(attempts, 2)
    assert.strictEqual(retryStorage.container, container)
  })

  it('should cache initialization attempts that throw synchronously', async () => {
    const endpoint = 'https://synchronous-failure-account.documents.azure.com/'
    const firstStorage = createStorage(endpoint) as unknown as StorageInternals
    const concurrentStorage = createStorage(endpoint) as unknown as StorageInternals
    const retryStorage = createStorage(endpoint) as unknown as StorageInternals
    const container = {} as Container
    let attempts = 0
    const throwSynchronously = (): never => {
      attempts++
      throw new Error('Synchronous initialization failure')
    }

    firstStorage.client = {} as CosmosClient
    concurrentStorage.client = {} as CosmosClient
    retryStorage.client = {} as CosmosClient
    firstStorage.getOrCreateContainer = throwSynchronously
    concurrentStorage.getOrCreateContainer = throwSynchronously
    retryStorage.getOrCreateContainer = async () => {
      attempts++
      return { container, compatibilityModePartitionKey: false }
    }

    const results = await Promise.allSettled([
      firstStorage.initialize(),
      concurrentStorage.initialize(),
    ])

    assert.deepStrictEqual(results.map(result => result.status), ['rejected', 'rejected'])
    assert.strictEqual(attempts, 1)

    await retryStorage.initialize()

    assert.strictEqual(attempts, 2)
    assert.strictEqual(retryStorage.container, container)
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

  it('should evict least-recently-used successful initializations after the cache limit', async () => {
    const firstEndpoint = 'https://lru-account-0.documents.azure.com/'
    const firstContainer = {} as Container
    const firstStorage = createStorage(firstEndpoint) as unknown as StorageInternals
    firstStorage.client = {} as CosmosClient
    firstStorage.getOrCreateContainer = async () => ({
      container: firstContainer,
      compatibilityModePartitionKey: false,
    })
    await firstStorage.initialize()

    for (let i = 1; i <= 100; i++) {
      const storage = createStorage(`https://lru-account-${i}.documents.azure.com/`) as unknown as StorageInternals
      storage.client = {} as CosmosClient
      storage.getOrCreateContainer = async () => ({
        container: {} as Container,
        compatibilityModePartitionKey: false,
      })
      await storage.initialize()
    }

    const replacementContainer = {} as Container
    const replacementStorage = createStorage(firstEndpoint) as unknown as StorageInternals
    replacementStorage.client = {} as CosmosClient
    replacementStorage.getOrCreateContainer = async () => ({
      container: replacementContainer,
      compatibilityModePartitionKey: false,
    })

    await replacementStorage.initialize()

    assert.strictEqual(replacementStorage.container, replacementContainer)
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
