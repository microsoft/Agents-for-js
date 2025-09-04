import * as z from 'zod'
import StreamConsumers from 'stream/consumers'
import { Activity } from '@microsoft/agents-activity'
import { TokenCredential } from '@azure/core-auth'
import {
  AnonymousCredential,
  BlobItem,
  ContainerClient,
  ContainerListBlobHierarchySegmentResponse,
  StoragePipelineOptions,
  StorageSharedKeyCredential,
} from '@azure/storage-blob'
import { TranscriptStore, PagedResult, TranscriptInfo } from '@microsoft/agents-hosting'

/**
 * Formats a Date object into a hexadecimal string representing ticks.
 * @param timestamp - The Date object to format.
 * @returns A string representing the formatted ticks.
 */
function formatTicks (timestamp: Date): string {
  const epochTicks = 621355968000000000
  const ticksPerMillisecond = 10000
  const ticks = epochTicks + timestamp.getTime() * ticksPerMillisecond
  return ticks.toString(16)
}

/**
 * Generates a sanitized prefix for a channel.
 * @param channelId - The ID of the channel.
 * @returns A sanitized string prefix for the channel.
 */
function getChannelPrefix (channelId: string): string {
  return sanitizeBlobKey(`${channelId}/`)
}

/**
 * Generates a sanitized prefix for a conversation within a channel.
 * @param channelId - The ID of the channel.
 * @param conversationId - The ID of the conversation.
 * @returns A sanitized string prefix for the conversation.
 */
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

/**
 * Sanitizes a blob key for use with Azure Blob Storage.
 *
 * @param key - The blob key string to sanitize. Must be non-empty.
 * @param options - Optional configuration options.
 * @param options.decodeTranscriptKey - If true, returns the URL-decoded version of the sanitized key.
 * @returns A sanitized blob key that is safe for use with Azure Blob Storage, truncated to 1024 characters.
 * @throws {Error} When the provided key is null, undefined, or an empty string.
 *
 * @remarks
 * This function performs the following operations:
 * 1. Validates that the key is not empty
 * 2. Removes empty path segments by splitting on '/' and filtering out empty parts
 * 3. Truncates the sanitized key to 1024 characters maximum
 * 4. URL encodes the key to ensure it's safe for use as a blob name
 * 5. Optionally decodes the key if the decodeTranscriptKey option is set
 *
 * @example
 * ```typescript
 * // Basic sanitization with encoding
 * const sanitized = sanitizeBlobKey('channel1/conversation2/activity.json');
 * // Returns: 'channel1%2Fconversation2%2Factivity.json'
 *
 * // Sanitization with decoding option
 * const decoded = sanitizeBlobKey('channel1/conversation2/activity.json', { decodeTranscriptKey: true });
 * // Returns: 'channel1/conversation2/activity.json'
 *
 * // Handles empty path segments
 * const withEmptySegments = sanitizeBlobKey('channel1//conversation2///activity.json');
 * // Returns: 'channel1%2Fconversation2%2Factivity.json'
 * ```
 *
 */
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

/**
 * Performs type casting with optional constructor validation.
 *
 * @typeParam T - The target type to cast to.
 * @param value - The value to cast.
 * @param ctor - Optional constructor function to validate the value against.
 * @returns The value cast to type T.
 *
 * @remarks
 * If a constructor is provided, validates that the value is an instance of that constructor.
 * Otherwise, performs a direct type assertion.
 *
 * @example
 * ```typescript
 * // With constructor validation
 * const dateValue = maybeCast(someValue, Date);
 *
 * // Direct type assertion
 * const stringValue = maybeCast<string>(someValue);
 * ```
 */
function maybeCast<T> (value: unknown, ctor?: { new (...args: any[]): T }): T {
  if (ctor != null && value instanceof ctor) {
    return value
  }

  return value as T
}

const MAX_PAGE_SIZE = 20

/**
 * Options for configuring the BlobsTranscriptStore.
 */
export interface BlobsTranscriptStoreOptions {
  /**
   * Optional pipeline options for configuring the Azure Blob Storage client.
   */
  storagePipelineOptions?: StoragePipelineOptions;

  /**
   * Indicates whether to decode the transcript key when retrieving transcripts.
   */
  decodeTranscriptKey?: boolean;
}

/**
 * A class that implements the TranscriptStore interface using Azure Blob Storage.
 */
export class BlobsTranscriptStore implements TranscriptStore {
  private readonly _containerClient: ContainerClient
  private readonly _concurrency = Infinity
  private _initializePromise?: Promise<unknown>
  private _isDecodeTranscriptKey?: boolean = false

  /**
   * Constructs a new instance of the BlobsTranscriptStore class.
   *
   * @param connectionString - The connection string for the Azure Blob Storage account.
   * @param containerName - The name of the container to use for storing transcripts.
   * @param options - Optional configuration options for the store.
   * @param blobServiceUri - Optional URI for the blob service.
   * @param tokenCredential - Optional credentials for authenticating with the blob service.
   */
  constructor (
    connectionString: string,
    containerName: string,
    options?: BlobsTranscriptStoreOptions,
    blobServiceUri = '',
    tokenCredential?: StorageSharedKeyCredential | AnonymousCredential | TokenCredential
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

  /**
   * Retrieves transcript activities for a specific conversation.
   *
   * @param channelId - The ID of the channel.
   * @param conversationId - The ID of the conversation.
   * @param continuationToken - Optional token for paginated results.
   * @param startDate - Optional start date to filter activities.
   * @returns A promise resolving to a paged result of activities.
   */
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
            return Activity.fromObject({ ...activity, timestamp: new Date(activity.timestamp) })
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

  /**
   * Lists all transcripts for a specific channel.
   *
   * @param channelId - The ID of the channel.
   * @param continuationToken - Optional token for paginated results.
   * @returns A promise resolving to a paged result of transcript information.
   */
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

  /**
   * Deletes all transcripts for a specific conversation.
   *
   * @param channelId - The ID of the channel.
   * @param conversationId - The ID of the conversation.
   * @returns A promise that resolves when the deletion is complete.
   */
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

  /**
   * Logs an activity to the transcript store.
   *
   * @param activity - The activity to log.
   * @param options - Optional configuration options for the operation.
   * @returns A promise that resolves when the activity is logged.
   */
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
