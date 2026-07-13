/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AgentHandler, INVOKE_RESPONSE_KEY } from './activityHandler'
import { BaseAdapter } from './baseAdapter'
import { TurnContext } from './turnContext'
import { Request } from './auth/request'
import { WebResponse } from './interfaces/webResponse'
import { ConnectorClient } from './connector-client/connectorClient'
import { AuthConfiguration, getAuthConfigWithDefaults } from './auth/authConfiguration'
import { AuthProvider } from './auth/authProvider'
import { ApxProductionScope } from './auth/authConstants'
import { MsalConnectionManager } from './auth/msal/msalConnectionManager'
import { Activity, ActivityEventNames, ActivityTypes, Channels, ConversationReference, DeliveryModes, ConversationParameters, RoleTypes, ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from './errorHelper'
import { ResourceResponse } from './connector-client/resourceResponse'
import { randomUUID } from 'crypto'
import { debug } from '@microsoft/agents-telemetry'
import { StatusCodes } from './statusCodes'
import { InvokeResponse } from './invoke/invokeResponse'
import { AttachmentData } from './connector-client/attachmentData'
import { AttachmentInfo } from './connector-client/attachmentInfo'
import { normalizeIncomingActivity } from './activityWireCompat'
import { UserTokenClient } from './oauth'
import { HeaderPropagation, HeaderPropagationCollection, HeaderPropagationDefinition } from './headerPropagation'
import { JwtPayload } from 'jsonwebtoken'
import { getTokenServiceEndpoint } from './oauth/customUserTokenAPI'
import { Connections } from './auth/connections'
import { parseBooleanEnv, suggestClosest } from './utils/env'
import { trace } from '@microsoft/agents-telemetry'
import { AdapterTraceDefinitions } from './observability'
import { applyAgenticHeaders } from './getProductInfo'

const logger = debug('agents:cloud-adapter')

/**
 * Adapter for handling agent interactions with various channels through cloud-based services.
 *
 * @remarks
 * CloudAdapter processes incoming HTTP requests from Azure Bot Service channels,
 * authenticates them, and generates outgoing responses. It manages the communication
 * flow between agents and users across different channels, handling activities, attachments,
 * and conversation continuations.
 */
/**
 * Optional configuration for {@link CloudAdapter} runtime behavior.
 *
 * Defaults are conservative and match the .NET SDK's `AdapterOptions` defaults.
 *
 * Each option can also be supplied via an environment variable using the
 * convention `CloudAdapterOptions__<propertyName>` — for example
 * `CloudAdapterOptions__validateServiceUrl=true`. The prefix matches the
 * .NET SDK's `IConfiguration.GetSection("CloudAdapterOptions")` section name,
 * so a shared environment can configure both SDKs from the same variables.
 * Both the `CloudAdapterOptions__` prefix and the property name are matched
 * case-insensitively, so hosts that uppercase env-var names (some PaaS
 * platforms) still work. Values supplied directly to the constructor always
 * win over environment variables.
 */
export interface CloudAdapterOptions {
  /**
   * When `true`, the default `onTurnError` handler includes `error.stack` in
   * its log output. Defaults to `false`.
   *
   * Env var: `CloudAdapterOptions__emitStackTrace`.
   */
  emitStackTrace?: boolean

  /**
   * When `true`, an inbound activity whose `serviceUrl` host does not match
   * the `serviceurl` claim on the caller's identity is rejected with HTTP 400.
   * When `false` (default for backward compatibility), the mismatch is logged
   * as a warning but the activity is still processed.
   *
   * **Recommended for production.** Setting this to `true` (either directly or
   * via `CloudAdapterOptions__validateServiceUrl=true`) defends against
   * confused-deputy / SSRF-style attacks where an attacker with a valid token
   * for one service URL tries to send activities targeting a different one.
   *
   * Env var: `CloudAdapterOptions__validateServiceUrl`.
   */
  validateServiceUrl?: boolean
}

const DEFAULT_CLOUD_ADAPTER_OPTIONS: Required<CloudAdapterOptions> = {
  emitStackTrace: false,
  validateServiceUrl: false
}

/** Env-var prefix for {@link CloudAdapterOptions} (matches .NET config section). */
const CLOUD_ADAPTER_OPTIONS_ENV_PREFIX = 'CloudAdapterOptions__'
const CLOUD_ADAPTER_OPTIONS_ENV_PREFIX_UPPER = CLOUD_ADAPTER_OPTIONS_ENV_PREFIX.toUpperCase()

/**
 * Declarative env-var parser for {@link CloudAdapterOptions}.
 *
 * Shape mirrors `envParser<K>` introduced in PR #1119
 * (`packages/agents-hosting/src/auth/settings.ts`) so this loader can be
 * swapped for the shared utility once that lands. Each entry is a
 * `(rawValue) => parsedValue | undefined` function. Lookups are
 * case-insensitive via the `upperKeys` map, matching the upstream
 * convention and accommodating hosts that uppercase env-var names.
 *
 * Adding a new option to `CloudAdapterOptions` only requires adding an
 * entry here.
 */
const cloudAdapterOptionsParser = (() => {
  const schema: {
    [K in keyof Required<CloudAdapterOptions>]: (raw: string | undefined) => CloudAdapterOptions[K]
  } = {
    emitStackTrace: parseBooleanEnv,
    validateServiceUrl: parseBooleanEnv
  }
  const keys = Object.keys(schema) as Array<keyof CloudAdapterOptions>
  const upperKeys = keys.reduce<Record<string, keyof CloudAdapterOptions>>((acc, key) => {
    acc[key.toUpperCase()] = key
    return acc
  }, {})
  return {
    schema,
    keys,
    /**
     * Resolves an env-var property name (case-insensitive) to its canonical
     * `CloudAdapterOptions` key, or `undefined` when the name is unknown.
     */
    resolveKey (property: string): keyof CloudAdapterOptions | undefined {
      return upperKeys[property.toUpperCase()]
    }
  }
})()

/**
 * Per-process dedup set for configuration warnings. Without this, every
 * `new CloudAdapter()` re-scans `process.env` and re-emits warnings for any
 * typo'd `CloudAdapterOptions__*` key (or unparseable value), which spams
 * stderr in multi-adapter scenarios (tests, proactive flows, DI containers).
 */
const warnedConfigKeys = new Set<string>()

function emitConfigWarning (envKey: string, message: string): void {
  if (warnedConfigKeys.has(envKey)) return
  warnedConfigKeys.add(envKey)
  // Visible by default (writes synchronously to stderr) so users see typos
  // and bad values without having to opt in via `DEBUG=agents:cloud-adapter:*`.
  // Hosts that want to route or suppress can intercept `console.warn` or
  // subscribe to the `agents:cloud-adapter:warn` debug namespace below.
  console.warn(`[agents:cloud-adapter] ${message}`)
  logger.warn(message)
}

/**
 * Scans `process.env` for keys with the `CloudAdapterOptions__` prefix
 * (case-insensitive) and returns the parsed partial options. Unknown keys
 * and values that fail to parse are warned about once per process via
 * `console.warn` (so they are visible by default without enabling debug)
 * and through the `agents:cloud-adapter:warn` debug channel for log
 * aggregators. Hosts that want to route or suppress these diagnostics can
 * intercept `console.warn` or filter the debug namespace.
 */
function loadCloudAdapterOptionsFromEnv (): CloudAdapterOptions {
  const result: CloudAdapterOptions = {}
  for (const [envKey, rawValue] of Object.entries(process.env)) {
    const upper = envKey.toUpperCase()
    if (!upper.startsWith(CLOUD_ADAPTER_OPTIONS_ENV_PREFIX_UPPER)) continue
    const property = envKey.substring(CLOUD_ADAPTER_OPTIONS_ENV_PREFIX.length)
    const canonical = cloudAdapterOptionsParser.resolveKey(property)
    if (!canonical) {
      const suggestion = suggestClosest(property, cloudAdapterOptionsParser.keys as readonly string[], 4)
      const hint = suggestion ? ` Did you mean "${CLOUD_ADAPTER_OPTIONS_ENV_PREFIX}${suggestion}"?` : ''
      emitConfigWarning(envKey, `Unknown CloudAdapterOptions env var: ${envKey} (ignored).${hint}`)
      continue
    }
    const parsed = cloudAdapterOptionsParser.schema[canonical](rawValue) as any
    if (parsed !== undefined) {
      (result as any)[canonical] = parsed
    } else if (rawValue !== undefined && rawValue.trim() !== '') {
      // Known key, recognized but unparseable value (e.g. `yes`, `on`, `enabled`).
      // For a security-relevant flag like `validateServiceUrl`, silent
      // fallthrough is the dangerous failure mode — surface it.
      // Note: parseBooleanEnv treats whitespace-only as unset, so don't warn
      // on `'   '`; only warn when the user actually typed something.
      emitConfigWarning(
        `${envKey}=${rawValue}`,
        `Ignored ${envKey}=${rawValue}; expected one of true/false/1/0.`
      )
    }
  }
  return result
}

/**
 * Resolves a `CloudAdapterOptions` instance from an explicit argument or, if
 * absent, from environment variables. Values supplied in the explicit object
 * win over env vars.
 */
function resolveCloudAdapterOptions (options?: CloudAdapterOptions): Required<CloudAdapterOptions> {
  const fromEnv = loadCloudAdapterOptionsFromEnv()
  return {
    emitStackTrace: options?.emitStackTrace ?? fromEnv.emitStackTrace ?? DEFAULT_CLOUD_ADAPTER_OPTIONS.emitStackTrace,
    validateServiceUrl: options?.validateServiceUrl ?? fromEnv.validateServiceUrl ?? DEFAULT_CLOUD_ADAPTER_OPTIONS.validateServiceUrl
  }
}

/**
 * Removes CR/LF and other control characters from an attacker-controllable
 * string before interpolating it into a log message, to prevent log forging
 * / log injection (OWASP A09). Truncates excessively long values.
 */
function sanitizeForLog (value: string, max = 256): string {
  // Strip C0 (\x00-\x1f) + DEL (\x7f) + C1 (\x80-\x9f) controls plus U+2028
  // LINE SEPARATOR / U+2029 PARAGRAPH SEPARATOR — some log viewers and
  // terminals treat them as line breaks, which would re-open the log-
  // injection vector that the ASCII strip closes.
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\x00-\x1f\x7f-\x9f\u2028\u2029]/g, '?')
  return cleaned.length > max ? cleaned.slice(0, max) + '…' : cleaned
}

