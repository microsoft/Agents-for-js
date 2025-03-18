// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Container, CosmosClient } from '@azure/cosmos'
import { CosmosDbKeyEscape } from './cosmosDbKeyEscape'
import { DocumentStoreItem } from './documentStoreItem'
import { CosmosDbPartitionedStorageOptions } from './cosmosDbPartitionedStorageOptions'
import { Storage, StoreItems } from '@microsoft/agents-bot-hosting'
export class DoOnce<T> {
  private task: {
    [key: string]: Promise<T>;
  } = {}

  waitFor (key: string, fn: () => Promise<T>): Promise<T> {
    if (!this.task[key]) {
      this.task[key] = fn()
    }

    return this.task[key]
  }
}

const _doOnce: DoOnce<Container> = new DoOnce<Container>()

const maxDepthAllowed = 127

/**
 * Implements storage using Cosmos DB partitioned storage.
 */
export class CosmosDbPartitionedStorage implements Storage {
  private container!: Container
  private client!: CosmosClient
  private compatibilityModePartitionKey = false;
  [key: string]: any;
  length: number = 0

  /**
   * Initializes a new instance of the CosmosDbPartitionedStorage class.
   * @param cosmosDbStorageOptions The options for configuring Cosmos DB partitioned storage.
   */
  constructor (private readonly cosmosDbStorageOptions: CosmosDbPartitionedStorageOptions) {
    if (!cosmosDbStorageOptions) {
      throw new ReferenceError('CosmosDbPartitionedStorageOptions is required.')
    }
    const { cosmosClientOptions } = cosmosDbStorageOptions
    if (!cosmosClientOptions?.endpoint) {
      throw new ReferenceError('endpoint in cosmosClientOptions is required.')
    }
    if (!cosmosClientOptions?.key && !cosmosClientOptions?.tokenProvider) {
      throw new ReferenceError('key or tokenProvider in cosmosClientOptions is required.')
    }
    if (!cosmosDbStorageOptions.databaseId) {
      throw new ReferenceError('databaseId is for CosmosDB required.')
    }
    if (!cosmosDbStorageOptions.containerId) {
      throw new ReferenceError('containerId for CosmosDB is required.')
    }
    cosmosDbStorageOptions.compatibilityMode ??= true
    if (cosmosDbStorageOptions.keySuffix) {
      if (cosmosDbStorageOptions.compatibilityMode) {
        throw new ReferenceError('compatibilityMode cannot be true while using a keySuffix.')
      }
      const suffixEscaped = CosmosDbKeyEscape.escapeKey(cosmosDbStorageOptions.keySuffix)
      if (cosmosDbStorageOptions.keySuffix !== suffixEscaped) {
        throw new ReferenceError(
          `Cannot use invalid Row Key characters: ${cosmosDbStorageOptions.keySuffix} in keySuffix`
        )
      }
    }
  }

  /**
   * Reads items from storage.
   * @param keys The keys of the items to read.
   * @returns A promise that resolves to the read items.
   */
  async read (keys: string[]): Promise<StoreItems> {
    if (!keys) {
      throw new ReferenceError('Keys are required when reading.')
    } else if (keys.length === 0) {
      return {}
    }

    await this.initialize()

    const storeItems: StoreItems = {}

    await Promise.all(
      keys.map(async (k: string): Promise<void> => {
        try {
          const escapedKey = CosmosDbKeyEscape.escapeKey(
            k,
            this.cosmosDbStorageOptions.keySuffix,
            this.cosmosDbStorageOptions.compatibilityMode
          )

          const readItemResponse = await this.container
            .item(escapedKey, this.getPartitionKey(escapedKey))
            .read<DocumentStoreItem>()
          const documentStoreItem = readItemResponse.resource
          if (documentStoreItem) {
            storeItems[documentStoreItem.realId] = documentStoreItem.document
            storeItems[documentStoreItem.realId].eTag = documentStoreItem._etag
          }
        } catch (err: any) {
          if (err.code === 404) {
            this.throwInformativeError('Not Found',
              err)
          } else if (err.code === 400) {
            this.throwInformativeError(
                            `Error reading from container. You might be attempting to read from a non-partitioned
                    container or a container that does not use '/id' as the partitionKeyPath`,
                            err
            )
          } else {
            this.throwInformativeError('Error reading from container', err)
          }
        }
      })
    )

    return storeItems
  }

  /**
   * Writes items to storage.
   * @param changes The items to write.
   */
  async write (changes: StoreItems): Promise<void> {
    if (!changes) {
      throw new ReferenceError('Changes are required when writing.')
    } else if (changes.length === 0) {
      return
    }

    await this.initialize()

    await Promise.all(
      Object.entries(changes).map(async ([key, { eTag, ...change }]): Promise<void> => {
        const document = new DocumentStoreItem({
          id: CosmosDbKeyEscape.escapeKey(
            key,
            this.cosmosDbStorageOptions.keySuffix,
            this.cosmosDbStorageOptions.compatibilityMode
          ),
          realId: key,
          document: change,
        })

        const accessCondition =
                    eTag !== '*' && eTag != null && eTag.length > 0
                      ? { accessCondition: { type: 'IfMatch', condition: eTag } }
                      : undefined

        try {
          await this.container.items.upsert(document, accessCondition)
        } catch (err: any) {
          this.checkForNestingError(change, err)
          this.throwInformativeError('Error upserting document', err)
        }
      })
    )
  }

