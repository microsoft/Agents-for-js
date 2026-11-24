import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { Container, CosmosClient, CosmosClientOptions } from '@azure/cosmos'
import { describe, it, type TestContext } from 'node:test'
import {
  AuthType,
  MsalTokenCredential,
  MsalTokenProvider,
  StorageOperationStatus,
} from '@microsoft/agents-hosting'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { CosmosDbPartitionedStorage, CosmosDbPartitionedStorageV2 } from '../src/cosmosDbPartitionedStorage'
import { CosmosDbPartitionedStorageOptions } from '../src/cosmosDbPartitionedStorageOptions'
import { Errors } from '../src/errorHelper'

type Credential = NonNullable<CosmosClientOptions['aadCredentials']>
type CosmosStorage = CosmosDbPartitionedStorage | CosmosDbPartitionedStorageV2

interface StorageInternals {
  client: CosmosClient;
  container: Container;
  compatibilityModePartitionKey: boolean;
  initialize: () => Promise<void>;
}

interface InitializationError extends Error {
  code: number;
  innerException: InitializationError;
}

interface RecordedRequest {
  method: string;
  path: string;
  authorization: string | undefined;
  partitionKey: string | undefined;
}

const endpoint = 'https://identity-test.documents.azure.com'
const containerPath = '/dbs/agents/colls/state'
const constructors = [CosmosDbPartitionedStorage, CosmosDbPartitionedStorageV2]

function getInternals (storage: CosmosStorage): StorageInternals {
  if (storage instanceof CosmosDbPartitionedStorageV2) {
    return (storage as unknown as { internals: StorageInternals }).internals
  }
  return storage as unknown as StorageInternals
}

function createCredential (token = 'test-identity-token'): Credential {
  return {
    async getToken () {
      return { token, expiresOnTimestamp: Date.now() + 3600000 }
    },
  }
}

function createOptions (clientOptions: Partial<CosmosClientOptions> = {}): CosmosDbPartitionedStorageOptions {
  return {
    databaseId: 'agents',
    containerId: 'state',
    cosmosClientOptions: {
      endpoint,
      aadCredentials: createCredential(),
      ...clientOptions,
    },
  }
}

function createStatusError (code: number): Error {
  return Object.assign(ExceptionHelper.generateException(Error, Errors.ContainerReadError), { code })
}

function assertInitializationError (error: unknown): asserts error is InitializationError {
  assert.ok(error instanceof Error)
  assert.equal((error as InitializationError).code, Errors.InitializationError.code)
}

/** Exercise the real Cosmos client and its credential pipeline without accessing Azure. */
function createTransport (options: { allowDatabaseRead?: boolean } = {}) {
  const requests: RecordedRequest[] = []
  const documents = new Map<string, Record<string, unknown>>()
  const httpClient: NonNullable<CosmosClientOptions['httpClient']> = {
    async sendRequest (request) {
      const path = new URL(request.url).pathname.replace(/\/$/, '')
      requests.push({
        method: request.method,
        path,
        authorization: request.headers.get('authorization'),
        partitionKey: request.headers.get('x-ms-documentdb-partitionkey'),
      })

      let status = 200
      let body: object
      if (request.method === 'GET' && path === '') {
        body = {
          id: 'identity-test',
          writableLocations: [{ name: 'test', databaseAccountEndpoint: endpoint }],
          readableLocations: [{ name: 'test', databaseAccountEndpoint: endpoint }],
        }
      } else if (options.allowDatabaseRead && request.method === 'GET' && path === '/dbs/agents') {
        body = { id: 'agents' }
      } else if (request.method === 'GET' && path === containerPath) {
        body = { id: 'state', partitionKey: { paths: ['/id'] }, defaultTtl: -1 }
      } else if (request.method === 'POST' && path === `${containerPath}/docs`) {
        assert.equal(typeof request.body, 'string')
        const document = JSON.parse(request.body as string)
        documents.set(document.id, { ...document, _etag: 'test-version' })
        body = document
        status = 201
      } else if (request.method === 'GET' && path.startsWith(`${containerPath}/docs/`)) {
        const id = decodeURIComponent(path.substring(`${containerPath}/docs/`.length))
        const document = documents.get(id)
        status = document ? 200 : 404
        body = document ?? { message: 'Item not found' }
      } else if (request.method === 'DELETE' && path.startsWith(`${containerPath}/docs/`)) {
        const id = decodeURIComponent(path.substring(`${containerPath}/docs/`.length))
        documents.delete(id)
        status = 204
        body = {}
      } else {
        assert.fail(`Unexpected Cosmos request: ${request.method} ${path}`)
      }

      request.headers.set('etag', 'test-version')
      return {
        request,
        headers: request.headers,
        status,
        bodyAsText: status === 204 ? '' : JSON.stringify(body),
      }
    },
  }
  return { httpClient, requests, documents }
}