/**
 * Truncates a JSON-serialized activity for log lines so a malformed or
 * pathologically large inbound payload can't blow up the log pipeline.
 */
function truncateActivityForLog (activity: unknown, max = 1024): string {
  try {
    const json = JSON.stringify(activity)
    if (!json) return '<unserializable>'
    // Strip C0/DEL/C1 controls + U+2028/U+2029 from the serialized form so
    // attacker-controlled fields (e.g. activity.text) can't forge log lines.
    // eslint-disable-next-line no-control-regex
    const sanitized = json.replace(/[\x00-\x1f\x7f-\x9f\u2028\u2029]/g, '?')
    return sanitized.length > max ? `${sanitized.slice(0, max)}…(truncated)` : sanitized
  } catch {
    return '<unserializable>'
  }
}

export class CloudAdapter extends BaseAdapter {
  protected readonly authConfig: AuthConfiguration
  protected _agentName?: string

  /**
   * Client for connecting to the Azure Bot Service
   */
  connectionManager: Connections

  private readonly _options: Required<CloudAdapterOptions>

  /**
   * Creates an instance of CloudAdapter.
   * @param authConfig - The authentication configuration for securing communications.
   * @param authProvider - No longer used.
   * @param userTokenClient - No longer used.
   * @param options - Optional runtime behavior overrides. See {@link CloudAdapterOptions}.
   */
  constructor (authConfig?: AuthConfiguration, authProvider?: AuthProvider, userTokenClient?: UserTokenClient, options?: CloudAdapterOptions) {
    super()
    this.authConfig = authConfig = getAuthConfigWithDefaults(authConfig)
    this.connectionManager = new MsalConnectionManager(undefined, undefined, authConfig)
    this._options = resolveCloudAdapterOptions(options)

    // Install a CloudAdapter-aware default `onTurnError` that honors
    // `emitStackTrace`. The base class default only logs the message; we
    // preserve that user-facing behavior (trace + messages) but add an
    // optional stack trace for operators when explicitly opted in.
    this.onTurnError = async (context: TurnContext, error: Error) => {
      const detail = this._options.emitStackTrace && error?.stack ? error.stack : `${error}`
      logger.error(`\n [onTurnError] unhandled error: ${detail}`)
      await context.sendTraceActivity(
        'OnTurnError Trace',
        `${error}`,
        'https://www.botframework.com/schemas/error',
        'TurnError'
      )
      await context.sendActivity('The agent encountered an error or bug.')
      await context.sendActivity('To continue to run this agent, please fix the source code.')
    }
  }

