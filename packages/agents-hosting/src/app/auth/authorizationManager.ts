/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity, ExceptionHelper } from '@microsoft/agents-activity'
import { debug, redactScopes, redactString } from '@microsoft/agents-telemetry'
import { AgentApplication } from '../agentApplication'
import { AgenticAuthorization, AzureBotAuthorization } from './handlers'
import { TurnContext } from '../../turnContext'
import { HandlerStorage } from './handlerStorage'
import { Errors } from '../../errorHelper'
import { ActiveAuthorizationHandler, AuthorizationHandlerStatus, AuthorizationHandler, AuthorizationHandlerSettings, AuthorizationOptions } from './types'
import { Connections } from '../../auth/connections'
import { sendInvokeResponse } from './utils'
import { prune } from '../../utils'
import { getConfigurationSnapshot } from '../../configuration/configuration'
import { loadModernEnvironmentConfiguration } from '../../configuration/environmentConfiguration'
import { loadBotFrameworkAuthorizationEnvironmentConfiguration } from '../../configuration/botFrameworkEnvironmentCompatibility'

const logger = debug('agents:authorization:manager')

const AGENTIC = 'AgenticUserAuthorization'
const AGENTIC_LEGACY = 'agentic'
const AZURE_BOT = 'AzureBotUserAuthorization'

function redactAuthorizationString (value: unknown): string | undefined {
  return typeof value === 'string' ? redactString(value) : undefined
}

