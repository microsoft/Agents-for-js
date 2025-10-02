/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ActiveGuard } from './types'
import { TurnContext } from '../../turnContext'
import { Storage } from '../../storage'

/**
 * Storage manager for guard state.
 */
export class GuardStorage {
  /**
   * Creates an instance of the GuardStorage.
   * @param storage The storage provider.
   * @param context The turn context.
   */
  constructor (private storage: Storage, private context: TurnContext) { }

  /**
   * Gets the unique key for this guard session.
   */
  get key (): string {
    const channelId = this.context.activity.channelId?.trim()
    const userId = this.context.activity.from?.id?.trim()
    if (!channelId || !userId) {
      throw new Error(`Both 'activity.channelId' and 'activity.from.id' are required to generate the ${GuardStorage.name} key.`)
    }
    return `${channelId}/${userId}`
  }

  /**
   * Reads the active guard state from storage.
   */
  async read (): Promise<ActiveGuard | undefined> {
    const ongoing = await this.storage.read([this.key])
    return ongoing?.[this.key]
  }

  /**
   * Writes guard state to storage.
   */
  write (data: ActiveGuard) {
    return this.storage.write({ [this.key]: data })
  }

  /**
   * Deletes guard state from storage.
   */
  delete () {
    return this.storage.delete([this.key])
  }
}