function assertLazyCredentialConstruction (
  StorageClass: typeof CosmosDbPartitionedStorage | typeof CosmosDbPartitionedStorageV2
) {
  let tokenCalls = 0
  const credential: Credential = {
    async getToken () {
      tokenCalls++
      return { token: 'unused', expiresOnTimestamp: Date.now() + 3600000 }
    },
  }
  const storage = new StorageClass(createOptions({ aadCredentials: credential }))

  assert.equal(tokenCalls, 0)
  assert.equal(getInternals(storage).client, undefined)
}

function assertMissingCredentialValidation (
  StorageClass: typeof CosmosDbPartitionedStorage | typeof CosmosDbPartitionedStorageV2
) {
  assert.throws(
    () => new StorageClass(createOptions({ aadCredentials: undefined })),
    { code: Errors.MissingCosmosCredentials.code }
  )
}

async function assertLazyEmptyOperations (
  StorageClass: typeof CosmosDbPartitionedStorage | typeof CosmosDbPartitionedStorageV2
) {
  const storage = new StorageClass(createOptions())

  assert.deepEqual(await storage.read([]), {})
  await storage.write({})
  assert.equal(getInternals(storage).client, undefined)
}

async function assertCredentialCrud (
  StorageClass: typeof CosmosDbPartitionedStorage | typeof CosmosDbPartitionedStorageV2,
  t: TestContext
) {
  const transport = createTransport()
  const requestedScopes: Array<string | string[]> = []
  const credential: Credential = {
    async getToken (scopes) {
      requestedScopes.push(scopes)
      return { token: 'identity-for-crud', expiresOnTimestamp: Date.now() + 3600000 }
    },
  }
  const storage = new StorageClass(createOptions({ aadCredentials: credential, httpClient: transport.httpClient }))
  t.after(() => getInternals(storage).client?.dispose())

  await storage.write({ key: { value: 'saved' } })
  const results = await storage.read(['key'])
  if (storage instanceof CosmosDbPartitionedStorageV2) {
    assert.equal(results.key.status, StorageOperationStatus.Succeeded)
    assert.deepEqual(results.key.value, { value: 'saved' })
    assert.equal(results.key.version, 'test-version')
  } else {
    assert.deepEqual(results.key, { value: 'saved', eTag: 'test-version' })
  }
  await storage.delete(['key'])

  assert.equal(transport.documents.size, 0)
  assert.deepEqual(requestedScopes, [[`${endpoint}/.default`]])
  assert.equal(transport.requests.filter(request => request.path === containerPath).length, 1)
  for (const request of transport.requests) {
    assert.equal(request.authorization, 'type=aad&ver=1.0&sig=identity-for-crud')
    if (request.path.includes('/docs')) {
      assert.equal(request.partitionKey, '["key"]')
    }
  }
}

async function assertIdPartition (
  StorageClass: typeof CosmosDbPartitionedStorage | typeof CosmosDbPartitionedStorageV2,
  compatibilityMode: boolean
) {
  const storage = new StorageClass({ ...createOptions(), compatibilityMode })
  const internals = getInternals(storage)
  let metadataReads = 0
  const container = {
    read: async () => {
      metadataReads++
      return { resource: { partitionKey: { paths: ['/id'] } } }
    },
  } as unknown as Container
  internals.client = {
    database: (databaseId: string) => {
      assert.equal(databaseId, 'agents')
      return {
        container: (containerId: string) => {
          assert.equal(containerId, 'state')
          return container
        },
      }
    },
  } as unknown as CosmosClient

  await internals.initialize()
  assert.equal(metadataReads, 1)
  assert.equal(internals.container, container)
  assert.equal(internals.compatibilityModePartitionKey, false)
}

