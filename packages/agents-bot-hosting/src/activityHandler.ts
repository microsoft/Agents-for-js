/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { debug } from './logger'
import { TurnContext } from './turnContext'
import { Activity, ActivityTypes, Channels } from '@microsoft/agents-activity-schema'
import { StatusCodes } from './statusCodes'
import { InvokeResponse } from './invoke/invokeResponse'
import { InvokeException } from './invoke/invokeException'
import { AdaptiveCardInvokeValue } from './invoke/adaptiveCardInvokeValue'
import { SearchInvokeValue } from './invoke/searchInvokeValue'
import { SearchInvokeResponse } from './invoke/searchInvokeResponse'
import { AdaptiveCardInvokeResponse } from './invoke/adaptiveCardInvokeResponse'
import { tokenResponseEventName } from './teams/signin/tokenResponseEventName'

/** Symbol key for invoke response */
export const INVOKE_RESPONSE_KEY = Symbol('invokeResponse')

/** Type definition for bot handler function */
export type BotHandler = (context: TurnContext, next: () => Promise<void>) => Promise<any>

const logger = debug('agents:activity-handler')

/** * Handles various activity types and dispatches them to the appropriate handlers. */
export class ActivityHandler {
  protected readonly handlers: { [type: string]: BotHandler[] } = {}

  /** * Registers a handler for the Turn activity type. */
  onTurn (handler: BotHandler): this {
    return this.on('Turn', handler)
  }

  /** * Registers a handler for the MembersAdded activity type. */
  onMembersAdded (handler: BotHandler): this {
    return this.on('MembersAdded', handler)
  }

  /** * Registers a handler for the MembersRemoved activity type. */
  onMembersRemoved (handler: BotHandler): this {
    return this.on('MembersRemoved', handler)
  }

  /** * Registers a handler for the Message activity type. */
  onMessage (handler: BotHandler): this {
    return this.on('Message', handler)
  }

  /** * Registers a handler for the MessageUpdate activity type. */
  onMessageUpdate (handler: BotHandler): this {
    return this.on('MessageUpdate', handler)
  }

  /** * Registers a handler for the MessageDelete activity type. */
  onMessageDelete (handler: BotHandler): this {
    return this.on('MessageDelete', handler)
  }

  /** * Registers a handler for the ConversationUpdate activity type. */
  onConversationUpdate (handler: BotHandler): this {
    return this.on('ConversationUpdate', handler)
  }

  /** * Registers a handler for the MessageReaction activity type. */
  onMessageReaction (handler: BotHandler): this {
    return this.on('MessageReaction', handler)
  }

  /** * Registers a handler for the ReactionsAdded activity type. */
  onReactionsAdded (handler: BotHandler): this {
    return this.on('ReactionsAdded', handler)
  }

  /** * Registers a handler for the ReactionsRemoved activity type. */
  onReactionsRemoved (handler: BotHandler): this {
    return this.on('ReactionsRemoved', handler)
  }

  /** * Registers a handler for the Typing activity type. */
  onTyping (handler: BotHandler): this {
    return this.on('Typing', handler)
  }

  /** * Registers a handler for the InstallationUpdate activity type. */
  onInstallationUpdate (handler: BotHandler): this {
    return this.on('InstallationUpdate', handler)
  }

  /** * Registers a handler for the InstallationUpdateAdd activity type. */
  onInstallationUpdateAdd (handler: BotHandler): this {
    return this.on('InstallationUpdateAdd', handler)
  }

  /** * Registers a handler for the InstallationUpdateRemove activity type. */
  onInstallationUpdateRemove (handler: BotHandler): this {
    return this.on('InstallationUpdateRemove', handler)
  }

  /** * Registers a handler for the EndOfConversation activity type. */
  onEndOfConversation (handler: BotHandler): this {
    return this.on('EndOfConversation', handler)
  }

  /** * Registers a handler for the SignInInvoke activity type. */
  onSignInInvoke (handler: BotHandler): this {
    return this.on('SignInInvoke', handler)
  }

