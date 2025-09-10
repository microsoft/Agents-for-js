/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AuthConfiguration } from './auth/authConfiguration'
import { AuthProvider } from './auth/authProvider'
import { MsalTokenProvider } from './auth/msalTokenProvider'
import { Middleware, MiddlewareHandler, MiddlewareSet } from './middlewareSet'
import { TurnContext } from './turnContext'
import { debug } from '@microsoft/agents-activity/logger'
import { Activity, ConversationReference } from '@microsoft/agents-activity'
import { ResourceResponse } from './connector-client/resourceResponse'
import { AttachmentData } from './connector-client/attachmentData'
import { AttachmentInfo } from './connector-client/attachmentInfo'
import { UserTokenClient } from './oauth'

const logger = debug('agents:base-adapter')

/**
 * Abstract base class for all adapters in the Agents framework.
 *
 * @remarks
 * This class provides core functionality for handling conversations, managing middleware,
 * authentication, and error handling. Adapters are responsible for translating between
 * the Agents framework and specific communication channels (like Teams, Web Chat, etc.).
 *
 * Key features:
 * - Middleware pipeline for processing incoming and outgoing activities
 * - Error handling and recovery mechanisms
 * - Authentication provider integration
 * - Abstract methods for channel-specific operations
 * - Context management with revocable proxies for security
 */
export abstract class BaseAdapter {
  /**
   * The middleware set used to process the pipeline of middleware handlers.
   */
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

  /**
   * Symbol key used to store agent identity information in the TurnContext.
   */
  readonly AgentIdentityKey = Symbol('AgentIdentity')

  /**
   * Symbol key used to store connector client instances in the TurnContext.
   */
  readonly ConnectorClientKey = Symbol('ConnectorClient')

  /**
   * Symbol key used to store OAuth scope information in the TurnContext.
   */
  readonly OAuthScopeKey = Symbol('OAuthScope')

  /**
   * The authentication provider used for token management.
   */
  authProvider: AuthProvider = new MsalTokenProvider()

  /**
   * The user token client used for managing user tokens.
   */
  userTokenClient: UserTokenClient | null = null

  /**
   * The authentication configuration for the adapter.
   */
  abstract authConfig: AuthConfiguration

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

  /**
   * Gets the error handler for the adapter.
   * @returns The current error handler function.
   */
  get onTurnError (): (context: TurnContext, error: Error) => Promise<void> {
    return this.turnError
  }

  /**
   * Sets the error handler for the adapter.
   * @param value - The error handler function to set.
   */
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

  /**
   * This method creates a revocable proxy for the given target object.
   * If the environment does not support Proxy.revocable, it returns the original object.
   * @remarks
   * This is used to enhance security by allowing the proxy to be revoked after use,
   * preventing further access to the underlying object.
   *
   * @param target The target object to be proxied.
   * @param handler Optional proxy handler to customize behavior.
   * @returns An object containing the proxy and a revoke function.
   */
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

    // Create a revocable proxy for the context which will automatically be revoked upon completion of the turn.
    const pContext = this.makeRevocable(context)

    try {
      await this.middleware.run(pContext.proxy, async () => await next(pContext.proxy))
    } catch (err: Error | any) {
      if (this.onTurnError) {
        if (err instanceof Error) {
          await this.onTurnError(pContext.proxy, err)
        } else {
          throw new Error('Unknown error type: ' + err.message)
        }
      } else {
        throw err
      }
    } finally {
      pContext.revoke()
      // Accessing the context after this point, will throw a TypeError.
      // e.g.: "TypeError: Cannot perform 'get' on a proxy that has been revoked"
    }
  }
}