function summarizeAuthorizationConfiguration (options: AuthorizationOptions[string]) {
  return prune({
    type: options.type,
    azureBotOAuthConnectionName: 'azureBotOAuthConnectionName' in options
      ? redactAuthorizationString(options.azureBotOAuthConnectionName)
      : undefined,
    invalidSignInRetryMax: 'invalidSignInRetryMax' in options && typeof options.invalidSignInRetryMax === 'number'
      ? options.invalidSignInRetryMax
      : undefined,
    oboConnectionName: 'oboConnectionName' in options
      ? redactAuthorizationString(options.oboConnectionName)
      : undefined,
    oboScopes: 'oboScopes' in options && Array.isArray(options.oboScopes) &&
      options.oboScopes.every(scope => typeof scope === 'string')
      ? redactScopes(options.oboScopes)
      : undefined,
    enableSso: 'enableSso' in options && typeof options.enableSso === 'boolean'
      ? options.enableSso
      : undefined,
    scopes: 'scopes' in options && Array.isArray(options.scopes) &&
      options.scopes.every(scope => typeof scope === 'string')
      ? redactScopes(options.scopes)
      : undefined,
    altBlueprintConnectionName: 'altBlueprintConnectionName' in options
      ? redactAuthorizationString(options.altBlueprintConnectionName)
      : undefined
  })
}

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
  constructor (private app: AgentApplication<any>, private connections: Connections) {
    this.createHandlers()

    if (this.handlers.length === 0 && app.options.authorization !== undefined) {
      throw ExceptionHelper.generateException(Error, Errors.NoAuthHandlersConfigured)
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
    const runtimeOptionEntries = Object.entries(this.app.options.authorization ?? {})
    const result = {
      latest: {},
      legacy: {}
    } as {
      latest: Record<string, Record<string, any> | undefined>;
      legacy: Record<string, Record<string, any> | undefined>;
    }
    const external = getConfigurationSnapshot(this.app.options.configurationContext)
    const externalOptionEntries = [
      ...[...external.fallback.agentApplication.userAuthorization.handlers.values()].map(handler => [handler.id, handler.settings] as const),
      ...[...external.overrideEnvironment.agentApplication.userAuthorization.handlers.values()].map(handler => [handler.id, handler.settings] as const),
      ...[...external.enforce.agentApplication.userAuthorization.handlers.values()].map(handler => [handler.id, handler.settings] as const)
    ]
    const modernHandlers = loadModernEnvironmentConfiguration()
      .agentApplication.userAuthorization.handlers
    for (const handler of modernHandlers.values()) {
      result.latest[handler.id] = { ...handler.settings }
    }

    const compatibility = loadBotFrameworkAuthorizationEnvironmentConfiguration(
      [...runtimeOptionEntries, ...externalOptionEntries].map(([id]) => id)
    )
    for (const handler of compatibility.layer.agentApplication.userAuthorization.handlers.values()) {
      result.legacy[handler.id] = { ...handler.settings }
    }
    for (const replacement of compatibility.replacements) {
      legacyMessage += `  ${replacement.legacyKey}= # Use ${replacement.modernKey} instead.\n`
    }

    if (legacyMessage.length > 0) {
      logger.warn('Deprecated environment variables detected, update to the latest format: (case-insensitive)', `[\n${legacyMessage}]`)
    }

    const registeredHandlers = new Set()
    const handlerEntries = [
      ...runtimeOptionEntries,
      ...Object.entries(result.latest),
      ...Object.entries(result.legacy),
      ...externalOptionEntries
    ]
    for (const [id] of handlerEntries) {
      if (registeredHandlers.has(id.toLowerCase())) {
        continue
      }

      const { options, format } = this.resolveHandlerConfiguration(
        id,
        runtimeOptionEntries,
        Object.entries(result.latest),
        Object.entries(result.legacy),
        external
      )

      if (options.type === AZURE_BOT) {
        // Set default values if not provided
        options.title ||= 'Sign-in'
        options.text ||= 'Please sign-in to continue'
        options.oboScopes ??= []
        options.enableSso = options.enableSso !== false // default value is true if undefined.
      }

      logger.info(
        this.prefix(id, 'settings loaded from \'%s\''),
        format,
        summarizeAuthorizationConfiguration(options)
      )

      if (!settings.storage) {
        throw ExceptionHelper.generateException(Error, Errors.StorageRequiredForAuthorization)
      }

      if (options.type === AGENTIC) {
        this._handlers[id] = new AgenticAuthorization(id, options, settings)
      } else if (options.type === AZURE_BOT) {
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

  /**
   * Resolves the effective handler configuration for a given handler ID.
   */
  private resolveHandlerConfiguration (
    id: string,
    runtimeEntries: Array<[string, any]>,
    latestEntries: Array<[string, any]>,
    legacyEntries: Array<[string, any]>,
    external: ReturnType<typeof getConfigurationSnapshot>
  ): {
      options: AuthorizationOptions[string];
      format: string;
    } {
    const matchesId = ([_id]: [string, any]) => _id.toLowerCase() === id.toLowerCase()
    const find = (entries: Array<[string, any]>) => entries.find(matchesId)?.[1]
    const findExternal = (
      entries: ReadonlyMap<string, Readonly<{ id: string; settings: Readonly<Record<string, unknown>> }>>
    ) => [...entries.values()].find(handler => handler.id.toLowerCase() === id.toLowerCase())?.settings

    const runtime = find(runtimeEntries)
    const latest = find(latestEntries)
    const legacy = find(legacyEntries)

    if (runtime !== undefined && latest !== undefined) {
      logger.warn(this.prefix(id, 'Both runtime options and latest environment variable configurations detected. Runtime configuration will take precedence over latest environment variables.'))
    }

    const runtimeOptions = runtime === undefined ? undefined : { ...runtime }
    const runtimeLegacyKeys = ['name', 'maxAttempts', 'messages', 'obo']
    const isRuntimeLegacy = runtimeOptions !== undefined && Object.keys(runtimeOptions).some(key => runtimeLegacyKeys.includes(key))

    let runtimeFormat = 'runtime options'
    if (isRuntimeLegacy && this.fixType(id, runtimeOptions.type) === AZURE_BOT) {
      runtimeOptions.azureBotOAuthConnectionName ??= runtimeOptions.name
      runtimeOptions.invalidSignInRetryMax ??= runtimeOptions.maxAttempts
      runtimeOptions.invalidSignInRetryMessage ??= runtimeOptions.messages?.invalidCode
      runtimeOptions.invalidSignInRetryMessageFormat ??= runtimeOptions.messages?.invalidCodeFormat
      runtimeOptions.invalidSignInRetryMaxExceededMessage ??= runtimeOptions.messages?.maxAttemptsExceeded
      runtimeOptions.oboConnectionName ??= runtimeOptions.obo?.connection
      runtimeOptions.oboScopes ??= runtimeOptions.obo?.scopes
      delete runtimeOptions.name
      delete runtimeOptions.maxAttempts
      delete runtimeOptions.messages
      delete runtimeOptions.obo
      runtimeFormat = 'runtime options (legacy)'
    }

    const layers: Array<[string, Record<string, any> | undefined]> = [
      ['external configuration (fallback)', findExternal(external.fallback.agentApplication.userAuthorization.handlers)],
      ['.env variables (legacy)', latest === undefined ? legacy : undefined],
      ['.env variables', runtimeOptions === undefined ? latest : undefined],
      ['external configuration (overrideEnvironment)', findExternal(external.overrideEnvironment.agentApplication.userAuthorization.handlers)],
      [runtimeFormat, runtimeOptions],
      ['external configuration (enforce)', findExternal(external.enforce.agentApplication.userAuthorization.handlers)]
    ]
    const activeLayers = layers.filter((layer): layer is [string, Record<string, any>] => layer[1] !== undefined)
    const options = activeLayers.reduce(
      (resolved, [, layer]) => ({ ...resolved, ...prune(layer) }),
      {} as AuthorizationOptions[string]
    )
    options.type = this.fixType(id, options.type)

    return {
      format: activeLayers.map(([format]) => format).join(' + ') || 'empty options',
      options
    }
  }
}