  /**
   * Deletes items from storage.
   * @param keys The keys of the items to delete.
   */
  async delete (keys: string[]): Promise<void> {
    await this.initialize()

    await Promise.all(
      keys.map(async (k: string): Promise<void> => {
        const escapedKey = CosmosDbKeyEscape.escapeKey(
          k,
          this.cosmosDbStorageOptions.keySuffix,
          this.cosmosDbStorageOptions.compatibilityMode
        )
        try {
          await this.container.item(escapedKey, this.getPartitionKey(escapedKey)).delete()
        } catch (err: any) {
          if (err.code === 404) {
            this.throwInformativeError('Not Found', err)
          } else {
            this.throwInformativeError('Unable to delete document', err)
          }
        }
      })
    )
  }

  /**
   * Initializes the Cosmos DB container.
   */
  async initialize (): Promise<void> {
    if (!this.container) {
      if (!this.client) {
        this.client = new CosmosClient(this.cosmosDbStorageOptions.cosmosClientOptions!)
      }
      const dbAndContainerKey = `${this.cosmosDbStorageOptions.databaseId}-${this.cosmosDbStorageOptions.containerId}`
      this.container = await _doOnce.waitFor(
        dbAndContainerKey,
        async (): Promise<Container> => await this.getOrCreateContainer()
      )
    }
  }

  private async getOrCreateContainer (): Promise<Container> {
    let createIfNotExists = !this.cosmosDbStorageOptions.compatibilityMode
    let container: Container | undefined

    try {
      const { database } = await this.client.databases.createIfNotExists({
        id: this.cosmosDbStorageOptions.databaseId
      })

      if (this.cosmosDbStorageOptions.compatibilityMode) {
        try {
          container = database.container(this.cosmosDbStorageOptions.containerId)
          // @ts-ignore
          const partitionKeyResponse = await container.readPartitionKeyDefinition()
          if (partitionKeyResponse.resource && partitionKeyResponse.resource.paths) {
            const paths = partitionKeyResponse.resource.paths
            if (paths.includes('/_partitionKey')) {
              this.compatibilityModePartitionKey = true
            } else if (paths.indexOf(DocumentStoreItem.partitionKeyPath) === -1) {
              throw new Error(
                            `Custom Partition Key Paths are not supported. ${this.cosmosDbStorageOptions.containerId} has a custom Partition Key Path of ${paths[0]}.`
              )
            }
          } else {
            this.compatibilityModePartitionKey = true
          }
          return container
        } catch {
          createIfNotExists = true
        }
      }

      if (createIfNotExists) {
        const result = await database.containers.createIfNotExists({
          id: this.cosmosDbStorageOptions.containerId,
          partitionKey: {
            paths: [DocumentStoreItem.partitionKeyPath],
          },
          throughput: this.cosmosDbStorageOptions.containerThroughput,
        })
        return result.container
      }

      if (!container) {
        throw new Error(`Container ${this.cosmosDbStorageOptions.containerId} not found.`)
      }
      return container
    } catch (err: any) {
      this.throwInformativeError(
            `Failed to initialize Cosmos DB database/container: ${this.cosmosDbStorageOptions.databaseId}/${this.cosmosDbStorageOptions.containerId}`,
            err
      )
      throw err
    }
  }

  private getPartitionKey (key: string) {
    return this.compatibilityModePartitionKey ? undefined : key
  }

  private checkForNestingError (json: object, err: Error | Record<'message', string> | string): void {
    const checkDepth = (obj: unknown, depth: number, isInDialogState: boolean): void => {
      if (depth > maxDepthAllowed) {
        let message = `Maximum nesting depth of ${maxDepthAllowed} exceeded.`

        if (isInDialogState) {
          message +=
                        ' This is most likely caused by recursive component dialogs. ' +
                        'Try reworking your dialog code to make sure it does not keep dialogs on the stack ' +
                        "that it's not using. For example, consider using replaceDialog instead of beginDialog."
        } else {
          message += ' Please check your data for signs of unintended recursion.'
        }

        this.throwInformativeError(message, err)
      } else if (obj && typeof obj === 'object') {
        for (const [key, value] of Object.entries(obj)) {
          checkDepth(value, depth + 1, key === 'dialogStack' || isInDialogState)
        }
      }
    }

    checkDepth(json, 0, false)
  }

  private throwInformativeError (prependedMessage: string, err: Error | Record<'message', string> | string): void {
    if (typeof err === 'string') {
      err = new Error(err)
    }

    err.message = `[${prependedMessage}] ${err.message}`

    throw err
  }
}