  /** * Registers a handler for unrecognized activity types. */
  onUnrecognizedActivityType (handler: BotHandler): this {
    return this.on('UnrecognizedActivityType', handler)
  }

  /** * Runs the activity handler pipeline. */
  async run (context: TurnContext): Promise<void> {
    if (!context) throw new Error('Missing TurnContext parameter')
    if (!context.activity) throw new Error('TurnContext does not include an activity')
    if (!context.activity.type) throw new Error('Activity is missing its type')

    await this.onTurnActivity(context)
  }

  /** * Handles the Turn activity. */
  protected async onTurnActivity (context: TurnContext): Promise<void> {
    switch (context.activity.type) {
      case ActivityTypes.Message:
        await this.onMessageActivity(context)
        break
      case ActivityTypes.MessageUpdate:
        await this.onMessageUpdateActivity(context)
        break
      case ActivityTypes.MessageDelete:
        await this.onMessageDeleteActivity(context)
        break
      case ActivityTypes.ConversationUpdate:
        await this.onConversationUpdateActivity(context)
        break

      case ActivityTypes.Invoke: {
        const invokeResponse = await this.onInvokeActivity(context)
        if (invokeResponse && !context.turnState.get(INVOKE_RESPONSE_KEY)) {
          const activity = Activity.fromObject({ value: invokeResponse, type: 'invokeResponse' })
          await context.sendActivity(activity)
        }
        break
      }
      case ActivityTypes.MessageReaction:
        await this.onMessageReactionActivity(context)
        break
      case ActivityTypes.Typing:
        await this.onTypingActivity(context)
        break
      case ActivityTypes.InstallationUpdate:
        await this.onInstallationUpdateActivity(context)
        break
      case ActivityTypes.EndOfConversation:
        await this.onEndOfConversationActivity(context)
        break
      default:
        await this.onUnrecognizedActivity(context)
        break
    }
  }

  /** * Handles the Message activity. */
  protected async onMessageActivity (context: TurnContext): Promise<void> {
    await this.handle(context, 'Message', this.defaultNextEvent(context))
  }

  /** * Handles the MessageUpdate activity. */
  protected async onMessageUpdateActivity (context: TurnContext): Promise<void> {
    await this.handle(context, 'MessageUpdate', async () => {
      await this.dispatchMessageUpdateActivity(context)
    })
  }

  /** * Handles the MessageDelete activity. */
  protected async onMessageDeleteActivity (context: TurnContext): Promise<void> {
    await this.handle(context, 'MessageDelete', async () => {
      await this.dispatchMessageDeleteActivity(context)
    })
  }

  /** * Handles the ConversationUpdate activity. */
  protected async onConversationUpdateActivity (context: TurnContext): Promise<void> {
    await this.handle(context, 'ConversationUpdate', async () => {
      await this.dispatchConversationUpdateActivity(context)
    })
  }

  /** * Handles the SignInInvoke activity. */
  protected async onSigninInvokeActivity (context: TurnContext): Promise<void> {
    await this.handle(context, 'SignInInvoke', this.defaultNextEvent(context))
  }

  /** * Handles the Invoke activity. */
  protected async onInvokeActivity (context: TurnContext): Promise<InvokeResponse> {
    try {
      switch (context.activity.name) {
        case 'application/search': {
          const invokeValue = this.getSearchInvokeValue(context.activity)
          const response = await this.onSearchInvoke(context, invokeValue)
          return { status: response.statusCode, body: response }
        }
        case 'adaptiveCard/action': {
          const invokeValue = this.getAdaptiveCardInvokeValue(context.activity)
          const response = await this.onAdaptiveCardInvoke(context, invokeValue)
          return { status: response.statusCode, body: response }
        }
        case 'signin/verifyState':
        case 'signin/tokenExchange':
          await this.onSigninInvokeActivity(context)
          return { status: StatusCodes.OK }
        default:
          throw new InvokeException(StatusCodes.NOT_IMPLEMENTED)
      }
    } catch (err) {
      const error = err as Error
      if (error.message === 'NotImplemented') {
        return { status: StatusCodes.NOT_IMPLEMENTED }
      }
      if (err instanceof InvokeException) {
        return err.createInvokeResponse()
      }
      throw err
    } finally {
      this.defaultNextEvent(context)()
    }
  }