  /**
   * Determines whether a connector client is needed based on the delivery mode and service URL of the given activity.
   *
   * @param activity - The activity to evaluate.
   * @returns true if a ConnectorClient is needed, false otherwise.
   *  A connector client is required if the activity's delivery mode is not "ExpectReplies"
   *  and the service URL is not null or empty.
   * @protected
   */
  protected resolveIfConnectorClientIsNeeded (activity: Activity): boolean {
    if (!activity) {
      throw new TypeError('`activity` parameter required')
    }

    switch (activity.deliveryMode) {
      case DeliveryModes.ExpectReplies:
        if (!activity.serviceUrl) {
          logger.debug('DeliveryMode = ExpectReplies, connector client is not needed')
          return false
        }
        break
      default:
        break
    }
    return true
  }

  /**
   * Creates a connector client for a specific service URL and scope.
   *
   * @param serviceUrl - The URL of the service to connect to.
   * @param scope - The authentication scope to use.
   * @param identity - The identity used to select the token provider.
   * @param headers - Optional headers to propagate in the request.
   * @returns A promise that resolves to a ConnectorClient instance.
   * @protected
   */
  protected async createConnectorClient (
    serviceUrl: string,
    scope: string,
    identity: JwtPayload,
    headers?: HeaderPropagationCollection
  ): Promise<ConnectorClient> {
    return trace(AdapterTraceDefinitions.createConnectorClient, async ({ record }) => {
      record({ serviceUrl, scopes: [scope] })

      // get the correct token provider
      const tokenProvider = this.connectionManager.getTokenProvider(identity, serviceUrl)

      const token = await tokenProvider.getAccessToken(scope)
      return ConnectorClient.createClientWithToken(
        serviceUrl,
        token,
        headers
      )
    })
  }

