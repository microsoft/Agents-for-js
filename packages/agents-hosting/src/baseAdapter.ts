/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AuthConfiguration } from './auth/authConfiguration'
import { AuthProvider } from './auth/authProvider'
import { MsalTokenProvider } from './auth/msalTokenProvider'
import { Middleware, MiddlewareHandler, MiddlewareSet } from './middlewareSet'
import { TurnContext } from './turnContext'
import { debug } from './logger'
import { Activity, ConversationReference } from '@microsoft/agents-activity'
import { ResourceResponse } from './connector-client/resourceResponse'
import { AttachmentData } from './connector-client/attachmentData'
import { AttachmentInfo } from './connector-client/attachmentInfo'

const logger = debug('agents:base-adapter')

/**
 * Base class for all adapters, providing middleware and error handling capabilities.
 */
export abstract class BaseAdapter {
  protected middleware: MiddlewareSet = new MiddlewareSet()

  private turnError: (context: TurnContext, error: Error) => Promise<void> = async (context: TurnContext, error: Error) => {
    logger.error(`\n [onTurnError] unhandled error: ${error}`)

    // Send a trace activity, which will be displayed in Bot Framework Emulator
    await context.sendTraceActivity(
      'OnTurnError Trace',
      `${error}`,
      'https://www.botframework.com/schemas/error',
      'TurnError'
    )

    // Send a message to the user
    await context.sendActivity('The agent encountered an error or bug.')
    await context.sendActivity('To continue to run this agent, please fix the source code.')
  }

  readonly AgentIdentityKey = Symbol('AgentIdentity')
  readonly ConnectorClientKey = Symbol('ConnectorClient')
  readonly OAuthScopeKey = Symbol('OAuthScope')

  authProvider: AuthProvider = new MsalTokenProvider()
  authConfig: AuthConfiguration = { issuers: [] }

  /**
   * Sends a set of activities to the conversation.
   * @param context - The TurnContext for the current turn.
   * @param activities - The activities to send.
   * @returns A promise representing the array of ResourceResponses for the sent activities.
   */
  abstract sendActivities (context: TurnContext, activities: Activity[]): Promise<ResourceResponse[]>

  /**
   * Updates an existing activity.
   * @param context - The TurnContext for the current turn.
   * @param activity - The activity to update.
   * @returns A promise representing the ResourceResponse for the updated activity.
   */
  abstract updateActivity (context: TurnContext, activity: Activity): Promise<ResourceResponse | void>

  /**
   * Deletes an existing activity.
   * @param context - The TurnContext for the current turn.
   * @param reference - The conversation reference of the activity to delete.
   * @returns A promise representing the completion of the delete operation.
   */
  abstract deleteActivity (context: TurnContext, reference: Partial<ConversationReference>): Promise<void>

  /**
   * Continues a conversation.
   * @param reference - The conversation reference to continue.
   * @param logic - The logic to execute.
   * @returns A promise representing the completion of the continue operation.
   */
  abstract continueConversation (
    reference: Partial<ConversationReference>,
    logic: (revocableContext: TurnContext) => Promise<void>
  ): Promise<void>

  /**
   * Uploads an attachment.
   * @param conversationId - The conversation ID.
   * @param attachmentData - The attachment data.
   * @returns A promise representing the ResourceResponse for the uploaded attachment.
   */
  abstract uploadAttachment (conversationId: string, attachmentData: AttachmentData): Promise<ResourceResponse>

  /**
   * Gets attachment information.
   * @param attachmentId - The attachment ID.
   * @returns A promise representing the AttachmentInfo for the requested attachment.
   */
  abstract getAttachmentInfo (attachmentId: string): Promise<AttachmentInfo>

  /**
   * Gets an attachment.
   * @param attachmentId - The attachment ID.
   * @param viewId - The view ID.
   * @returns A promise representing the NodeJS.ReadableStream for the requested attachment.
   */
  abstract getAttachment (attachmentId: string, viewId: string): Promise<NodeJS.ReadableStream>

  get onTurnError (): (context: TurnContext, error: Error) => Promise<void> {
    return this.turnError
  }

  set onTurnError (value: (context: TurnContext, error: Error) => Promise<void>) {
    this.turnError = value
  }

  /**
   * Adds middleware to the adapter's middleware pipeline.
   * @param middlewares - The middleware to add.
   * @returns The adapter instance.
   */
  use (...middlewares: Array<MiddlewareHandler | Middleware>): this {
    this.middleware.use(...middlewares)

    return this
  }

  private makeRevocable<T extends Record<string, any>>(
    target: T,
    handler?: ProxyHandler<T>
  ): { proxy: T, revoke: () => void } {
    // Ensure proxy supported (some browsers don't)
    if (typeof Proxy !== 'undefined' && Proxy.revocable) {
      return Proxy.revocable(target, (handler != null) ? handler : {})
    } else {
      return {
        proxy: target,
        revoke: (): void => {
          // noop
        }
      }
    }
  }

  /**
   * Runs the middleware pipeline in sequence.
   * @param context - The TurnContext for the current turn.
   * @param next - The next function to call in the pipeline.
   * @returns A promise representing the completion of the middleware pipeline.
   */
  protected async runMiddleware (
    context: TurnContext,
    next: (revocableContext: TurnContext) => Promise<void>
  ): Promise<void> {
    if (context && context.activity && context.activity.locale) {
      context.locale = context.activity.locale
    }

    const pContext = this.makeRevocable(context)

    try {
      await this.middleware.run(pContext.proxy, async () => await next(pContext.proxy))
    } catch (err) {
      if (this.onTurnError) {
        if (err instanceof Error) {
          await this.onTurnError(pContext.proxy, err)
        } else {
          throw new Error('Unknown error type')
        }
      } else {
        throw err
      }
    } finally {
      pContext.revoke()
    }
  }
}