  /** * Handles the AdaptiveCardInvoke activity. */
  protected async onAdaptiveCardInvoke (
    _context: TurnContext,
    _invokeValue: AdaptiveCardInvokeValue
  ): Promise<AdaptiveCardInvokeResponse> {
    return await Promise.reject(new InvokeException(StatusCodes.NOT_IMPLEMENTED))
  }

  /** * Handles the SearchInvoke activity. */
  protected async onSearchInvoke (_context: TurnContext, _invokeValue: SearchInvokeValue): Promise<SearchInvokeResponse> {
    return await Promise.reject(new InvokeException(StatusCodes.NOT_IMPLEMENTED))
  }

  /** * Retrieves the SearchInvoke value from the activity. */
  private getSearchInvokeValue (activity: Activity): SearchInvokeValue {
    const value = activity.value as SearchInvokeValue
    if (!value) {
      const response = this.createAdaptiveCardInvokeErrorResponse(
        StatusCodes.BAD_REQUEST,
        'BadRequest',
        'Missing value property for search'
      )
      throw new InvokeException(StatusCodes.BAD_REQUEST, response)
    }
    if (!value.kind) {
      if (activity.channelId === Channels.Msteams) {
        value.kind = 'search'
      } else {
        const response = this.createAdaptiveCardInvokeErrorResponse(
          StatusCodes.BAD_REQUEST,
          'BadRequest',
          'Missing kind property for search.'
        )
        throw new InvokeException(StatusCodes.BAD_REQUEST, response)
      }
    }
    if (!value.queryText) {
      const response = this.createAdaptiveCardInvokeErrorResponse(
        StatusCodes.BAD_REQUEST,
        'BadRequest',
        'Missing queryText for search.'
      )
      throw new InvokeException(StatusCodes.BAD_REQUEST, response)
    }
    return value
  }

  /** * Retrieves the AdaptiveCardInvoke value from the activity. */
  private getAdaptiveCardInvokeValue (activity: Activity): AdaptiveCardInvokeValue {
    const value = activity.value as AdaptiveCardInvokeValue
    if (!value) {
      const response = this.createAdaptiveCardInvokeErrorResponse(
        StatusCodes.BAD_REQUEST,
        'BadRequest',
        'Missing value property'
      )
      throw new InvokeException(StatusCodes.BAD_REQUEST, response)
    }
    if (value.action.type !== 'Action.Execute') {
      const response = this.createAdaptiveCardInvokeErrorResponse(
        StatusCodes.BAD_REQUEST,
        'NotSupported',
        `The action '${value.action.type}' is not supported.`
      )
      throw new InvokeException(StatusCodes.BAD_REQUEST, response)
    }
    const { action, authentication, state } = value
    const { data, id: actionId, type, verb } = action ?? {}
    const { connectionName, id: authenticationId, token } = authentication ?? {}
    return {
      action: {
        data,
        id: actionId,
        type,
        verb
      },
      authentication: {
        connectionName,
        id: authenticationId,
        token
      },
      state
    }
  }

  /** * Creates an error response for AdaptiveCardInvoke. */
  private createAdaptiveCardInvokeErrorResponse (
    statusCode: StatusCodes,
    code: string,
    message: string
  ): AdaptiveCardInvokeResponse {
    return {
      statusCode,
      type: 'application/vnd.microsoft.error',
      value: { code, message }
    }
  }

  /** * Handles the MessageReaction activity. */
  protected async onMessageReactionActivity (context: TurnContext): Promise<void> {
    await this.handle(context, 'MessageReaction', async () => {
      await this.dispatchMessageReactionActivity(context)
    })
  }

  /** * Handles the EndOfConversation activity. */
  protected async onEndOfConversationActivity (context: TurnContext): Promise<void> {
    await this.handle(context, 'EndOfConversation', this.defaultNextEvent(context))
  }