  /**
   * Creates a connector client for a specific identity and activity.
   *
   * @param identity - The identity used to select the token provider.
   * @param activity - The activity used to select the token provider.
   * @param headers - Optional headers to propagate in the request.
   * @returns A promise that resolves to a ConnectorClient instance.
   * @protected
   */
  protected async createConnectorClientWithIdentity (
    identity: JwtPayload,
    activity: Activity,
    headers?: HeaderPropagationCollection) {
    return trace(AdapterTraceDefinitions.createConnectorClient, async ({ record }) => {
      if (!identity?.aud) {
        // anonymous
        logger.warn('Missing identity or identity.aud when creating connector client. Using anonymous identity')
        return ConnectorClient.createClientWithToken(
          activity.serviceUrl!,
          null!,
          headers
        )
      }

      let connectorClient
      const tokenProvider = this.connectionManager.getTokenProviderFromActivity(identity, activity)
      const isAgentic = activity.isAgenticRequest()
      const scopes: string[] = []
      if (isAgentic) {
        logger.debug('Activity is from an agentic source, using special scope', activity.recipient)
        const agenticInstanceId = activity.getAgenticInstanceId()
        const agenticUserId = activity.getAgenticUser()

        if (activity.recipient?.role?.toLowerCase() === RoleTypes.AgenticIdentity.toLowerCase() && agenticInstanceId) {
          // get agentic instance token
          const token = await tokenProvider.getAgenticInstanceToken(activity.getAgenticTenantId() ?? '', agenticInstanceId)
          connectorClient = ConnectorClient.createClientWithToken(
            activity.serviceUrl!,
            token,
            headers
          )
        } else if (activity.recipient?.role?.toLowerCase() === RoleTypes.AgenticUser.toLowerCase() && agenticInstanceId && agenticUserId) {
          const configuredScopes = tokenProvider.connectionSettings?.scopes
          if (configuredScopes?.length) {
            scopes.push(...configuredScopes)
          } else {
            scopes.push(tokenProvider.connectionSettings?.scope ?? ApxProductionScope)
          }
          const token = await tokenProvider.getAgenticUserToken(activity.getAgenticTenantId() ?? '', agenticInstanceId, agenticUserId, scopes)

          connectorClient = ConnectorClient.createClientWithToken(
            activity.serviceUrl!,
            token,
            headers
          )
        } else {
          throw ExceptionHelper.generateException(Error, Errors.CannotCreateConnectorClientForAgenticUser)
        }
      } else {
        // ABS tokens will not have an azp/appid so use the botframework scope.
        // Otherwise use the appId.  This will happen when communicating back to another agent.
        scopes.push(identity.azp ?? identity.appid ?? 'https://api.botframework.com')
        const token = await tokenProvider.getAccessToken(scopes[0])
        connectorClient = ConnectorClient.createClientWithToken(
          activity.serviceUrl!,
          token,
          headers
        )
      }
      record({
        serviceUrl: activity.serviceUrl,
        scopes,
        activityIsAgentic: isAgentic
      })
      return connectorClient
    })
  }

  /**
   * Creates the JwtPayload object with the provided appId.
   * @param appId The bot's appId.
   * @returns The JwtPayload object containing the appId as aud.
   */
  static createIdentity (appId: string) : JwtPayload {
    return {
      aud: appId
    } as JwtPayload
  }

  /**
   * Sets the agent name for M365 agent header propagation.
   * @param agentName The human-friendly agent name to set for header propagation.
   */
  public setAgentName (agentName?: string): void {
    this._agentName = agentName
  }

  /**
   * Sets the connector client on the turn context.
   *
   * @param context - The current turn context.
   * @protected
   */
  protected setConnectorClient (
    context: TurnContext,
    connectorClient?: ConnectorClient
  ) {
    context.turnState.set(this.ConnectorClientKey, connectorClient)
  }

  /**
   * Creates a user token client for a specific service URL and scope.
   *
   * @param identity - The identity used to select the token provider.
   * @param tokenServiceEndpoint - The endpoint to connect to.
   * @param scope - The authentication scope to use.
   * @param audience - No longer used.
   * @param headers - Optional headers to propagate in the request
   * @returns A promise that resolves to a UserTokenClient instance.
   * @protected
   */
  protected async createUserTokenClient (
    identity: JwtPayload,
    tokenServiceEndpoint: string = getTokenServiceEndpoint(),
    scope: string = 'https://api.botframework.com',
    audience: string = 'https://api.botframework.com',
    headers?: HeaderPropagationCollection
  ): Promise<UserTokenClient> {
    return trace(AdapterTraceDefinitions.createUserTokenClient, async ({ record }) => {
      record({ tokenServiceEndpoint, authScope: scope })
      if (!identity?.aud) {
        // anonymous
        return UserTokenClient.createClientWithScope(
          tokenServiceEndpoint,
          null!,
          scope,
          headers
        )
      }

      // get the correct token provider
      const tokenProvider = this.connectionManager.getTokenProvider(identity, tokenServiceEndpoint)

      return UserTokenClient.createClientWithScope(
        tokenServiceEndpoint,
        tokenProvider,
        scope,
        headers
      )
    })
  }

