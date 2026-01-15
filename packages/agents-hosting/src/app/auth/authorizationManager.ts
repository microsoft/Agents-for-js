/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity, debug } from '@microsoft/agents-activity'
import { AgentApplication } from '../agentApplication'
import { AgenticAuthorization, AgenticAuthorizationOptions, AzureBotAuthorization, AzureBotAuthorizationOptions } from './handlers'
import { TurnContext } from '../../turnContext'
import { HandlerStorage } from './handlerStorage'
import { ActiveAuthorizationHandler, AuthorizationHandlerStatus, AuthorizationHandler, AuthorizationHandlerSettings, AuthorizationOptions } from './types'
import { Connections } from '../../auth/connections'
import { env } from '../../auth'

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
export interface AuthorizationManagerProcessResult {
  /**
   * Indicates whether the authorization was successful.
   */
  authorized: boolean;
}

/**
 * Function to retrieve handler IDs for the current activity.
 */
export type GetHandlerIds = (activity: Activity) => string[] | Promise<string[]>

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

  // Definition of environment variable keys and formats
  private _envDefinition = {
    // Helpers for latest environment variable formats
    latest: {
      key: (id:string, prop:string) => `AgentApplication__UserAuthorization__handlers__${id}__settings${prop}`,
      common: (id:string) => `${id}/common`,
      agentic: (id:string) => `${id}/agentic`,
      azurebot: (id:string) => `${id}/azurebot`,
    },
    // Helpers for legacy environment variable formats
    legacy: {
      key: (id:string, prop:string) => `${id}${prop}`,
      common: (id:string) => `${this._envDefinition.latest.common(id)}/legacy`,
      agentic: (id:string) => `${this._envDefinition.latest.agentic(id)}/legacy`,
      azurebot: (id:string) => `${this._envDefinition.latest.azurebot(id)}/legacy`,
    },
    // Generates the full set of environment variable keys for both latest and legacy formats
    format: (id: string) => ({
      // Latest format
      [this._envDefinition.latest.common(id)]: {
        type: this._envDefinition.latest.key(id, '__type'),
      },
      [this._envDefinition.latest.agentic(id)]: {
        altBlueprintConnectionName: this._envDefinition.latest.key(id, '__altBlueprintConnectionName'),
        scopes: this._envDefinition.latest.key(id, '__scopes'),
      },
      [this._envDefinition.latest.azurebot(id)]: {
        azureBotOAuthConnectionName: this._envDefinition.latest.key(id, '__azureBotOAuthConnectionName'),
        title: this._envDefinition.latest.key(id, '__title'),
        text: this._envDefinition.latest.key(id, '__text'),
        invalidSignInRetryMax: this._envDefinition.latest.key(id, '__invalidSignInRetryMax'),
        invalidSignInRetryMessage: this._envDefinition.latest.key(id, '__invalidSignInRetryMessage'),
        invalidSignInRetryMessageFormat: this._envDefinition.latest.key(id, '__invalidSignInRetryMessageFormat'),
        invalidSignInRetryMaxExceededMessage: this._envDefinition.latest.key(id, '__invalidSignInRetryMaxExceededMessage'),
        oboConnectionName: this._envDefinition.latest.key(id, '__oboConnectionName'),
        oboScopes: this._envDefinition.latest.key(id, '__oboScopes'),
        enableSso: this._envDefinition.latest.key(id, '__enableSso'),
      },
      // Legacy format
      [this._envDefinition.legacy.common(id)]: {
        type: this._envDefinition.legacy.key(id, '_type'),
      },
      [this._envDefinition.legacy.agentic(id)]: {
        altBlueprintConnectionName: this._envDefinition.legacy.key(id, '_altBlueprintConnectionName'),
        scopes: this._envDefinition.legacy.key(id, '_scopes'),
      },
      [this._envDefinition.legacy.azurebot(id)]: {
        azureBotOAuthConnectionName: this._envDefinition.legacy.key(id, '_connectionName'),
        title: this._envDefinition.legacy.key(id, '_connectionTitle'),
        text: this._envDefinition.legacy.key(id, '_connectionText'),
        invalidSignInRetryMax: this._envDefinition.legacy.key(id, '_maxAttempts'),
        invalidSignInRetryMessage: this._envDefinition.legacy.key(id, '_messages_invalidCode'),
        invalidSignInRetryMessageFormat: this._envDefinition.legacy.key(id, '_messages_invalidCodeFormat'),
        invalidSignInRetryMaxExceededMessage: this._envDefinition.legacy.key(id, '_messages_maxAttemptsExceeded'),
        oboConnectionName: this._envDefinition.legacy.key(id, '_obo_connection'),
        oboScopes: this._envDefinition.legacy.key(id, '_obo_scopes'),
        enableSso: this._envDefinition.legacy.key(id, '_enableSso'),
      }
    })
  }

  /**
   * Creates an instance of the AuthorizationManager.
   * @param app The agent application instance.
   */
  constructor (private app: AgentApplication<any>, private connections: Connections) {
    if (!app.options.storage) {
      throw new Error('Storage is required for Authorization. Ensure that a storage provider is configured in the AgentApplication options.')
    }

    if (app.options.authorization === undefined || Object.keys(app.options.authorization).length === 0) {
      throw new Error('The AgentApplication.authorization does not have any auth handlers')
    }

    this.createHandlers()
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

    const handlers = active?.handlers ?? this.mapHandlers(await getHandlerIds(context.activity) ?? []) ?? []

    for (const handler of handlers) {
      const status = await this.signin(storage, handler, context, active?.data)
      logger.debug(this.prefix(handler.id, `Sign-in status: ${status}`))

      if (status === AuthorizationHandlerStatus.IGNORED) {
        await storage.delete()
        return { authorized: true }
      }

      if (status === AuthorizationHandlerStatus.PENDING) {
        return { authorized: false }
      }

      if (status === AuthorizationHandlerStatus.REJECTED) {
        await storage.delete()
        return { authorized: false }
      }

      if (status === AuthorizationHandlerStatus.REVALIDATE) {
        await storage.delete()
        return this.process(context, getHandlerIds)
      }

      if (status !== AuthorizationHandlerStatus.APPROVED) {
        throw new Error(this.prefix(handler.id, `Unexpected registration status: ${status}`))
      }

      await storage.delete()

      if (active) {
        // Restore the original activity in the turn context for the next handler to process.
        // This is done like this to avoid losing data that may be set in the turn context.
        (context as any)._activity = Activity.fromObject(active.data.activity)
        active = undefined
      }
    }

    return { authorized: true }
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

  /**
   * Creates authorization handlers based on the application configuration and environment variables.
   */
  private createHandlers () {
    const settings: AuthorizationHandlerSettings = { storage: this.app.options.storage!, connections: this.connections }
    const handlers = Object.entries(this.app.options.authorization!)

    // Maps the each handler ID to its environment variable definitions to get values from .env
    const envMapper = env(Object.assign({}, ...handlers.map(([id]) => this._envDefinition.format(id))))

    for (const [id, options] of handlers) {
      this.logLegacyEnv(id, envMapper)

      const type = this.resolveHandlerType(id, options, envMapper)

      if (type === 'AgenticUserAuthorization') {
        this._handlers[id] = this.createAgenticHandler(id, options, envMapper, settings)
      } else if (type === undefined) {
        this._handlers[id] = this.createAzureBotHandler(id, options, envMapper, settings)
      } else {
        throw new Error(this.prefix(id, `Unsupported authorization handler type: ${type}. Supported types are 'AgenticUserAuthorization' and default (AzureBotAuthorization).`))
      }
    }
  }

  /**
   * Logs a warning if legacy environment variables are detected, showing the recommended format.
   */
  private logLegacyEnv (id: string, envMapper: Record<string, Record<string, string> | undefined>) {
    const legacyKeys = [
      this._envDefinition.legacy.common(id),
      this._envDefinition.legacy.agentic(id),
      this._envDefinition.legacy.azurebot(id)
    ]

    // Gather all legacy properties that are defined in the .env file
    const legacyProperties = Object.entries(envMapper)
      .filter(([key, value]) => legacyKeys.includes(key) && value !== undefined)
      .flatMap(([_, value]) => Object.entries(value!))

    if (legacyProperties.length > 0) {
      const format = legacyProperties
        .map(([prop, value]) => `  ${this._envDefinition.latest.key(id, `__${prop}`)}=${value}`)
        .join('\n')
      logger.warn(this.prefix(id, 'Deprecated environment variables detected, update to the latest format: (case-insensitive)'), `[\n${format}\n]`)
    }
  }

  /**
   * Resolves the handler type from options or environment variables.
   * Returns 'AgenticUserAuthorization', undefined (for AzureBotAuthorization), or the unsupported type string.
   */
  private resolveHandlerType (
    id: string,
    handlerOptions: AuthorizationOptions[string],
    envMapper: Record<string, Record<string, string> | undefined>
  ): AuthorizationOptions[string]['type'] {
    const commonEnv = envMapper[this._envDefinition.latest.common(id)] ?? envMapper[this._envDefinition.legacy.common(id)]
    let type = handlerOptions.type ?? commonEnv?.type as AuthorizationOptions[string]['type']

    if (type === 'agentic') {
      logger.warn(this.prefix(id, 'The \'agentic\' type is deprecated. Please use \'AgenticUserAuthorization\' instead.'))
      type = 'AgenticUserAuthorization'
    }

    return type
  }

  /**
   * Creates an AgenticAuthorization handler with options resolved from constructor and environment.
   */
  private createAgenticHandler (
    id: string,
    handlerOptions: AuthorizationOptions[string],
    envMapper: Record<string, Record<string, string> | undefined>,
    settings: AuthorizationHandlerSettings
  ): AgenticAuthorization {
    const options = { ...handlerOptions } as AgenticAuthorizationOptions
    const handlerEnv = envMapper[this._envDefinition.latest.agentic(id)] ?? envMapper[this._envDefinition.legacy.agentic(id)]

    options.altBlueprintConnectionName ??= handlerEnv?.altBlueprintConnectionName
    options.scopes ??= this.parseScopes(handlerEnv?.scopes)

    return new AgenticAuthorization(id, options, settings)
  }

  /**
   * Creates an AzureBotAuthorization handler with options resolved from constructor and environment.
   */
  private createAzureBotHandler (
    id: string,
    handlerOptions: AuthorizationOptions[string],
    envMapper: Record<string, Record<string, string> | undefined>,
    settings: AuthorizationHandlerSettings
  ): AzureBotAuthorization {
    let options = { ...handlerOptions } as AzureBotAuthorizationOptions
    const env = envMapper[this._envDefinition.latest.azurebot(id)] ?? envMapper[this._envDefinition.legacy.azurebot(id)]

    // Map legacy options to the latest format for validation
    const legacyOptions: AzureBotAuthorizationOptions = {
      azureBotOAuthConnectionName: options.name,
      invalidSignInRetryMax: options.maxAttempts,
      invalidSignInRetryMessage: options.messages?.invalidCode,
      invalidSignInRetryMessageFormat: options.messages?.invalidCodeFormat,
      invalidSignInRetryMaxExceededMessage: options.messages?.maxAttemptsExceeded,
      oboConnectionName: options.obo?.connection,
      oboScopes: options.obo?.scopes,
    }

    // Show warning if any legacy options are used with the following format: { azureBotOAuthConnectionName, title, text, ... }
    const legacyEntries = Object.entries(legacyOptions).filter(([_, e]) => e !== undefined)
    if (legacyEntries.length > 0) {
      const filtered = Object.fromEntries(legacyEntries)
      logger.warn(this.prefix(id, 'Deprecated options detected, update to the latest format:'), filtered)
      options = { ...options, ...filtered }
    }

    // Apply environment variables and defaults
    options.azureBotOAuthConnectionName ??= env?.azureBotOAuthConnectionName
    options.title ??= env?.title || 'Sign-in'
    options.text ??= env?.text || 'Please sign-in to continue'
    options.invalidSignInRetryMax ??= parseInt(env?.invalidSignInRetryMax!)
    options.invalidSignInRetryMessage ??= env?.invalidSignInRetryMessage
    options.invalidSignInRetryMessageFormat ??= env?.invalidSignInRetryMessageFormat
    options.invalidSignInRetryMaxExceededMessage ??= env?.invalidSignInRetryMaxExceededMessage
    options.oboConnectionName ??= env?.oboConnectionName
    options.enableSso ??= env?.enableSso !== 'false' // default value is true
    options.oboScopes ??= this.parseScopes(env?.oboScopes)

    if (!options.azureBotOAuthConnectionName) {
      throw new Error(this.prefix(id, `The 'azureBotOAuthConnectionName' property or '${this._envDefinition.latest.key(id, '__azureBotOAuthConnectionName')}' env variable is required to initialize the handler.`))
    }

    return new AzureBotAuthorization(id, options, settings)
  }

  /**
   * Parses a comma or whitespace separated scopes string into an array of scopes.
   */
  private parseScopes (scopes?: string): string[] {
    return scopes
      ?.split(scopes?.includes(',') ? ',' : /\s+/) // Use comma as delimiter; otherwise use whitespace
      .map(e => e.trim())
      .filter(item => item.length > 0) ?? []
  }
}