async function assertPartitionPaths (
  StorageClass: typeof CosmosDbPartitionedStorage | typeof CosmosDbPartitionedStorageV2,
  paths: string[] | undefined,
  compatibilityMode: boolean
) {
  const storage = new StorageClass({ ...createOptions(), compatibilityMode })
  const internals = getInternals(storage)
  const container = {
    read: async () => ({ resource: { partitionKey: paths === undefined ? undefined : { paths } } }),
  } as unknown as Container
  internals.client = {
    database: () => ({ container: () => container }),
  } as unknown as CosmosClient

  const supportsLegacy = paths === undefined || (paths.length === 1 && paths[0] === '/_partitionKey')
  if (compatibilityMode && supportsLegacy) {
    await internals.initialize()
    assert.equal(internals.compatibilityModePartitionKey, true)
  } else {
    await assert.rejects(internals.initialize(), error => {
      assertInitializationError(error)
      assert.equal(error.innerException.code, Errors.UnsupportedCustomPartitionKeyPath.code)
      return true
    })
  }
}

async function assertInitializationRetry (
  StorageClass: typeof CosmosDbPartitionedStorage | typeof CosmosDbPartitionedStorageV2,
  status: number | 'transport'
) {
  const storage = new StorageClass(createOptions())
  const internals = getInternals(storage)
  const original = status === 'transport'
    ? Object.assign(ExceptionHelper.generateException(Error, Errors.ContainerReadError), { code: 'ECONNRESET' })
    : createStatusError(status)
  let attempts = 0
  const container = {
    read: async () => {
      attempts++
      if (attempts === 1) {
        throw original
      }
      return { resource: { partitionKey: { paths: ['/id'] } } }
    },
  } as unknown as Container
  internals.client = {
    database: () => ({ container: () => container }),
  } as unknown as CosmosClient

  await assert.rejects(internals.initialize(), error => {
    assertInitializationError(error)
    if (status === 404) {
      assert.equal(error.innerException.code, Errors.ExistingContainerNotFound.code)
      assert.equal(error.innerException.innerException, original)
      assert.match(error.innerException.message, /preprovisioned/)
      assert.match(error.innerException.message, /agents/)
      assert.match(error.innerException.message, /state/)
    } else {
      assert.equal(error.innerException, original)
    }
    return true
  })
  await internals.initialize()
  assert.equal(attempts, 2)
}

async function assertProvisioning (
  StorageClass: typeof CosmosDbPartitionedStorage | typeof CosmosDbPartitionedStorageV2,
  authentication: string,
  compatibilityMode: boolean
) {
  const credential = createCredential()
  const tokenProvider = async () => 'test-resource-token'
  const clientOptions: Partial<CosmosClientOptions> = {}
  if (authentication === 'key' || authentication === 'mixedKey') {
    clientOptions.key = 'test-key'
  } else {
    clientOptions.tokenProvider = tokenProvider
  }
  clientOptions.aadCredentials = authentication.startsWith('mixed') ? credential : undefined
  const storage = new StorageClass({ ...createOptions(clientOptions), compatibilityMode })
  const internals = getInternals(storage)
  const container = {
    read: async () => {
      throw createStatusError(404)
    },
  } as unknown as Container
  const calls: string[] = []
  internals.client = {
    databases: {
      createIfNotExists: async (body: { id: string }) => {
        assert.equal(body.id, 'agents')
        calls.push('database')
        return {
          database: {
            container: () => container,
            containers: {
              createIfNotExists: async (body: object) => {
                assert.deepEqual(body, {
                  id: 'state',
                  partitionKey: { paths: ['/id'] },
                  defaultTtl: -1,
                  throughput: undefined,
                })
                calls.push('container')
                return { container }
              },
            },
          },
        }
      },
    },
  } as unknown as CosmosClient

  await internals.initialize()
  assert.deepEqual(calls, ['database', 'container'])
  assert.equal(internals.container, container)
}

