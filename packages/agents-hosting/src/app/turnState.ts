/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Storage, StoreItems } from '../storage'
import { AppMemory } from './appMemory'
import { InputFile } from './inputFileDownloader'
import { TurnStateEntry } from './turnStateEntry'
import { TurnContext } from '../turnContext'
import { debug } from '../logger'

const logger = debug('agents:turnState')

const CONVERSATION_SCOPE = 'conversation'

const USER_SCOPE = 'user'

const TEMP_SCOPE = 'temp'

const SSO_SCOPE = 'sso'

export interface DefaultConversationState {}

export interface DefaultUserState {}
export interface DefaultTempState {
  input: string;
  inputFiles: InputFile[];
  lastOutput: string;
  actionOutputs: Record<string, string>;
  authTokens: { [key: string]: string };
  duplicateTokenExchange?: boolean;
}

export interface DefaultSSOState {
  flowStarted: boolean;
  userToken: string;
  flowExpires: number;
}

/**
 * Base class defining a collection of turn state scopes.
 * @remarks
 * Developers can create a derived class that extends `TurnState` to add additional state scopes.
 * ```JavaScript
 * class MyTurnState extends TurnState {
 *   protected async onComputeStorageKeys(context) {
 *     const keys = await super.onComputeStorageKeys(context);
 *     keys['myScope'] = `myScopeKey`;
 *     return keys;
 *   }
 *
 *   public get myScope() {
 *     const scope = this.getScope('myScope');
 *     if (!scope) {
 *       throw new Error(`MyTurnState hasn't been loaded. Call load() first.`);
 *     }
 *     return scope.value;
 *   }
 *
 *   public set myScope(value) {
 *     const scope = this.getScope('myScope');
 *     if (!scope) {
 *       throw new Error(`MyTurnState hasn't been loaded. Call load() first.`);
 *     }
 *     scope.replace(value);
 *   }
 * }
 * ```
 */

export class TurnState<
    TConversationState = DefaultConversationState,
    TUserState = DefaultUserState,
    TTempState = DefaultTempState,
    TSSOState = DefaultSSOState