  /**
   * Sets the user token client on the turn context.
   *
   * @param context - The current turn context.
   * @protected
   */
  protected setUserTokenClient (
    context: TurnContext,
    userTokenClient?: UserTokenClient
  ) {
    context.turnState.set(this.UserTokenClientKey, userTokenClient)
  }

  /**
   * @deprecated This function will not be supported in future versions.  Create TurnContext directly.
   * Creates a TurnContext for the given activity and logic.
   * @param activity - The activity to process.
   * @param logic - The logic to execute.
   * @param identity - The identity used for the new context.
   * @returns The created TurnContext.
   */
  createTurnContext (activity: Activity, logic: AgentHandler, identity?: JwtPayload): TurnContext {
    return new TurnContext(this, activity, identity)
  }

  /**
   * Sends multiple activities to the conversation.
   * @param context - The TurnContext for the current turn.
   * @param activities - The activities to send.
   * @returns A promise representing the array of ResourceResponses for the sent activities.
   */
  async sendActivities (context: TurnContext, activities: Activity[]): Promise<ResourceResponse[]> {
    return trace(AdapterTraceDefinitions.sendActivities, async ({ record, actions }) => {
      record({ activityCount: activities?.length })
      if (!context) {
        throw ExceptionHelper.generateException(TypeError, Errors.ContextParameterRequired)
      }

      if (!activities) {
        throw ExceptionHelper.generateException(TypeError, Errors.ActivitiesParameterRequired)
      }

      if (activities.length === 0) {
        throw ExceptionHelper.generateException(Error, Errors.EmptyActivitiesArray)
      }

      const responses: ResourceResponse[] = []
      for (const activity of activities) {
        actions.recordActivity(activity)
        delete activity.id
        let response: ResourceResponse = { id: '' }

        if (activity.type === ActivityTypes.InvokeResponse) {
          context.turnState.set(INVOKE_RESPONSE_KEY, activity)
        } else if (activity.type === ActivityTypes.Trace && activity.channelId !== Channels.Emulator) {
          // no-op
        } else {
          if (!activity.serviceUrl || (activity.conversation == null) || !activity.conversation.id) {
            throw ExceptionHelper.generateException(Error, Errors.InvalidActivityObject)
          }

          if (activity.replyToId) {
            response = await context.turnState.get(this.ConnectorClientKey).replyToActivity(activity.conversation.id, activity.replyToId, activity)
          } else {
            response = await context.turnState.get(this.ConnectorClientKey).sendToConversation(activity.conversation.id, activity)
          }
        }

        if (!response) {
          response = { id: activity.id ?? '' }
        }

        responses.push(response)
      }

      return responses
    })
  }

