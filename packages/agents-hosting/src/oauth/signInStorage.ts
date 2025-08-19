/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { AuthHandler, SignInHandlerState } from './authorization.types'
import { TurnContext } from '../turnContext'
import { Storage } from '../storage'

export class SignInStorage {
  private _baseKey: string = ''
  private _handlerKeys: string[] = []

  /**
   * Creates a new instance of SignInStorage.
   *
   * @param storage - The storage system to use for sign-in state management.
   * @param handlers - Dictionary of configured authentication handlers.
   * @throws {Error} If storage is null/undefined.
   */
  constructor (private storage: Storage, private handlers?: Record<string, AuthHandler>) {
    if (!storage) {
      throw new Error('Storage is required')
    }
  }

  /**
   * Creates a storage key for a specific sign-in handler.
   *
   * @param id - The ID of the sign-in handler.
   * @returns The storage key for the sign-in handler.
   * @throws {Error} If the base key is not set.
   * @remarks
   * This method generates a unique storage key for the specified sign-in handler by appending its ID to the base key.
   */
  private createKey (id: string): string {
    if (!this._baseKey?.trim()) {
      throw new Error('Base key is not set, make sure to call setKey() first.')
    }
    return `${this._baseKey}/${id}`
  }

  /**
   * Sets the base key for sign-in handler storage.
   *
   * @param context - The TurnContext for the current turn.
   * @throws {Error} If 'channelId' or 'from.id' properties are not set in the activity.
   * @remarks
   * This method sets the base key for all sign-in handler states based on the channel and user ID.
   * It is typically called at the beginning of a turn to ensure the correct context is used for storage.
   */
  setKey (context: TurnContext) {
    const channelId = context?.activity.channelId
    const userId = context?.activity.from?.id
    if (!channelId || !userId) {
      throw new Error('Activity \'channelId\' and \'from.id\' properties must be set.')
    }
    this._baseKey = `auth/${channelId}/${userId}`
    this._handlerKeys = Object.keys(this.handlers ?? {}).map(e => this.createKey(e))
  }

  /**
   * Gets the sign-in handler for the current context.
   *
   * @returns An object containing methods to manage sign-in handler states.
   * @remarks
   * This method provides access to the sign-in handler state management functions,
   * allowing retrieval, setting, and deletion of sign-in handler states in storage.
   */
  handler = {
    /**
     * Retrieves the active sign-in handler state.
     *
     * @returns A promise that resolves to the active sign-in handler state, or undefined if not found.
     * @remarks
     * This method reads all sign-in handler states from storage and returns the first one that is not in 'success' status.
     * It is typically used to check if there is an ongoing OAuth flow that needs to be continued.
     */
    active: async (): Promise<SignInHandlerState | undefined> => {
      const data = await this.storage.read(this._handlerKeys) as Record<string, SignInHandlerState>
      return Object.values(data).find(({ status }) => status !== 'success')
    },

    /**
     * Retrieves a sign-in handler state by its ID.
     *
     * @param id - The ID of the sign-in handler to retrieve.
     * @returns A promise that resolves to the sign-in handler state, or undefined if not found.
     * @remarks
     * This method reads the sign-in handler state from storage using the provided ID.
     * It is typically used to load the current state of an ongoing OAuth flow.
     */
    get: async (id: string): Promise<SignInHandlerState | undefined> => {
      const key = this.createKey(id)
      const data = await this.storage.read([key]) as Record<string, SignInHandlerState>
      return data[key]
    },

    /**
     * Sets a sign-in handler state in storage.
     *
     * @param value - The sign-in handler state to set.
     * @returns A promise that resolves when the state is set.
     * @remarks
     * This method writes the provided sign-in handler state to storage.
     * It is typically used to save the current state of an ongoing OAuth flow.
     */
    set: async (value: SignInHandlerState) => {
      return this.storage.write({ [this.createKey(value.id)]: value })
    },

    /**
     * Deletes a sign-in handler state by its ID.
     *
     * @param id - The ID of the sign-in handler to delete.
     * @returns A promise that resolves when the deletion is complete.
     * @remarks
     * This method removes the specified sign-in handler state from storage.
     * It is typically used to clear the state after a successful sign-out or when the flow is no longer needed.
     */
    delete: async (id: string) => {
      return this.storage.delete([this.createKey(id)])
    }
  }
}