  /** * Handles the Typing activity. */
  protected async onTypingActivity (context: TurnContext): Promise<void> {
    await this.handle(context, 'Typing', this.defaultNextEvent(context))
  }

  /** * Handles the InstallationUpdate activity. */
  protected async onInstallationUpdateActivity (context: TurnContext): Promise<void> {
    switch (context.activity.action) {
      case 'add':
      case 'add-upgrade':
        await this.handle(context, 'InstallationUpdateAdd', this.defaultNextEvent(context))
        return
      case 'remove':
      case 'remove-upgrade':
        await this.handle(context, 'InstallationUpdateRemove', this.defaultNextEvent(context))
    }
  }

  /** * Handles unrecognized activity types. */
  protected async onUnrecognizedActivity (context: TurnContext): Promise<void> {
    await this.handle(context, 'UnrecognizedActivityType', this.defaultNextEvent(context))
  }

  /** * Dispatches the ConversationUpdate activity. */
  protected async dispatchConversationUpdateActivity (context: TurnContext): Promise<void> {
    if ((context.activity.membersAdded != null) && context.activity.membersAdded.length > 0) {
      await this.handle(context, 'MembersAdded', this.defaultNextEvent(context))
    } else if ((context.activity.membersRemoved != null) && context.activity.membersRemoved.length > 0) {
      await this.handle(context, 'MembersRemoved', this.defaultNextEvent(context))
    } else {
      await this.defaultNextEvent(context)()
    }
  }

  /** * Dispatches the MessageReaction activity. */
  protected async dispatchMessageReactionActivity (context: TurnContext): Promise<void> {
    if ((context.activity.reactionsAdded != null) || (context.activity.reactionsRemoved != null)) {
      if (context.activity.reactionsAdded?.length) {
        await this.handle(context, 'ReactionsAdded', this.defaultNextEvent(context))
      }
      if (context.activity.reactionsRemoved?.length) {
        await this.handle(context, 'ReactionsRemoved', this.defaultNextEvent(context))
      }
    } else {
      await this.defaultNextEvent(context)()
    }
  }

  /** * Dispatches the MessageUpdate activity. */
  protected async dispatchMessageUpdateActivity (context: TurnContext): Promise<void> {
    await this.defaultNextEvent(context)()
  }

  /** * Dispatches the MessageDelete activity. */
  protected async dispatchMessageDeleteActivity (context: TurnContext): Promise<void> {
    await this.defaultNextEvent(context)()
  }

  /**
   * Returns the default next event handler.
   */
  protected defaultNextEvent (context: TurnContext): () => Promise<void> {
    const defaultHandler = async (): Promise<void> => {
      await this.handle(context, 'Default', async () => {
        // noop
      })
    }
    return defaultHandler
  }

  /** * Registers a handler for a specific activity type. */
  protected on (type: string, handler: BotHandler) {
    if (!this.handlers[type]) {
      this.handlers[type] = [handler]
    } else {
      this.handlers[type].push(handler)
    }
    return this
  }

  /** * Executes the handlers for a specific activity type. */
  protected async handle (context: TurnContext, type: string, onNext: () => Promise<void>): Promise<any> {
    let returnValue: any = null
    async function runHandler (index: number): Promise<void> {
      if (index < handlers.length) {
        const val = await handlers[index](context, async () => await runHandler(index + 1))
        if (typeof val !== 'undefined' && returnValue === null) {
          returnValue = val
        }
      } else {
        const val = await onNext()
        if (typeof val !== 'undefined') {
          returnValue = val
        }
      }
    }
    logger.info(`${type} handler called`)
    const handlers = this.handlers[type] || []
    await runHandler(0)
    return returnValue
  }

  /** * Creates an InvokeResponse object. */
  protected static createInvokeResponse (body?: any): InvokeResponse {
    return { status: 200, body }
  }

  /** * Dispatches the Event activity. */
  protected async dispatchEventActivity (context: TurnContext): Promise<void> {
    if (context.activity.name === tokenResponseEventName) {
      await this.handle(context, 'TokenResponseEvent', this.defaultNextEvent(context))
    } else {
      await this.defaultNextEvent(context)()
    }
  }
}
