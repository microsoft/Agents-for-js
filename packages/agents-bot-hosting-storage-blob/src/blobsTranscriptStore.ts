import * as z from 'zod'
import StreamConsumers from 'stream/consumers'
import { Activity } from '@microsoft/agents-activity-schema'

import {
  AnonymousCredential,
  BlobItem,
  ContainerClient,
  ContainerListBlobHierarchySegmentResponse,
  StoragePipelineOptions,
  StorageSharedKeyCredential,
} from '@azure/storage-blob'
import { TranscriptStore, PagedResult, TranscriptInfo } from '@microsoft/agents-bot-hosting'

function formatTicks (timestamp: Date): string {
  const epochTicks = 621355968000000000
  const ticksPerMillisecond = 10000
  const ticks = epochTicks + timestamp.getTime() * ticksPerMillisecond
  return ticks.toString(16)
}

function getChannelPrefix (channelId: string): string {
  return sanitizeBlobKey(`${channelId}/`)
}

function getConversationPrefix (channelId: string, conversationId: string): string {
  return sanitizeBlobKey(`${channelId}/${conversationId}`)
}

function getBlobKey (activity: Activity, options?: BlobsTranscriptStoreOptions): string {
  if (!(activity.timestamp instanceof Date)) {
    throw new Error('Invalid timestamp: must be an instance of Date')
  }

  const { timestamp } = z
    .object({ timestamp: z.instanceof(Date) })
    .passthrough()
    .parse(activity)
  return sanitizeBlobKey(
    [activity.channelId, activity.conversation?.id, `${formatTicks(timestamp)}-${activity.id}.json`].join('/'),
    options
  )
}

export function sanitizeBlobKey (key: string, options?: BlobsTranscriptStoreOptions): string {
  if (!key || key.length === 0) {
    throw new Error('Please provide a non-empty key')
  }

  const sanitized = key.split('/').reduce((acc, part, idx) => {
    return part ? `${acc}/${part}` : acc
  }, '').substr(0, 1024)

  const encodedKey = encodeURIComponent(sanitized).substr(0, 1024)

  if (options?.decodeTranscriptKey) {
    return decodeURIComponent(encodedKey).substr(0, 1024)
  }
  return encodedKey
}

export function maybeCast<T> (value: unknown, ctor?: { new (...args: any[]): T }): T {
  if (ctor != null && value instanceof ctor) {
    return value
  }

  return value as T
}

const MAX_PAGE_SIZE = 20

export interface BlobsTranscriptStoreOptions {
  storagePipelineOptions?: StoragePipelineOptions;
  decodeTranscriptKey?: boolean;
}

export class BlobsTranscriptStore implements TranscriptStore {
  private readonly _containerClient: ContainerClient
  private readonly _concurrency = Infinity
  private _initializePromise?: Promise<unknown>
  private _isDecodeTranscriptKey?: boolean = false

  constructor (
    connectionString: string,
    containerName: string,
    options?: BlobsTranscriptStoreOptions,
    blobServiceUri = '',
    tokenCredential?: StorageSharedKeyCredential | AnonymousCredential
  ) {
    if (blobServiceUri !== '' && tokenCredential !== null) {
      z.object({ blobServiceUri: z.string() }).parse({
        blobServiceUri,
      })

      this._containerClient = new ContainerClient(
        blobServiceUri,
        tokenCredential,
        options?.storagePipelineOptions
      )

      if (blobServiceUri.trim() === 'UseDevelopmentStorage=true;') {
        this._concurrency = 1
      }
    } else {
      z.object({ connectionString: z.string(), containerName: z.string() }).parse({
        connectionString,
        containerName,
      })

      this._containerClient = new ContainerClient(
        connectionString,
        containerName,
        options?.storagePipelineOptions
      )

      if (connectionString.trim() === 'UseDevelopmentStorage=true;') {
        this._concurrency = 1
      }
    }

    this._isDecodeTranscriptKey = options?.decodeTranscriptKey
  }

  private _initialize (): Promise<unknown> {
    if (!this._initializePromise) {
      this._initializePromise = this._containerClient.createIfNotExists()
    }
    return this._initializePromise
  }

