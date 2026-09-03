/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ActiveAuthorizationHandler } from './types'
import { TurnContext } from '../../turnContext'
import { StorageProvider, StorageV2 } from '../../storage'
import {
  asStorageV2,
  assertStorageDeleteSucceeded,
  assertStorageWriteSucceeded,
  getStorageReadValue,
} from '../../storage/storageCompatibility'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../../errorHelper'

// Version metadata only bridges reads and writes in one turn. Cloned contexts share turnState.
const HANDLER_STORAGE_VERSIONS = Symbol('handlerStorageVersions')

/**
 * Storage manager for handler state.
 */
export class HandlerStorage<TActiveHandler extends ActiveAuthorizationHandler = ActiveAuthorizationHandler> {
  /**
   * Creates an instance of the HandlerStorage.
   * @param storage The storage provider.
   * @param context The turn context.
   */
  private readonly storage: StorageV2

  constructor (storage: StorageProvider, private context: TurnContext) {
    this.storage = asStorageV2(storage)
  }

  /**
   * Gets the unique key for a handler session.
   */
  public get key (): string {
    const channelId = this.context.activity.channelId?.trim()
    const userId = this.context.activity.from?.id?.trim()
    if (!channelId || !userId) {
      throw ExceptionHelper.generateException(Error, Errors.ChannelIdAndFromIdRequired)
    }
    return `auth/${channelId}/${userId}`
  }

  /**
   * Reads the active handler state from storage.
   */
  public async read (): Promise<TActiveHandler | undefined> {
    const ongoing = await this.storage.read<TActiveHandler>([this.key])
    const value = getStorageReadValue(ongoing, this.key)
    this.version = ongoing[this.key]?.version
    return value
  }

  /**
   * Writes handler state to storage.
   */
  public async write (data: TActiveHandler) : Promise<void> {
    const { eTag: _eTag, ...value } = data
    const results = await this.storage.write(
      { [this.key]: value },
      this.version === undefined ? undefined : { expectedVersion: this.version }
    )
    assertStorageWriteSucceeded(results, [this.key])
    this.version = results[this.key]?.version
  }

  /**
   * Deletes handler state from storage.
   */
  public async delete (): Promise<void> {
    try {
      const results = await this.storage.delete([this.key])
      assertStorageDeleteSucceeded(results, [this.key])
      this.version = undefined
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 404) {
        return
      }
      throw error
    }
  }

  private get version (): string | undefined {
    return this.context.turnState.get<Map<string, string>>(HANDLER_STORAGE_VERSIONS)?.get(this.key)
  }

  private set version (value: string | undefined) {
    let versions = this.context.turnState.get<Map<string, string>>(HANDLER_STORAGE_VERSIONS)
    if (value === undefined) {
      versions?.delete(this.key)
      if (versions?.size === 0) {
        this.context.turnState.delete(HANDLER_STORAGE_VERSIONS)
      }
      return
    }

    if (!versions) {
      versions = new Map<string, string>()
      this.context.turnState.set(HANDLER_STORAGE_VERSIONS, versions)
    }
    versions.set(this.key, value)
  }
}