  /**
   * Processes an incoming request and sends the response.
   * @param request - The incoming request.
   * @param res - The response to send.
   * @param logic - The logic to execute.
   * @param headerPropagation - Optional function to handle header propagation.
   *
   * @remarks This function supports both authenticated and unauthenticated requests. When the request is not authenticated,
   * the adapter will use anonymous identity. For authenticated requests, the adapter relies on the presence of a user identity
   * on `request.user`. It is strongly recommended to use the `authorizeJWT` middleware to ensure that requests are correctly authenticated.
   */
  public async process (
    request: Request,
    res: WebResponse,
    logic: (context: TurnContext) => Promise<void>,
    headerPropagation?: HeaderPropagationDefinition): Promise<void> {
    return trace(AdapterTraceDefinitions.process, async ({ record }) => {
      const headers = new HeaderPropagation(request.headers)
      if (headerPropagation && typeof headerPropagation === 'function') {
        headerPropagation(headers)
        logger.debug('Headers to propagate: ', { keys: Object.keys(headers.outgoing) })
      }

      const end = (status: StatusCodes, body?: unknown, isInvokeResponseOrExpectReplies: boolean = false) => {
        if (res.writableEnded) {
          return
        }

        if (res.headersSent) {
          res.end()
          return
        }
        res.status(status)
        if (isInvokeResponseOrExpectReplies) {
          res.setHeader('content-type', 'application/json')
        }
        if (body) {
          res.send(body)
        }
        res.end()
      }
      if (!request.body) {
        throw ExceptionHelper.generateException(TypeError, Errors.MissingRequestBody)
      }
      const incoming = normalizeIncomingActivity(request.body!)
      const activity = Activity.fromObject(incoming)
      logger.info(`--> Processing incoming activity, type:${activity.type} channel:${activity.channelId}`)

      const isAgentic = activity.isAgenticRequest()

      record({ activity })

      if (!this.isValidChannelActivity(activity)) {
        logger.warn(`BadRequest: invalid activity body: ${truncateActivityForLog(activity)}`)
        return end(StatusCodes.BAD_REQUEST)
      }

      if (!this.validateServiceUrl(request.user, activity)) {
        return end(StatusCodes.BAD_REQUEST)
      }

      logger.debug('Received activity: ', activity)

      if (isAgentic) {
        applyAgenticHeaders(headers, activity, this._agentName)
      }

      const context = new TurnContext(this, activity, request.user!)
      // if Delivery Mode == ExpectReplies, we don't need a connector client.
      if (this.resolveIfConnectorClientIsNeeded(activity)) {
        const connectorClient = await this.createConnectorClientWithIdentity(request.user!, activity, headers)
        this.setConnectorClient(context, connectorClient)
      }

      if (!isAgentic) {
        const userTokenClient = await this.createUserTokenClient(request.user!, undefined, undefined, undefined, headers)
        this.setUserTokenClient(context, userTokenClient)
      }

      if (
        activity?.type === ActivityTypes.InvokeResponse ||
          activity?.type === ActivityTypes.Invoke ||
          activity?.deliveryMode === DeliveryModes.ExpectReplies
      ) {
        await this.runMiddleware(context, logic)
        const invokeResponse = this.processTurnResults(context)
        logger.debug('Activity Response (invoke/expect replies): ', invokeResponse)
        return end(invokeResponse?.status ?? StatusCodes.OK, invokeResponse?.body, true)
      }

      await this.runMiddleware(context, logic)
      const invokeResponse = this.processTurnResults(context)
      return end(invokeResponse?.status ?? StatusCodes.OK, invokeResponse?.body)
    })
  }

  private isValidChannelActivity (activity: Activity): Boolean {
    if (activity == null) {
      logger.warn('BadRequest: Missing activity')
      return false
    }

    if (activity.type == null || activity.type === '') {
      logger.warn('BadRequest: Missing activity type')
      return false
    }

    if (activity.conversation?.id == null || activity.conversation?.id === '') {
      logger.warn('BadRequest: Missing conversation.Id')
      return false
    }

    return true
  }

  /**
   * Compares the host of `activity.serviceUrl` against the `serviceurl` claim
   * on the caller's identity. When enabled and the hosts differ (or either
   * URL is malformed), the request is rejected with HTTP 400; when disabled,
   * the mismatch is logged as a warning.
   *
   * @returns `true` if the activity should continue processing; `false` if it
   * should be rejected with a 400.
   */
  private validateServiceUrl (identity: JwtPayload | undefined, activity: Activity): boolean {
    if (!identity) return true
    if (!activity.serviceUrl) return true

    const claimValue = identity.serviceurl
    if (typeof claimValue !== 'string') return true

    let claimHost: string | undefined
    let activityHost: string | undefined
    try { claimHost = new URL(claimValue).hostname.toLowerCase() } catch { /* invalid */ }
    try { activityHost = new URL(activity.serviceUrl).hostname.toLowerCase() } catch { /* invalid */ }

    if (claimHost && activityHost && claimHost === activityHost) {
      return true
    }

    const safeClaim = sanitizeForLog(claimValue)
    const safeServiceUrl = sanitizeForLog(activity.serviceUrl)
    if (this._options.validateServiceUrl) {
      logger.error(`Invalid service URL Claim='${safeClaim}', ServiceUrl='${safeServiceUrl}'`)
      return false
    }
    logger.warn(`Invalid service URL Claim='${safeClaim}', ServiceUrl='${safeServiceUrl}'`)
    return true
  }

  /**
   * Updates an activity.
   * @param context - The TurnContext for the current turn.
   * @param activity - The activity to update.
   * @returns A promise representing the ResourceResponse for the updated activity.
   */
  async updateActivity (context: TurnContext, activity: Activity): Promise<ResourceResponse | void> {
    return trace(AdapterTraceDefinitions.updateActivity, async ({ record }) => {
      if (!context) {
        throw ExceptionHelper.generateException(TypeError, Errors.ContextParameterRequired)
      }

      if (!activity) {
        throw ExceptionHelper.generateException(TypeError, Errors.ActivityParameterRequired)
      }

      record({ activity })

      if (!activity.serviceUrl || (activity.conversation == null) || !activity.conversation.id || !activity.id) {
        throw ExceptionHelper.generateException(Error, Errors.InvalidActivityObject)
      }

      const response = await context.turnState.get(this.ConnectorClientKey).updateActivity(
        activity.conversation.id,
        activity.id,
        activity
      )

      return response.id ? { id: response.id } : undefined
    })
  }