> implements AppMemory {
  private _scopes: Record<string, TurnStateEntry> = {}
  private _isLoaded = false
  private _loadingPromise?: Promise<boolean>
  private _stateNotLoadedString = 'TurnState hasn\'t been loaded. Call load() first.'

  public get conversation (): TConversationState {
    const scope = this.getScope(CONVERSATION_SCOPE)
    if (!scope) {
      throw new Error(this._stateNotLoadedString)
    }
    return scope.value as TConversationState
  }

  public set conversation (value: TConversationState) {
    const scope = this.getScope(CONVERSATION_SCOPE)
    if (!scope) {
      throw new Error(this._stateNotLoadedString)
    }
    scope.replace(value as Record<string, unknown>)
  }

  public get isLoaded (): boolean {
    return this._isLoaded
  }

  public get temp (): TTempState {
    const scope = this.getScope(TEMP_SCOPE)
    if (!scope) {
      throw new Error(this._stateNotLoadedString)
    }
    return scope.value as TTempState
  }

  public set temp (value: TTempState) {
    const scope = this.getScope(TEMP_SCOPE)
    if (!scope) {
      throw new Error(this._stateNotLoadedString)
    }
    scope.replace(value as Record<string, unknown>)
  }

  public get user (): TUserState {
    const scope = this.getScope(USER_SCOPE)
    if (!scope) {
      throw new Error(this._stateNotLoadedString)
    }
    return scope.value as TUserState
  }

  public set user (value: TUserState) {
    const scope = this.getScope(USER_SCOPE)
    if (!scope) {
      throw new Error(this._stateNotLoadedString)
    }
    scope.replace(value as Record<string, unknown>)
  }

  public get sso (): TSSOState {
    const scope = this.getScope(SSO_SCOPE)
    if (!scope) {
      throw new Error(this._stateNotLoadedString)
    }
    return scope.value as TSSOState
  }

  public set sso (value: TSSOState) {
    const scope = this.getScope(SSO_SCOPE)
    if (!scope) {
      throw new Error(this._stateNotLoadedString)
    }
    scope.replace(value as Record<string, unknown>)
  }

  public deleteConversationState (): void {
    const scope = this.getScope(CONVERSATION_SCOPE)
    if (!scope) {
      throw new Error(this._stateNotLoadedString)
    }
    scope.delete()
  }

  public deleteTempState (): void {
    const scope = this.getScope(TEMP_SCOPE)
    if (!scope) {
      throw new Error(this._stateNotLoadedString)
    }
    scope.delete()
  }

  public deleteUserState (): void {
    const scope = this.getScope(USER_SCOPE)
    if (!scope) {
      throw new Error(this._stateNotLoadedString)
    }
    scope.delete()
  }

  public getScope (scope: string): TurnStateEntry | undefined {
    return this._scopes[scope]
  }

  public deleteValue (path: string): void {
    const { scope, name } = this.getScopeAndName(path)
    if (Object.prototype.hasOwnProperty.call(scope.value, name)) {
      delete scope.value[name]
    }
  }

  public hasValue (path: string): boolean {
    const { scope, name } = this.getScopeAndName(path)
    return Object.prototype.hasOwnProperty.call(scope.value, name)
  }

  public getValue<TValue = unknown>(path: string): TValue {
    const { scope, name } = this.getScopeAndName(path)
    return scope.value[name] as TValue
  }

  public setValue (path: string, value: unknown): void {
    const { scope, name } = this.getScopeAndName(path)
    scope.value[name] = value
  }

  public load (context: TurnContext, storage?: Storage, force: boolean = false): Promise<boolean> {
    if (this._isLoaded && !force) {
      return Promise.resolve(false)
    }

    if (!this._loadingPromise) {
      this._loadingPromise = new Promise<boolean>((resolve, reject) => {
        this._isLoaded = true

        const keys: string[] = []
        this.onComputeStorageKeys(context)
          .then(async (scopes) => {
            for (const key in scopes) {
              if (Object.prototype.hasOwnProperty.call(scopes, key)) {
                keys.push(scopes[key])
              }
            }

            const items = storage ? await storage.read(keys) : {}

            for (const key in scopes) {
              if (Object.prototype.hasOwnProperty.call(scopes, key)) {
                const storageKey = scopes[key]
                const value = items[storageKey]
                this._scopes[key] = new TurnStateEntry(value, storageKey)
              }
            }

            this._scopes[TEMP_SCOPE] = new TurnStateEntry({})
            this._isLoaded = true
            this._loadingPromise = undefined
            resolve(true)
          })
          .catch((err) => {
            logger.error(err)
            this._loadingPromise = undefined
            reject(err)
          })
      })
    }

    return this._loadingPromise
  }

  public async save (context: TurnContext, storage?: Storage): Promise<void> {
    if (!this._isLoaded && this._loadingPromise) {
      await this._loadingPromise
    }

    if (!this._isLoaded) {
      throw new Error(this._stateNotLoadedString)
    }

    let changes: StoreItems | undefined
    let deletions: string[] | undefined
    for (const key in this._scopes) {
      if (!Object.prototype.hasOwnProperty.call(this._scopes, key)) {
        continue
      }
      const entry = this._scopes[key]
      if (entry.storageKey) {
        if (entry.isDeleted) {
          if (deletions) {
            deletions.push(entry.storageKey)
          } else {
            deletions = [entry.storageKey]
          }
        } else if (entry.hasChanged) {
          if (!changes) {
            changes = {}
          }

          changes[entry.storageKey] = entry.value
        }
      }
    }

    if (storage) {
      const promises: Promise<void>[] = []
      if (changes) {
        promises.push(storage.write(changes))
      }

      if (deletions) {
        promises.push(storage.delete(deletions))
      }

      if (promises.length > 0) {
        await Promise.all(promises)
      }
    }
  }

  protected onComputeStorageKeys (context: TurnContext): Promise<Record<string, string>> {
    const activity = context.activity
    const channelId = activity?.channelId
    const agentId = activity?.recipient?.id
    const conversationId = activity?.conversation?.id
    const userId = activity?.from?.id

    if (!channelId) {
      throw new Error('missing context.activity.channelId')
    }

    if (!agentId) {
      throw new Error('missing context.activity.recipient.id')
    }

    if (!conversationId) {
      throw new Error('missing context.activity.conversation.id')
    }

    if (!userId) {
      throw new Error('missing context.activity.from.id')
    }

    const keys: Record<string, string> = {}
    keys[CONVERSATION_SCOPE] = `${channelId}/${agentId}/conversations/${conversationId}`
    keys[USER_SCOPE] = `${channelId}/${agentId}/users/${userId}`
    keys[SSO_SCOPE] = `${channelId}/${agentId}/sso`
    return Promise.resolve(keys)
  }

  private getScopeAndName (path: string): { scope: TurnStateEntry; name: string } {
    const parts = path.split('.')
    if (parts.length > 2) {
      throw new Error(`Invalid state path: ${path}`)
    } else if (parts.length === 1) {
      parts.unshift(TEMP_SCOPE)
    }

    const scope = this.getScope(parts[0])
    if (scope === undefined) {
      throw new Error(`Invalid state scope: ${parts[0]}`)
    }
    return { scope, name: parts[1] }
  }
}