async function assertMixedCredentialPrecedence (
  StorageClass: typeof CosmosDbPartitionedStorage | typeof CosmosDbPartitionedStorageV2,
  authentication: string,
  t: TestContext
) {
  const transport = createTransport({ allowDatabaseRead: true })
  const clientOptions: Partial<CosmosClientOptions> = {
    aadCredentials: createCredential('mixed-identity'),
    httpClient: transport.httpClient,
  }
  if (authentication === 'key') {
    clientOptions.key = Buffer.from('test-key').toString('base64')
  } else {
    clientOptions.tokenProvider = async () => 'test-resource-token'
  }
  const storage = new StorageClass(createOptions(clientOptions))
  t.after(() => getInternals(storage).client?.dispose())

  await getInternals(storage).initialize()

  assert.ok(transport.requests.some(request => request.path === '/dbs/agents'))
  assert.ok(transport.requests.every(request => request.authorization === 'type=aad&ver=1.0&sig=mixed-identity'))
}

describe('CosmosDbPartitionedStorage identity authentication', () => {
  it('accepts credentials without requesting a token or creating a client in the constructor', () => {
    return assertLazyCredentialConstruction(CosmosDbPartitionedStorage)
  })

  it('retains missing-credential validation', () => {
    return assertMissingCredentialValidation(CosmosDbPartitionedStorage)
  })

  it('keeps empty reads and writes lazy', () => {
    return assertLazyEmptyOperations(CosmosDbPartitionedStorage)
  })

  it('uses the real SDK credential pipeline for CRUD without database reads or provisioning', t => {
    return assertCredentialCrud(CosmosDbPartitionedStorage, t)
  })

  it('validates /id with compatibilityMode=true', () => {
    return assertIdPartition(CosmosDbPartitionedStorage, true)
  })

  it('validates /id with compatibilityMode=false', () => {
    return assertIdPartition(CosmosDbPartitionedStorage, false)
  })

  it('handles partition paths undefined with compatibilityMode=true', () => {
    return assertPartitionPaths(CosmosDbPartitionedStorage, undefined, true)
  })

  it('handles partition paths undefined with compatibilityMode=false', () => {
    return assertPartitionPaths(CosmosDbPartitionedStorage, undefined, false)
  })

  it('handles partition paths ["/_partitionKey"] with compatibilityMode=true', () => {
    return assertPartitionPaths(CosmosDbPartitionedStorage, ['/_partitionKey'], true)
  })

  it('handles partition paths ["/_partitionKey"] with compatibilityMode=false', () => {
    return assertPartitionPaths(CosmosDbPartitionedStorage, ['/_partitionKey'], false)
  })

  it('handles partition paths ["/tenant"] with compatibilityMode=true', () => {
    return assertPartitionPaths(CosmosDbPartitionedStorage, ['/tenant'], true)
  })

  it('handles partition paths ["/tenant"] with compatibilityMode=false', () => {
    return assertPartitionPaths(CosmosDbPartitionedStorage, ['/tenant'], false)
  })

  it('handles partition paths ["/id","/tenant"] with compatibilityMode=true', () => {
    return assertPartitionPaths(CosmosDbPartitionedStorage, ['/id', '/tenant'], true)
  })

  it('handles partition paths ["/id","/tenant"] with compatibilityMode=false', () => {
    return assertPartitionPaths(CosmosDbPartitionedStorage, ['/id', '/tenant'], false)
  })

  it('handles partition paths ["/_partitionKey","/tenant"] with compatibilityMode=true', () => {
    return assertPartitionPaths(CosmosDbPartitionedStorage, ['/_partitionKey', '/tenant'], true)
  })

  it('handles partition paths ["/_partitionKey","/tenant"] with compatibilityMode=false', () => {
    return assertPartitionPaths(CosmosDbPartitionedStorage, ['/_partitionKey', '/tenant'], false)
  })

  it('handles partition paths [] with compatibilityMode=true', () => {
    return assertPartitionPaths(CosmosDbPartitionedStorage, [], true)
  })

  it('handles partition paths [] with compatibilityMode=false', () => {
    return assertPartitionPaths(CosmosDbPartitionedStorage, [], false)
  })

  it('preserves 404 initialization failures and permits retry', () => {
    return assertInitializationRetry(CosmosDbPartitionedStorage, 404)
  })

  it('preserves 401 initialization failures and permits retry', () => {
    return assertInitializationRetry(CosmosDbPartitionedStorage, 401)
  })

  it('preserves 403 initialization failures and permits retry', () => {
    return assertInitializationRetry(CosmosDbPartitionedStorage, 403)
  })

  it('preserves 429 initialization failures and permits retry', () => {
    return assertInitializationRetry(CosmosDbPartitionedStorage, 429)
  })

  it('preserves transport initialization failures and permits retry', () => {
    return assertInitializationRetry(CosmosDbPartitionedStorage, 'transport')
  })

  it('preserves key provisioning with compatibilityMode=true', () => {
    return assertProvisioning(CosmosDbPartitionedStorage, 'key', true)
  })

  it('preserves key provisioning with compatibilityMode=false', () => {
    return assertProvisioning(CosmosDbPartitionedStorage, 'key', false)
  })

  it('preserves tokenProvider provisioning with compatibilityMode=true', () => {
    return assertProvisioning(CosmosDbPartitionedStorage, 'tokenProvider', true)
  })

  it('preserves tokenProvider provisioning with compatibilityMode=false', () => {
    return assertProvisioning(CosmosDbPartitionedStorage, 'tokenProvider', false)
  })

  it('preserves mixedKey provisioning with compatibilityMode=true', () => {
    return assertProvisioning(CosmosDbPartitionedStorage, 'mixedKey', true)
  })

  it('preserves mixedKey provisioning with compatibilityMode=false', () => {
    return assertProvisioning(CosmosDbPartitionedStorage, 'mixedKey', false)
  })

  it('preserves mixedTokenProvider provisioning with compatibilityMode=true', () => {
    return assertProvisioning(CosmosDbPartitionedStorage, 'mixedTokenProvider', true)
  })

  it('preserves mixedTokenProvider provisioning with compatibilityMode=false', () => {
    return assertProvisioning(CosmosDbPartitionedStorage, 'mixedTokenProvider', false)
  })

  it('preserves SDK authorization precedence when aadCredentials is combined with key', t => {
    return assertMixedCredentialPrecedence(CosmosDbPartitionedStorage, 'key', t)
  })

  it('preserves SDK authorization precedence when aadCredentials is combined with tokenProvider', t => {
    return assertMixedCredentialPrecedence(CosmosDbPartitionedStorage, 'tokenProvider', t)
  })
})

