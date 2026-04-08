/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity } from '@microsoft/agents-activity'
import { debug } from '@microsoft/agents-activity/logger'
import { AgentApplication } from '../agentApplication'
import { AgenticAuthorization, AzureBotAuthorization } from './handlers'
import { TurnContext } from '../../turnContext'
import { HandlerStorage } from './handlerStorage'
import { ActiveAuthorizationHandler, AuthorizationHandlerStatus, AuthorizationHandler, AuthorizationHandlerSettings, AuthorizationOptions } from './types'
import { Connections } from '../../auth/connections'

const logger = debug('agents:authorization:manager')

/**
 * Active handler information used by the AuthorizationManager.
 */
interface ManagerActiveHandler {
  data: ActiveAuthorizationHandler;
  handlers: AuthorizationHandler[];
}

/**
 * Result of the authorization manager process.
 */
interface AuthorizationManagerProcessResult {
  /**
   * Indicates whether the authorization was successful.
   */
  authorized: boolean;
  /**
   * The context associated with the authorization process.
   */
  context: TurnContext;
}

/**
 * Function to retrieve handler IDs for the current activity.
 */
type GetHandlerIds = (activity: Activity) => string[] | Promise<string[]>

/**
 * Manages multiple authorization handlers and their interactions.
 * Processes authorization requests and maintains handler states.
 * @remarks
 * This class is responsible for coordinating the authorization process
 * across multiple handlers, ensuring that each handler is invoked in
 * the correct order and with the appropriate context.
 */
export class AuthorizationManager {
  private _handlers: Record<string, AuthorizationHandler> = {}

  /**
   * Creates an instance of the AuthorizationManager.
   * @param app The agent application instance.
   */
  constructor (private app: AgentApplication<any>, connections: Connections) {
    if (!app.options.storage) {
      throw new Error('Storage is required for Authorization. Ensure that a storage provider is configured in the AgentApplication options.')
    }

    if (app.options.authorization === undefined || Object.keys(app.options.authorization).length === 0) {
      throw new Error('The AgentApplication.authorization does not have any auth handlers')
    }

    const settings: AuthorizationHandlerSettings = { storage: app.options.storage, connections }
    for (const [id, handler] of Object.entries(app.options.authorization)) {
      const options = this.loadOptions(id, handler)
      if (options.type === 'agentic') {
        this._handlers[id] = new AgenticAuthorization(id, options, settings)
      } else {
        this._handlers[id] = new AzureBotAuthorization(id, options, settings)
      }
    }

    for (const [id, handler] of Object.entries(this._handlers)) {
      logger.debug('auth handler "%s" type=%s scopes=%o', id, handler.type, handler.scopes)
    }
  }

  /**
   * Loads and validates the authorization handler options.
   */
  private loadOptions (id: string, options: AuthorizationOptions[string]) {
    const result: AuthorizationOptions[string] = {
      ...options,
      type: (options.type ?? process.env[`${id}_type`])?.toLowerCase() as typeof options.type,
    }

    // Validate supported types, agentic, and default (Azure Bot - undefined)
    const supportedTypes = ['agentic', undefined]
    if (!supportedTypes.includes(result.type)) {
      throw new Error(`Unsupported authorization handler type: '${result.type}' for auth handler: '${id}'. Supported types are: '${supportedTypes.filter(Boolean).join('\', \'')}'.`)
    }

    return result
  }

  /**
   * Gets the registered authorization handlers.
   * @returns A record of authorization handlers by their IDs.
   */
  public get handlers (): Record<string, AuthorizationHandler> {
    return this._handlers
  }

  /**
   * Processes an authorization request.
   * @param context The turn context.
   * @param getHandlerIds A function to retrieve the handler IDs for the current activity.
   * @returns The result of the authorization process.
   */
  public async process (context: TurnContext, getHandlerIds: GetHandlerIds): Promise<AuthorizationManagerProcessResult> {
    const storage = new HandlerStorage(this.app.options.storage!, context)

    let active = await this.active(storage, getHandlerIds)

    if (active !== undefined && active?.data.activity.conversation?.id !== context.activity.conversation?.id) {
      logger.warn('Discarding the active session due to the conversation has changed during an active sign-in process', active?.data.activity)
      await storage.delete()
      return { authorized: true, context }
    }

    const handlers = active?.handlers ?? this.mapHandlers(await getHandlerIds(context.activity) ?? []) ?? []

    // Create a shallow copy to modify the activity, since the signin process depends on it and we want to ensure the next handler depends on the initial activity, not the modified one.
    const sharedContext = new TurnContext(context)

    for (const handler of handlers) {
      if (handler.scopes?.length) {
        logger.debug('invoking auth handler "%s" scopes=[%s]', handler.id, handler.scopes.join(','))
      } else {
        logger.debug('invoking auth handler "%s"', handler.id)
      }
      const status = await this.signin(storage, handler, sharedContext, active?.data)
      logger.debug('auth handler "%s" sign-in status=%s', handler.id, status)

      if (status === AuthorizationHandlerStatus.IGNORED) {
        await storage.delete()
        continue
      }

      if (status === AuthorizationHandlerStatus.PENDING) {
        return { authorized: false, context: sharedContext }
      }

      if (status === AuthorizationHandlerStatus.REJECTED) {
        await storage.delete()
        return { authorized: false, context: sharedContext }
      }

      if (status === AuthorizationHandlerStatus.REVALIDATE) {
        await storage.delete()
        return this.process(sharedContext, getHandlerIds)
      }

      if (status !== AuthorizationHandlerStatus.APPROVED) {
        throw new Error(this.prefix(handler.id, `Unexpected registration status: ${status}`))
      }

      await storage.delete()

      if (active) {
        (sharedContext as any)._activity = Activity.fromObject(active.data.activity)
        active = undefined
      }
    }

    return { authorized: true, context: sharedContext }
  }

  /**
   * Gets the active handler session from storage.
   */
  private async active (storage: HandlerStorage, getHandlerIds: GetHandlerIds): Promise<ManagerActiveHandler | undefined> {
    const data = await storage.read()
    if (!data) {
      return
    }

    const handlerIds = await getHandlerIds(Activity.fromObject(data.activity))
    let handlers = this.mapHandlers(handlerIds ?? [])

    // Sort handlers to ensure the active handler is processed first, to ensure continuity.
    handlers = handlers.sort((a, b) => {
      if (a.id === data.id) {
        return -1
      }
      if (b.id === data.id) {
        return 1
      }
      return 0
    }) ?? []
    return { data, handlers }
  }

  /**
   * Attempts to sign in using the specified handler and options.
   */
  private async signin (storage: HandlerStorage, handler: AuthorizationHandler, context: TurnContext, active?: ActiveAuthorizationHandler): Promise<AuthorizationHandlerStatus> {
    try {
      return await handler.signin(context, active)
    } catch (cause) {
      await storage.delete()
      throw new Error(this.prefix(handler.id, 'Failed to sign in'), { cause })
    }
  }

  /**
   * Maps an array of handler IDs to their corresponding handler instances.
   */
  private mapHandlers (ids: string[]): AuthorizationHandler[] {
    let unknownHandlers = ''
    const handlers = ids.map(id => {
      if (!this._handlers[id]) {
        unknownHandlers += ` ${id}`
      }
      return this._handlers[id]
    })
    if (unknownHandlers) {
      throw new Error(`Cannot find auth handlers with ID(s): ${unknownHandlers}`)
    }
    return handlers
  }

  /**
   * Prefixes a message with the handler ID.
   */
  private prefix (id: string, message: string) {
    return `[handler:${id}] ${message}`
  }
}