  /**
   * Deletes an activity.
   * @param context - The TurnContext for the current turn.
   * @param reference - The conversation reference of the activity to delete.
   * @returns A promise representing the completion of the delete operation.
   */
  async deleteActivity (context: TurnContext, reference: Partial<ConversationReference>): Promise<void> {
    return trace(AdapterTraceDefinitions.deleteActivity, async ({ record }) => {
      if (!context) {
        throw new TypeError('`context` parameter required')
      }

      if (!reference || !reference.serviceUrl || (reference.conversation == null) || !reference.conversation.id || !reference.activityId) {
        throw ExceptionHelper.generateException(Error, Errors.InvalidConversationReference)
      }

      record({ reference })

      await context.turnState.get(this.ConnectorClientKey).deleteActivity(reference.conversation.id, reference.activityId)
    })
  }

  /**
   * Continues a conversation.
   * @param botAppIdOrIdentity - The bot identity to use when continuing the conversation. This can be either:
   * a string containing the bot's App ID (botId) or a JwtPayload object containing identity claims (must include aud).
   * @param reference - The conversation reference to continue.
   * @param logic - The logic to execute.
   * @param isResponse - No longer used.
   * @returns A promise representing the completion of the continue operation.
   */
  async continueConversation (
    botAppIdOrIdentity: string | JwtPayload,
    reference: ConversationReference,
    logic: (revocableContext: TurnContext) => Promise<void>,
    isResponse: Boolean = false): Promise<void> {
    return trace(AdapterTraceDefinitions.continueConversation, async ({ record }) => {
      if (!reference || !reference.serviceUrl || (reference.conversation == null) || !reference.conversation.id) {
        throw ExceptionHelper.generateException(Error, Errors.ContinueConversationInvalidReference)
      }

      if (!botAppIdOrIdentity) {
        throw new TypeError('continueConversation: botAppIdOrIdentity is required')
      }
      const botAppId = typeof botAppIdOrIdentity === 'string' ? botAppIdOrIdentity : botAppIdOrIdentity.aud as string

      // Only having the botId will only work against ABS or Agentic.  Proactive to other agents will
      // not work with just botId.  Use a JwtPayload with property aud (which is botId) and appid populated.
      const identity =
          typeof botAppIdOrIdentity !== 'string'
            ? botAppIdOrIdentity
            : CloudAdapter.createIdentity(botAppId)

      const context = new TurnContext(this, Activity.getContinuationActivity(reference), identity)

      const connectorClient = await this.createConnectorClientWithIdentity(identity, context.activity)
      this.setConnectorClient(context, connectorClient)

      const isAgentic = context.activity.isAgenticRequest()

      record({
        botAppId,
        conversationId: reference.conversation?.id,
        isAgentic
      })

      if (!isAgentic) {
        const userTokenClient = await this.createUserTokenClient(identity)
        this.setUserTokenClient(context, userTokenClient)
      }

      await this.runMiddleware(context, logic)
    })
  }

  /**
  * Processes the turn results and returns an InvokeResponse if applicable.
  * @param context - The TurnContext for the current turn.
  * @returns The InvokeResponse if applicable, otherwise undefined.
  */
  protected processTurnResults (context: TurnContext): InvokeResponse | undefined {
    logger.info('<--Sending back turn results')
    // Handle ExpectedReplies scenarios where all activities have been buffered and sent back at once in an invoke response.
    if (context.activity.deliveryMode === DeliveryModes.ExpectReplies) {
      return {
        status: StatusCodes.OK,
        body: {
          activities: context.bufferedReplyActivities
        }
      }
    }

    // Handle Invoke scenarios where the agent will return a specific body and return code.
    if (context.activity.type === ActivityTypes.Invoke) {
      const activityInvokeResponse = context.turnState.get<Activity>(INVOKE_RESPONSE_KEY)
      if (!activityInvokeResponse) {
        return { status: StatusCodes.NOT_IMPLEMENTED }
      }

      return activityInvokeResponse.value as InvokeResponse
    }

    // No body to return.
    return undefined
  }

  /**
   * Creates an activity to represent the result of creating a conversation.
   * @param createdConversationId - The ID of the created conversation.
   * @param channelId - The channel ID.
   * @param serviceUrl - The service URL.
   * @param conversationParameters - The conversation parameters.
   * @returns The created activity.
   */
  protected createCreateActivity (
    createdConversationId: string | undefined,
    channelId: string,
    serviceUrl: string,
    conversationParameters: ConversationParameters
  ): Activity {
    // Create a conversation update activity to represent the result.
    const activity = new Activity(ActivityTypes.Event)

    activity.name = ActivityEventNames.CreateConversation
    activity.channelId = channelId
    activity.serviceUrl = serviceUrl
    activity.id = createdConversationId ?? randomUUID()
    activity.conversation = {
      conversationType: undefined,
      id: createdConversationId!,
      isGroup: conversationParameters.isGroup,
      name: undefined,
      tenantId: conversationParameters.tenantId,
    }
    activity.channelData = conversationParameters.channelData
    activity.recipient = conversationParameters.agent
    // For 1:1 conversations members[0] is the target user; for channel conversations
    // (where members is absent) we fall back to the agent so from.id is always present.
    activity.from = conversationParameters.members?.[0] ?? conversationParameters.agent

    return activity
  }