describe('CosmosDbPartitionedStorageV2 identity authentication', () => {
  it('accepts credentials without requesting a token or creating a client in the constructor', () => {
    return assertLazyCredentialConstruction(CosmosDbPartitionedStorageV2)
  })

  it('retains missing-credential validation', () => {
    return assertMissingCredentialValidation(CosmosDbPartitionedStorageV2)
  })

  it('keeps empty reads and writes lazy', () => {
    return assertLazyEmptyOperations(CosmosDbPartitionedStorageV2)
  })

  it('uses the real SDK credential pipeline for CRUD without database reads or provisioning', t => {
    return assertCredentialCrud(CosmosDbPartitionedStorageV2, t)
  })

  it('validates /id with compatibilityMode=true', () => {
    return assertIdPartition(CosmosDbPartitionedStorageV2, true)
  })

  it('validates /id with compatibilityMode=false', () => {
    return assertIdPartition(CosmosDbPartitionedStorageV2, false)
  })

  it('handles partition paths undefined with compatibilityMode=true', () => {
    return assertPartitionPaths(CosmosDbPartitionedStorageV2, undefined, true)
  })

  it('handles partition paths undefined with compatibilityMode=false', () => {
    return assertPartitionPaths(CosmosDbPartitionedStorageV2, undefined, false)
  })

  it('handles partition paths ["/_partitionKey"] with compatibilityMode=true', () => {
    return assertPartitionPaths(CosmosDbPartitionedStorageV2, ['/_partitionKey'], true)
  })

  it('handles partition paths ["/_partitionKey"] with compatibilityMode=false', () => {
    return assertPartitionPaths(CosmosDbPartitionedStorageV2, ['/_partitionKey'], false)
  })

  it('handles partition paths ["/tenant"] with compatibilityMode=true', () => {
    return assertPartitionPaths(CosmosDbPartitionedStorageV2, ['/tenant'], true)
  })

  it('handles partition paths ["/tenant"] with compatibilityMode=false', () => {
    return assertPartitionPaths(CosmosDbPartitionedStorageV2, ['/tenant'], false)
  })

  it('handles partition paths ["/id","/tenant"] with compatibilityMode=true', () => {
    return assertPartitionPaths(CosmosDbPartitionedStorageV2, ['/id', '/tenant'], true)
  })

  it('handles partition paths ["/id","/tenant"] with compatibilityMode=false', () => {
    return assertPartitionPaths(CosmosDbPartitionedStorageV2, ['/id', '/tenant'], false)
  })

  it('handles partition paths ["/_partitionKey","/tenant"] with compatibilityMode=true', () => {
    return assertPartitionPaths(CosmosDbPartitionedStorageV2, ['/_partitionKey', '/tenant'], true)
  })

  it('handles partition paths ["/_partitionKey","/tenant"] with compatibilityMode=false', () => {
    return assertPartitionPaths(CosmosDbPartitionedStorageV2, ['/_partitionKey', '/tenant'], false)
  })

  it('handles partition paths [] with compatibilityMode=true', () => {
    return assertPartitionPaths(CosmosDbPartitionedStorageV2, [], true)
  })

  it('handles partition paths [] with compatibilityMode=false', () => {
    return assertPartitionPaths(CosmosDbPartitionedStorageV2, [], false)
  })

  it('preserves 404 initialization failures and permits retry', () => {
    return assertInitializationRetry(CosmosDbPartitionedStorageV2, 404)
  })

  it('preserves 401 initialization failures and permits retry', () => {
    return assertInitializationRetry(CosmosDbPartitionedStorageV2, 401)
  })

  it('preserves 403 initialization failures and permits retry', () => {
    return assertInitializationRetry(CosmosDbPartitionedStorageV2, 403)
  })

  it('preserves 429 initialization failures and permits retry', () => {
    return assertInitializationRetry(CosmosDbPartitionedStorageV2, 429)
  })

  it('preserves transport initialization failures and permits retry', () => {
    return assertInitializationRetry(CosmosDbPartitionedStorageV2, 'transport')
  })

  it('preserves key provisioning with compatibilityMode=true', () => {
    return assertProvisioning(CosmosDbPartitionedStorageV2, 'key', true)
  })

  it('preserves key provisioning with compatibilityMode=false', () => {
    return assertProvisioning(CosmosDbPartitionedStorageV2, 'key', false)
  })

  it('preserves tokenProvider provisioning with compatibilityMode=true', () => {
    return assertProvisioning(CosmosDbPartitionedStorageV2, 'tokenProvider', true)
  })

  it('preserves tokenProvider provisioning with compatibilityMode=false', () => {
    return assertProvisioning(CosmosDbPartitionedStorageV2, 'tokenProvider', false)
  })

  it('preserves mixedKey provisioning with compatibilityMode=true', () => {
    return assertProvisioning(CosmosDbPartitionedStorageV2, 'mixedKey', true)
  })

  it('preserves mixedKey provisioning with compatibilityMode=false', () => {
    return assertProvisioning(CosmosDbPartitionedStorageV2, 'mixedKey', false)
  })

  it('preserves mixedTokenProvider provisioning with compatibilityMode=true', () => {
    return assertProvisioning(CosmosDbPartitionedStorageV2, 'mixedTokenProvider', true)
  })

  it('preserves mixedTokenProvider provisioning with compatibilityMode=false', () => {
    return assertProvisioning(CosmosDbPartitionedStorageV2, 'mixedTokenProvider', false)
  })

  it('preserves SDK authorization precedence when aadCredentials is combined with key', t => {
    return assertMixedCredentialPrecedence(CosmosDbPartitionedStorageV2, 'key', t)
  })

  it('preserves SDK authorization precedence when aadCredentials is combined with tokenProvider', t => {
    return assertMixedCredentialPrecedence(CosmosDbPartitionedStorageV2, 'tokenProvider', t)
  })
})

