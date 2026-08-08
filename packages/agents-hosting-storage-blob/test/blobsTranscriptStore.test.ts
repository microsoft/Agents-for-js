import { describe, it } from 'node:test'
import assert from 'assert'
import { Readable } from 'node:stream'
import { BlobItem } from '@azure/storage-blob'
import { Activity } from '@microsoft/agents-activity'
import { BlobsTranscriptStore, sanitizeBlobKey } from '../src/blobsTranscriptStore'

function createStore (pages: BlobItem[][], deleted?: string[]): BlobsTranscriptStore {
  const store = new BlobsTranscriptStore('UseDevelopmentStorage=true;', 'transcripts')
  const listPages = () => ({
    byPage: ({ continuationToken }: { continuationToken?: string } = {}) => {
      let pageIndex = continuationToken ? Number.parseInt(continuationToken, 10) : 0

      return {
        next: async () => {
          if (pageIndex >= pages.length) {
            return { done: true, value: undefined }
          }

          const nextPageIndex = pageIndex + 1
          const value = {
            continuationToken: nextPageIndex < pages.length ? nextPageIndex.toString() : undefined,
            segment: { blobItems: pages[pageIndex] },
          }
          pageIndex = nextPageIndex
          return { done: false, value }
        },
      }
    },
  })
  const containerClient = {
    createIfNotExists: async () => undefined,
    listBlobsFlat: listPages,
    getBlobClient: (name: string) => ({
      download: async () => ({
        readableStreamBody: Readable.from([JSON.stringify({
          type: 'message',
          id: name,
          timestamp: '2026-01-01T00:00:00.000Z',
        })]),
      }),
    }),
    deleteBlob: async (name: string) => {
      deleted?.push(name)
    },
  }

  Object.defineProperty(store, '_containerClient', { value: containerClient })
  return store
}

function blob (name: string, timestamp: string): BlobItem {
  return { name, metadata: { timestamp }, properties: {} } as BlobItem
}

function createFilteringStore (
  items: BlobItem[]
): { store: BlobsTranscriptStore; deleted: string[]; listOptions: Array<{ prefix?: string; includeMetadata?: boolean }> } {
  const store = new BlobsTranscriptStore('UseDevelopmentStorage=true;', 'transcripts')
  const deleted: string[] = []
  const listOptions: Array<{ prefix?: string; includeMetadata?: boolean }> = []
  const listBlobs = (options?: { prefix?: string; includeMetadata?: boolean }) => {
    listOptions.push(options ?? {})
    const filteredItems = items.filter(({ name }) => name.startsWith(options?.prefix ?? ''))
    let hasNextPage = true

    return {
      byPage: () => ({
        next: async () => {
          if (!hasNextPage) {
            return { done: true, value: undefined }
          }

          hasNextPage = false
          return { done: false, value: { segment: { blobItems: filteredItems } } }
        },
      }),
    }
  }
  const containerClient = {
    createIfNotExists: async () => undefined,
    listBlobsFlat: listBlobs,
    getBlobClient: (name: string) => ({
      download: async () => ({
        readableStreamBody: Readable.from([JSON.stringify({
          type: 'message',
          id: name,
          timestamp: '2026-01-01T00:00:00.000Z',
        })]),
      }),
    }),
    deleteBlob: async (name: string) => {
      deleted.push(name)
    },
  }

  Object.defineProperty(store, '_containerClient', { value: containerClient })
  return { store, deleted, listOptions }
}

describe('BlobsTranscriptStore.listTranscripts', () => {
  it('does not include transcripts from neighboring channel prefixes', async () => {
    const channelBlob = sanitizeBlobKey('channel/conv/file.json')
    const neighboringChannelBlob = sanitizeBlobKey('channel2/conv/file.json')
    const { store } = createFilteringStore([
      blob(channelBlob, '2026-01-01T00:00:00.000Z'),
      blob(neighboringChannelBlob, '2026-01-02T00:00:00.000Z'),
    ])

    const result = await store.listTranscripts('channel')

    assert.deepStrictEqual(result.items.map(({ id }) => id), ['conv'])
  })

  it('extracts conversation IDs from encoded blob names', async () => {
    const store = createStore([[
      blob(sanitizeBlobKey('teams/conv-one/file.json'), '2026-01-02T00:00:00.000Z'),
      blob(sanitizeBlobKey('teams/conv-two/file.json'), '2026-01-03T00:00:00.000Z'),
    ]])

    const result = await store.listTranscripts('teams')

    assert.deepStrictEqual(result.items.map(({ id }) => id), ['conv-one', 'conv-two'])
  })

  it('requests metadata used for the transcript creation timestamp', async () => {
    const { store, listOptions } = createFilteringStore([
      blob(sanitizeBlobKey('teams/conv/file.json'), '2026-01-01T00:00:00.000Z'),
    ])

    await store.listTranscripts('teams')

    assert.strictEqual(listOptions[0].includeMetadata, true)
  })

  it('reads the creation timestamp using the metadata casing returned by Azure', async () => {
    const store = createStore([[
      {
        name: sanitizeBlobKey('teams/conv/file.json'),
        metadata: { Timestamp: '2026-01-01T00:00:00.000Z' },
        properties: {},
      } as BlobItem,
    ]])

    const result = await store.listTranscripts('teams')

    assert.strictEqual(result.items[0].created.toISOString(), '2026-01-01T00:00:00.000Z')
  })

  it('returns one page at a time and preserves its continuation token', async () => {
    const store = createStore([
      [
        blob(sanitizeBlobKey('teams/conv/file-two.json'), '2026-01-03T00:00:00.000Z'),
        blob(sanitizeBlobKey('teams/conv/file-one.json'), '2026-01-01T00:00:00.000Z'),
      ],
      [
        blob(sanitizeBlobKey('teams/other/file.json'), '2026-01-02T00:00:00.000Z'),
      ],
    ])

    const firstPage = await store.listTranscripts('teams')
    const secondPage = await store.listTranscripts('teams', firstPage.continuationToken)

    assert.deepStrictEqual(firstPage.items.map(({ id }) => id), ['conv'])
    assert.strictEqual(firstPage.items[0].created.toISOString(), '2026-01-01T00:00:00.000Z')
    assert.strictEqual(firstPage.continuationToken, '1')
    assert.deepStrictEqual(secondPage.items.map(({ id }) => id), ['other'])
    assert.strictEqual(secondPage.continuationToken, '')
  })

  it('skips malformed blob names', async () => {
    const store = createStore([[
      blob('teams-only', '2026-01-01T00:00:00.000Z'),
      blob('%invalid', '2026-01-01T00:00:00.000Z'),
    ]])

    const result = await store.listTranscripts('teams')

    assert.deepStrictEqual(result.items, [])
  })
})