  async getTranscriptActivities (
    channelId: string,
    conversationId: string,
    continuationToken?: string,
    startDate?: Date
  ): Promise<PagedResult<Activity>> {
    z.object({ channelId: z.string(), conversationId: z.string() }).parse({ channelId, conversationId })

    await this._initialize()

    const prefix = getConversationPrefix(channelId, conversationId)
    console.log(`Using prefix: ${prefix}`)

    const iter = this._containerClient
      .listBlobsByHierarchy('/', {
        prefix,
      })
      .byPage({ continuationToken, maxPageSize: MAX_PAGE_SIZE })

    let page = await iter.next()
    const result: Activity[] = []
    let response: ContainerListBlobHierarchySegmentResponse | undefined
    while (!page.done) {
      response = maybeCast<ContainerListBlobHierarchySegmentResponse>(page?.value ?? {})
      const blobItems = response?.segment?.blobItems ?? []

      console.log(`Fetched ${blobItems.length} blob items.`)

      const fromIdx =
                startDate != null
                  ? blobItems.findIndex(
                    (blobItem: BlobItem) => blobItem?.properties?.createdOn && blobItem?.properties?.createdOn >= startDate
                  )
                  : 0

      console.log(`fromIdx: ${fromIdx}`)

      if (fromIdx !== -1) {
        const activities = await Promise.all(
          blobItems.slice(fromIdx).map(async (blobItem: BlobItem) => {
            const blob = await this._containerClient.getBlobClient(blobItem.name).download()

            const { readableStreamBody } = blob
            if (!readableStreamBody) {
              return null
            }

            const activity = (await StreamConsumers.json(readableStreamBody)) as any
            return { ...activity, timestamp: new Date(activity.timestamp) } as Activity
          })
        )

        activities.forEach((activity: Activity | null) => {
          if (activity) result.push(activity)
        })
      }

      page = await iter.next()
    }

    console.log(`Total activities fetched: ${result.length}`)

    return {
      continuationToken: response?.continuationToken ?? '',
      items: result.reduce<Activity[]>((acc, activity) => (activity ? acc.concat(activity) : acc), []),
    }
  }

  async listTranscripts (channelId: string, continuationToken?: string): Promise<PagedResult<TranscriptInfo>> {
    z.object({ channelId: z.string() }).parse({ channelId })

    await this._initialize()

    const iter = this._containerClient
      .listBlobsByHierarchy('/', {
        prefix: getChannelPrefix(channelId),
      })
      .byPage({ continuationToken, maxPageSize: MAX_PAGE_SIZE })

    let page = await iter.next()
    const result: any[] = []
    let response: ContainerListBlobHierarchySegmentResponse | undefined

    while (!page.done) {
      const response = maybeCast<ContainerListBlobHierarchySegmentResponse>(page?.value ?? {})
      const blobItems = response?.segment?.blobItems ?? []

      const items = blobItems.map((blobItem) => {
        const [, id] = decodeURIComponent(blobItem.name).split('/')

        const created = blobItem.metadata?.timestamp ? new Date(blobItem.metadata.timestamp) : new Date()

        return { channelId, created, id }
      })

      items.forEach((transcript) => {
        if (transcript) result.push(transcript)
      })

      page = await iter.next()
    }

    return {
      continuationToken: response?.continuationToken ?? '',
      items: result ?? [],
    }
  }

  async deleteTranscript (channelId: string, conversationId: string): Promise<void> {
    z.object({ channelId: z.string(), conversationId: z.string() }).parse({ channelId, conversationId })

    await this._initialize()

    const iter = this._containerClient
      .listBlobsByHierarchy('/', {
        prefix: getConversationPrefix(channelId, conversationId),
      })
      .byPage({
        maxPageSize: MAX_PAGE_SIZE,
      })

    let page = await iter.next()
    while (!page.done) {
      const response = maybeCast<ContainerListBlobHierarchySegmentResponse>(page?.value ?? {})
      const blobItems = response?.segment?.blobItems ?? []

      const deletionPromises = blobItems.map(blobItem =>
        this._containerClient.deleteBlob(blobItem.name)
      )

      await Promise.all(deletionPromises)

      page = await iter.next()
    }
  }

  async logActivity (activity: Activity, options?: BlobsTranscriptStoreOptions): Promise<void> {
    z.object({ activity: z.record(z.unknown()) }).parse({ activity })

    if (!(activity.timestamp instanceof Date)) {
      activity.timestamp = activity.timestamp ? new Date(activity.timestamp) : new Date()
    }

    await this._initialize()

    const blob = this._containerClient.getBlockBlobClient(getBlobKey(activity, options))
    const serialized = JSON.stringify(activity)
    const metadata: Record<string, string> = {
      FromId: activity.from?.id ?? '',
      RecipientId: activity.recipient?.id ?? '',
    }

    if (activity.id) {
      metadata.Id = activity.id
    }
    if (activity.timestamp) {
      metadata.Timestamp = new Date(activity.timestamp).toJSON()
    }

    await blob.upload(serialized, serialized.length, { metadata })
  }
}