describe('Cosmos client isolation and Agents credential interoperability', () => {
  it('keeps each identity and custom transport bound to its own client', async t => {
    const firstTransport = createTransport()
    const secondTransport = createTransport()
    const first = new CosmosDbPartitionedStorage(createOptions({
      aadCredentials: createCredential('first-identity'),
      httpClient: firstTransport.httpClient,
    }))
    const second = new CosmosDbPartitionedStorageV2(createOptions({
      aadCredentials: createCredential('second-identity'),
      httpClient: secondTransport.httpClient,
    }))
    t.after(() => {
      getInternals(first).client?.dispose()
      getInternals(second).client?.dispose()
    })

    await first.write({ key: { owner: 'first' } })
    await second.write({ key: { owner: 'second' } })
    const firstResult = await first.read(['key'])
    const secondResult = await second.read(['key'])

    assert.equal(firstResult.key.owner, 'first')
    assert.equal(secondResult.key.value?.owner, 'second')
    assert.ok(firstTransport.requests.every(request => request.authorization === 'type=aad&ver=1.0&sig=first-identity'))
    assert.ok(secondTransport.requests.every(request => request.authorization === 'type=aad&ver=1.0&sig=second-identity'))
    assert.notEqual(getInternals(first).client, getInternals(second).client)
  })

  it('does not share containers across versions, credentials, or client settings at the same address', async () => {
    const storages: CosmosStorage[] = []
    const containers: Container[] = []
    for (const StorageClass of constructors) {
      for (const key of ['first-key', 'second-key', undefined]) {
        for (const compatibilityMode of [true, false]) {
          const storage = new StorageClass({
            ...createOptions({ key, aadCredentials: key ? undefined : createCredential() }),
            compatibilityMode,
          })
          const internals = getInternals(storage)
          const container = {} as Container
          internals.client = {} as CosmosClient
          const stub = internals as StorageInternals & {
            getOrCreateContainer: () => Promise<{ container: Container, compatibilityModePartitionKey: boolean }>;
          }
          stub.getOrCreateContainer = async () => ({ container, compatibilityModePartitionKey: compatibilityMode })
          storages.push(storage)
          containers.push(container)
        }
      }
    }

    await Promise.all(storages.map(storage => getInternals(storage).initialize()))
    for (const [index, storage] of storages.entries()) {
      const internals = getInternals(storage)
      assert.equal(internals.container, containers[index])
      assert.equal(internals.compatibilityModePartitionKey, index % 2 === 0)
    }
  })

  it('passes the Cosmos scope through MsalTokenCredential to the Agents token provider', async t => {
    const calls: string[] = []
    t.mock.method(MsalTokenProvider.prototype, 'getAccessToken', async (_configuration: unknown, scope: string) => {
      calls.push(scope)
      return 'agents-provider-token'
    })
    const credential = new MsalTokenCredential({
      clientId: 'test-managed-identity-client',
      authType: AuthType.UserManagedIdentity,
    })
    const transport = createTransport()
    const storage = new CosmosDbPartitionedStorage(createOptions({ aadCredentials: credential, httpClient: transport.httpClient }))
    t.after(() => getInternals(storage).client?.dispose())

    await storage.initialize()

    assert.ok(calls.length > 0)
    assert.ok(calls.every(scope => scope === endpoint))
    assert.ok(transport.requests.every(request => request.authorization === 'type=aad&ver=1.0&sig=agents-provider-token'))
  })

  it('logs authentication modes without logging credentials', () => {
    const script = `
      import { CosmosDbPartitionedStorage } from './packages/agents-hosting-storage-cosmos/src/cosmosDbPartitionedStorage.ts'

      const authenticationOptions = [
        { key: 'key-must-remain-private' },
        { tokenProvider: async () => 'callback-must-remain-private' },
        {
          key: 'mixed-key-must-remain-private',
          tokenProvider: async () => 'mixed-callback-must-remain-private',
        },
        {
          aadCredentials: {
            privateField: 'credential-must-remain-private',
            getToken: async () => ({ token: 'token-must-remain-private', expiresOnTimestamp: 0 }),
          },
        },
      ]

      for (const authentication of authenticationOptions) {
        new CosmosDbPartitionedStorage({
          databaseId: 'agents',
          containerId: 'state',
          cosmosClientOptions: {
            endpoint: 'https://identity-test.documents.azure.com',
            ...authentication,
          },
        })
      }
    `
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
      cwd: process.cwd(),
      env: { ...process.env, DEBUG: 'agents:cosmos-storage:info' },
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr)
    const output = result.stdout + result.stderr
    assert.deepEqual(
      [...output.matchAll(/mode: '([^']+)'/g)].map(match => match[1]),
      ['connectionString', 'tokenProvider', 'tokenProvider', 'tokenCredential']
    )
    assert.doesNotMatch(output, /must-remain-private/)
  })
})