describe('BlobsTranscriptStore.getTranscriptActivities', () => {
  it('returns one page at a time and preserves its continuation token', async () => {
    const firstBlob = blob(sanitizeBlobKey('channel/conv/first.json'), '2026-01-01T00:00:00.000Z')
    const secondBlob = blob(sanitizeBlobKey('channel/conv/second.json'), '2026-01-02T00:00:00.000Z')
    const store = createStore([[firstBlob], [secondBlob]])

    const firstPage = await store.getTranscriptActivities('channel', 'conv')
    const secondPage = await store.getTranscriptActivities('channel', 'conv', firstPage.continuationToken)

    assert.deepStrictEqual(firstPage.items.map(({ id }) => id), [firstBlob.name])
    assert.strictEqual(firstPage.continuationToken, '1')
    assert.deepStrictEqual(secondPage.items.map(({ id }) => id), [secondBlob.name])
    assert.strictEqual(secondPage.continuationToken, '')
  })

  it('does not read activities from neighboring conversation prefixes', async () => {
    const conversationBlob = sanitizeBlobKey('channel/conv/file.json')
    const neighboringConversationBlob = sanitizeBlobKey('channel/conv2/file.json')
    const { store } = createFilteringStore([
      blob(conversationBlob, '2026-01-01T00:00:00.000Z'),
      blob(neighboringConversationBlob, '2026-01-02T00:00:00.000Z'),
    ])

    const result = await store.getTranscriptActivities('channel', 'conv')

    assert.deepStrictEqual(result.items.map(({ id }) => id), [conversationBlob])
  })
})

describe('BlobsTranscriptStore.deleteTranscript', () => {
  it('deletes activities across all pages', async () => {
    const firstBlob = blob(sanitizeBlobKey('channel/conv/first.json'), '2026-01-01T00:00:00.000Z')
    const secondBlob = blob(sanitizeBlobKey('channel/conv/second.json'), '2026-01-02T00:00:00.000Z')
    const deleted: string[] = []
    const store = createStore([[firstBlob], [secondBlob]], deleted)

    await store.deleteTranscript('channel', 'conv')

    assert.deepStrictEqual(deleted, [firstBlob.name, secondBlob.name])
  })

  it('does not delete activities from neighboring conversation prefixes', async () => {
    const conversationBlob = sanitizeBlobKey('channel/conv/file.json')
    const neighboringConversationBlob = sanitizeBlobKey('channel/conv2/file.json')
    const { store, deleted } = createFilteringStore([
      blob(conversationBlob, '2026-01-01T00:00:00.000Z'),
      blob(neighboringConversationBlob, '2026-01-02T00:00:00.000Z'),
    ])

    await store.deleteTranscript('channel', 'conv')

    assert.deepStrictEqual(deleted, [conversationBlob])
  })
})

describe('BlobsTranscriptStore.logActivity', () => {
  it('preserves the per-call transcript key option', async () => {
    const store = new BlobsTranscriptStore('UseDevelopmentStorage=true;', 'transcripts')
    let uploadedBlobName = ''
    const containerClient = {
      createIfNotExists: async () => undefined,
      getBlockBlobClient: (name: string) => {
        uploadedBlobName = name
        return { upload: async () => undefined }
      },
    }
    Object.defineProperty(store, '_containerClient', { value: containerClient })

    await store.logActivity(Activity.fromObject({
      type: 'message',
      id: 'activity',
      timestamp: new Date('2026-01-01T00:00:00.000Z'),
      channelId: 'channel',
      conversation: { id: 'conv' },
    }), { decodeTranscriptKey: true })

    assert.ok(uploadedBlobName.startsWith('/channel/conv/'))
  })
})