  /**
   * Creates a conversation.
   * @param agentAppId - The agent application ID.
   * @param channelId - The channel ID.
   * @param serviceUrl - The service URL.
   * @param audience - The audience.
   * @param conversationParameters - The conversation parameters.
   * @param logic - The logic to execute.
   * @returns A promise representing the completion of the create operation.
   */
  async createConversationAsync (
    agentAppId: string,
    channelId: string,
    serviceUrl: string,
    audience: string,
    conversationParameters: ConversationParameters,
    logic: (context: TurnContext) => Promise<void>
  ): Promise<void> {
    if (typeof serviceUrl !== 'string' || !serviceUrl) {
      throw new TypeError('`serviceUrl` must be a non-empty string')
    }
    if (!conversationParameters) throw new TypeError('`conversationParameters` must be defined')
    if (!logic) throw new TypeError('`logic` must be defined')

    const identity = CloudAdapter.createIdentity(audience)
    const restClient = await this.createConnectorClient(serviceUrl, audience, identity)
    const userTokenClient = await this.createUserTokenClient(identity)
    const createConversationResult = await restClient.createConversation(conversationParameters)
    const createActivity = this.createCreateActivity(
      createConversationResult.id,
      channelId,
      serviceUrl,
      conversationParameters
    )
    const context = new TurnContext(this, createActivity, CloudAdapter.createIdentity(agentAppId))
    this.setConnectorClient(context, restClient)
    this.setUserTokenClient(context, userTokenClient)
    await this.runMiddleware(context, logic)
  }

  /**
   * @deprecated This function will not be supported in future versions.  Use TurnContext.turnState.get<ConnectorClient>(CloudAdapter.ConnectorClientKey).
   * Uploads an attachment.
   * @param context - The context for the turn.
   * @param conversationId - The conversation ID.
   * @param attachmentData - The attachment data.
   * @returns A promise representing the ResourceResponse for the uploaded attachment.
   */
  async uploadAttachment (context: TurnContext, conversationId: string, attachmentData: AttachmentData): Promise<ResourceResponse> {
    if (context === undefined) {
      throw ExceptionHelper.generateException(Error, Errors.ContextRequired)
    }

    if (conversationId === undefined) {
      throw ExceptionHelper.generateException(Error, Errors.ConversationIdRequired)
    }

    if (attachmentData === undefined) {
      throw ExceptionHelper.generateException(Error, Errors.AttachmentDataRequired)
    }

    return await context.turnState.get<ConnectorClient>(this.ConnectorClientKey).uploadAttachment(conversationId, attachmentData)
  }

  /**
   * @deprecated This function will not be supported in future versions.  Use TurnContext.turnState.get<ConnectorClient>(CloudAdapter.ConnectorClientKey).
   * Gets attachment information.
   * @param context - The context for the turn.
   * @param attachmentId - The attachment ID.
   * @returns A promise representing the AttachmentInfo for the requested attachment.
   */
  async getAttachmentInfo (context: TurnContext, attachmentId: string): Promise<AttachmentInfo> {
    if (context === undefined) {
      throw ExceptionHelper.generateException(Error, Errors.ContextRequired)
    }

    if (attachmentId === undefined) {
      throw ExceptionHelper.generateException(Error, Errors.AttachmentIdRequired)
    }

    return await context.turnState.get<ConnectorClient>(this.ConnectorClientKey).getAttachmentInfo(attachmentId)
  }

  /**
   * @deprecated This function will not be supported in future versions.  Use TurnContext.turnState.get<ConnectorClient>(CloudAdapter.ConnectorClientKey).
   * Gets an attachment.
   * @param context - The context for the turn.
   * @param attachmentId - The attachment ID.
   * @param viewId - The view ID.
   * @returns A promise representing the NodeJS.ReadableStream for the requested attachment.
   */
  async getAttachment (context: TurnContext, attachmentId: string, viewId: string): Promise<NodeJS.ReadableStream> {
    if (context === undefined) {
      throw ExceptionHelper.generateException(Error, Errors.ContextRequired)
    }

    if (attachmentId === undefined) {
      throw ExceptionHelper.generateException(Error, Errors.AttachmentIdRequired)
    }

    if (viewId === undefined) {
      throw ExceptionHelper.generateException(Error, Errors.ViewIdRequired)
    }

    return await context.turnState.get<ConnectorClient>(this.ConnectorClientKey).getAttachment(attachmentId, viewId)
  }
}
