/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity, ExceptionHelper } from '@microsoft/agents-activity'
import { debug } from '@microsoft/agents-telemetry'
import { AgentApplication } from '../agentApplication'
import { AgenticAuthorization, AzureBotAuthorization } from './handlers'
import { TurnContext } from '../../turnContext'
import { HandlerStorage } from './handlerStorage'
import { Errors } from '../../errorHelper'
import { ActiveAuthorizationHandler, AuthorizationHandlerStatus, AuthorizationHandler, AuthorizationHandlerSettings, AuthorizationOptions } from './types'
import { Connections } from '../../auth/connections'
import { sendInvokeResponse } from './utils'
import { envParser, envParserUtils } from '../../auth'

const logger = debug('agents:authorization:manager')

const AGENTIC = 'AgenticUserAuthorization'
const AGENTIC_LEGACY = 'agentic'
const AZURE_BOT = 'AzureBotUserAuthorization'

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
   * Environment variable configuration for the latest format.
   */
  private _envLatest = {
    key: {
      prefix: 'AgentApplication__UserAuthorization__Handlers__',
      separator: '__Settings__',
      create (id: string, prop: string) {
        return `${this.prefix}${id}${this.separator}${prop}`
      },
      extract (envKey: string) {
        // Substring: AgentApplication__UserAuthorization__Handlers__<id>__Settings__<prop>
        // position —————————————————————————————————————————> start^   ^end         ^prop
        const start = this.prefix.length
        const end = envKey.toUpperCase().indexOf(this.separator.toUpperCase())
        if (end === -1) {
          return { id: undefined, prop: undefined }
        }

        const id = envKey.substring(start, end)
        const prop = envKey.substring(end + this.separator.length)
        return { id, prop }
      }
    },
    parser: envParser({
      // Common
      type: envParserUtils.bypass,

      // Azure Bot
      azureBotOAuthConnectionName: envParserUtils.bypass,
      title: envParserUtils.bypass,
      text: envParserUtils.bypass,
      invalidSignInRetryMessage: envParserUtils.bypass,
      invalidSignInRetryMessageFormat: envParserUtils.bypass,
      invalidSignInRetryMaxExceededMessage: envParserUtils.bypass,
      oboConnectionName: envParserUtils.bypass,
      enableSso (value) {
        return { value: value !== 'false' }
      },
      invalidSignInRetryMax (value) {
        return { value: parseInt(value) }
      },
      oboScopes (value) {
        return this.scopes(value)
      },

      // Agentic
      altBlueprintConnectionName: envParserUtils.bypass,
      scopes (value) {
        if (value.includes(',')) {
          return { value: value.split(',').map(s => s.trim()).filter(Boolean) }
        }
        return { value: value.split(/\s+/).filter(Boolean) }
      }
    }),
  }

  /**
   * Environment variable configuration for the legacy format.
   */
  private _envLegacy = {
    key: {
      separator: '_',
    },
    parser: envParser({
      // Common
      type: envParserUtils.redirect(this._envLatest.parser, 'type'),

      // Azure Bot
      connectionName: envParserUtils.redirect(this._envLatest.parser, 'azureBotOAuthConnectionName'),
      connectionTitle: envParserUtils.redirect(this._envLatest.parser, 'title'),
      connectionText: envParserUtils.redirect(this._envLatest.parser, 'text'),
      maxAttempts: envParserUtils.redirect(this._envLatest.parser, 'invalidSignInRetryMax'),
      messages_invalidCode: envParserUtils.redirect(this._envLatest.parser, 'invalidSignInRetryMessage'),
      messages_invalidCodeFormat: envParserUtils.redirect(this._envLatest.parser, 'invalidSignInRetryMessageFormat'),
      messages_maxAttemptsExceeded: envParserUtils.redirect(this._envLatest.parser, 'invalidSignInRetryMaxExceededMessage'),
      obo_connection: envParserUtils.redirect(this._envLatest.parser, 'oboConnectionName'),
      obo_scopes: envParserUtils.redirect(this._envLatest.parser, 'oboScopes'),
      enableSso: envParserUtils.redirect(this._envLatest.parser, 'enableSso'),

      // Agentic
      scopes: envParserUtils.redirect(this._envLatest.parser, 'scopes'),
      altBlueprintConnectionName: envParserUtils.redirect(this._envLatest.parser, 'altBlueprintConnectionName')
    })
  }

  /**
   * Creates an instance of the AuthorizationManager.
   * @param app The agent application instance.
   */
  constructor (private app: AgentApplication<any>, private connections: Connections) {
    this.createHandlers()

    if (this.handlers.length === 0 && app.options.authorization !== undefined) {
      throw ExceptionHelper.generateException(Error, Errors.NoAuthHandlersConfigured)
    }

    for (const [id, handler] of Object.entries(this._handlers)) {
      logger.debug('auth handler "%s" type=%s scopes=%o', id, handler.type, handler.scopes)
    }
  }

  /**
   * Gets the registered authorization handlers.
   * @returns A record of authorization handlers by their IDs.
   */
  public get handlers (): AuthorizationHandler[] {
    return Object.values(this._handlers)
  }

  /**
   * Processes an authorization request.
   * @param context The turn context.
   * @param getHandlerIds A function to retrieve the handler IDs for the current activity.
   * @returns The result of the authorization process.
   */
  public async process (context: TurnContext, getHandlerIds: GetHandlerIds): Promise<AuthorizationManagerProcessResult> {
    const activity = context.activity

    if (this.handlers.length === 0) {
      return { authorized: true, context }
    }

    const storage = new HandlerStorage(this.app.options.storage!, context)

    let active = await this.active(storage, getHandlerIds)

    if (!active && activity.name?.startsWith('signin/')) {
      const reason = `Received '${activity.name}' but no active sign-in flow exists for user '${activity.from?.id}'.`
      logger.warn(reason, activity)
      await sendInvokeResponse(context, {
        status: 400,
        body: { failureDetail: reason }
      })
      return { authorized: false, context }
    }

    if (active !== undefined && active?.data.activity.conversation?.id !== activity.conversation?.id) {
      logger.warn('Discarding the active session due to the conversation has changed during an active sign-in process', active?.data.activity)
      await storage.delete()
      return { authorized: true, context }
    }

    const handlers = active?.handlers ?? this.mapHandlers(await getHandlerIds(activity) ?? []) ?? []

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
        throw ExceptionHelper.generateException(Error, Errors.UnexpectedRegistrationStatus, undefined, { status })
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
      throw ExceptionHelper.generateException(Error, Errors.FailedToSignIn, cause as Error)
    }
  }

  /**
   * Maps an array of handler IDs to their corresponding handler instances.
   */
  private mapHandlers (ids: string[]): AuthorizationHandler[] {
    const unknownHandlers: string[] = []
    const handlers = ids.map(id => {
      const handler = this.handlers.find(e => e.id.toLowerCase() === id.toLowerCase())
      if (!handler) {
        unknownHandlers.push(id)
      }
      return handler
    }).filter((handler) => handler !== undefined)

    if (unknownHandlers.length > 0) {
      throw ExceptionHelper.generateException(Error, Errors.AuthHandlersNotFound, undefined, { handlerIds: unknownHandlers.join(', ') })
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
    let legacyMessage = ''
    const settings: AuthorizationHandlerSettings = { storage: this.app.options.storage!, connections: this.connections }
    let runtimeEntries = Object.entries(this.app.options.authorization ?? {})
    const result = { latest: {}, legacy: {} } as {
      latest: Record<string, Record<string, any> | undefined>;
      legacy: Record<string, Record<string, any> | undefined>;
    }

    for (const [envKey, envValue] of Object.entries(process.env)) {
      if (!envValue?.trim()) {
        continue
      }

      const upperEnvKey = envKey.toUpperCase()

      // Legacy: extract handler ID, handler options key and its value, and assign it to the correct runtime handler ID.
      if (!upperEnvKey.startsWith(this._envLatest.key.prefix.toUpperCase())) {
        const [id] = runtimeEntries.find(([id]) => upperEnvKey.startsWith(`${id.toUpperCase()}${this._envLegacy.key.separator}`)) ?? []
        if (!id) {
          continue
        }

        const prop = envKey.substring(id.length + this._envLegacy.key.separator.length)
        if (!prop) {
          continue
        }

        const { key, value } = this._envLegacy.parser.parse(prop as any, envValue)
        if (!key) {
          continue
        }

        legacyMessage += `  ${envKey}= # Use ${this._envLatest.key.create(id, key)} instead.\n`

        result.legacy[id] ??= {}
        result.legacy[id][key] = value
        continue
      }

      // Latest: extract handler ID, handler options key and its value, and assign it to the correct latest handler ID.
      const { id, prop } = this._envLatest.key.extract(envKey)
      if (!id || !prop) {
        continue
      }

      const { key, value } = this._envLatest.parser.parse(prop as any, envValue)
      if (!key) {
        continue
      }

      // Find existing handler ID case-insensitively to avoid duplicates, but keep the original casing for later processing.
      // This allows users to specify environment variables in a case-insensitive way, while ensuring that the handler IDs are treated in a case-sensitive way internally, to avoid issues when referencing them later.
      // For example, if the user specifies AGENTAPPLICATION__USERAUTHORIZATION__HANDLERS__GRAPH__SETTINGS__AZUREBOTOAUTHCONNECTIONNAME and agentapplication__userauthorization__handlers__graph__settings__azurebotoauthconnectionname, we want to treat them as the same handler ID "graph", and not create two separate handlers "GRAPH" and "graph".
      // Note: the first environment variable that is processed will determine the casing of the handler ID, and any subsequent environment variable that matches the same handler ID case-insensitively will be treated as referring to the same handler, regardless of its casing.
      const existingId = id in result.latest ? id : Object.keys(result.latest).find(e => e.toLowerCase() === id.toLowerCase())
      const realId = existingId ?? id
      result.latest[realId] ??= {}
      result.latest[realId][key] = value
    }

    if (legacyMessage.length > 0) {
      logger.warn('Deprecated environment variables detected, update to the latest format: (case-insensitive)', `[\n${legacyMessage}]`)
    }

    // Fix types
    const fixTypes = (entries: [string, any][]) => entries
      .map(([id, options]) => [id, { ...options, type: this.fixType(id, options?.type) }] as [string, AuthorizationOptions[string]])

    runtimeEntries = fixTypes(runtimeEntries)
    const latestEntries = fixTypes(Object.entries(result.latest))
    const legacyEntries = fixTypes(Object.entries(result.legacy))

    const registeredHandlers = new Set()
    for (const [id] of [...runtimeEntries, ...latestEntries]) {
      if (registeredHandlers.has(id.toLowerCase())) {
        continue
      }

      // Find entries case-insensitively for later processing
      const [, runtime] = runtimeEntries.find(([key]) => key.toLowerCase() === id.toLowerCase()) ?? []
      const [, latest] = latestEntries.find(([key]) => key.toLowerCase() === id.toLowerCase()) ?? []
      const [, legacy] = legacyEntries.find(([key]) => key.toLowerCase() === id.toLowerCase()) ?? []

      if (runtime !== undefined && latest !== undefined) {
        logger.warn(this.prefix(id, 'Both runtime and latest environment variable configurations detected. Runtime configuration will take precedence over latest environment variables.'))
      }

      // Normalize runtime legacy options to latest format
      if (runtime?.type === AZURE_BOT) {
        runtime.azureBotOAuthConnectionName ??= runtime.name
        runtime.invalidSignInRetryMax ??= runtime.maxAttempts
        runtime.invalidSignInRetryMessage ??= runtime.messages?.invalidCode
        runtime.invalidSignInRetryMessageFormat ??= runtime.messages?.invalidCodeFormat
        runtime.invalidSignInRetryMaxExceededMessage ??= runtime.messages?.maxAttemptsExceeded
        runtime.oboConnectionName ??= runtime.obo?.connection
        runtime.oboScopes ??= runtime.obo?.scopes
        delete runtime.name
        delete runtime.maxAttempts
        delete runtime.messages
        delete runtime.obo
      }

      // Helper to remove undefined options
      const prune = <T extends Record<string, any>>(obj: T) => {
        const entries = Object.entries(obj).filter(([, e]) => e !== undefined)
        return Object.fromEntries(entries) as T
      }

      // Priority: runtime > latest > legacy
      // Pruning done individually to avoid overwriting with undefined when merging.
      const options: AuthorizationOptions[string] = runtime ? { ...prune(legacy || {}), ...prune(runtime) } : prune(latest || {})

      if (!settings.storage) {
        throw ExceptionHelper.generateException(Error, Errors.StorageRequiredForAuthorization)
      }

      if (options.type === AGENTIC) {
        this._handlers[id] = new AgenticAuthorization(id, options, settings)
      } else if (options.type === AZURE_BOT) {
        // Set default values if not provided
        options.title ||= 'Sign-in'
        options.text ||= 'Please sign-in to continue'
        options.oboScopes ??= []
        options.enableSso = options.enableSso !== false // default value is true if undefined.

        this._handlers[id] = new AzureBotAuthorization(id, options, settings)
      }

      registeredHandlers.add(id.toLowerCase())
    }
  }

  /**
   * Fixes the handler type based on the provided type string, supporting both latest and legacy formats.
   */
  private fixType (handlerId: string, type: AuthorizationOptions[string]['type'] | string) {
    if (!type) {
      return AZURE_BOT
    }

    if (type.toLowerCase() === AGENTIC_LEGACY.toLowerCase()) {
      logger.warn(this.prefix(handlerId, 'The \'agentic\' type is deprecated. Please use \'AgenticUserAuthorization\' instead.'))
      return AGENTIC
    }

    if (type.toLowerCase() === AGENTIC.toLowerCase()) {
      return AGENTIC
    }

    if (type.toLowerCase() === AZURE_BOT.toLowerCase()) {
      return AZURE_BOT
    }

    throw ExceptionHelper.generateException(Error, Errors.UnsupportedAuthHandlerType, undefined, { handlerType: type })
  }
}
