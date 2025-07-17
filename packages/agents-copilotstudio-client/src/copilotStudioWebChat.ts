/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from 'uuid'

import { Activity, ConversationAccount } from '@microsoft/agents-activity'
import { Observable, BehaviorSubject, type Subscriber } from 'rxjs'

import { CopilotStudioClient } from './copilotStudioClient'
import { debug } from '@microsoft/agents-activity/logger'

const logger = debug('copilot-studio:webchat')

/**
 * Configuration settings for the Copilot Studio WebChat connection.
 * These settings control the behavior and appearance of the WebChat interface
 * when connected to the Copilot Studio service.
 */
export interface CopilotStudioWebChatSettings {
  /**
   * Whether to show typing indicators in the WebChat when the agent is processing a response.
   * When enabled, users will see a typing indicator while waiting for the agent's reply,
   * providing visual feedback that their message is being processed.
   * @default false
   */
  showTyping?: boolean;
}

/**
 * Represents a connection interface for integrating Copilot Studio with WebChat.
 * This interface provides the necessary methods and observables to facilitate
 * bidirectional communication between a WebChat client and the Copilot Studio service.
 *
 * The connection follows the DirectLine protocol pattern, making it compatible with
 * Microsoft Bot Framework WebChat components.
 */
export interface CopilotStudioWebChatConnection {
  /**
   * An observable that emits the current connection status as numeric values.
   * This allows WebChat clients to monitor and react to connection state changes.
   *
   * Connection status values:
   * - 0: Disconnected - No active connection to the service
   * - 1: Connecting - Attempting to establish connection
   * - 2: Connected - Successfully connected and ready for communication
   */
  connectionStatus$: BehaviorSubject<number>;

  /**
   * An observable stream that emits incoming activities from the Copilot Studio service.
   * Each activity represents a message, card, or other interactive element sent by the agent.
   *
   * All emitted activities include:
   * - A timestamp indicating when the activity was received
   * - A 'webchat:sequence-id' in their channelData for proper message ordering
   * - Standard Bot Framework Activity properties (type, text, attachments, etc.)
   */
  activity$: Observable<Partial<Activity>>;

  /**
   * Posts a user activity to the Copilot Studio service and returns an observable
   * that emits the activity ID once the message is successfully sent.
   *
   * The method validates that the activity contains meaningful content and handles
   * the complete message flow including optional typing indicators.
   *
   * @param activity - The user activity to send. Must contain a non-empty text field.
   * @returns An observable that emits the unique activity ID upon successful posting.
   * @throws Error if the activity text is empty or if the connection is not properly initialized.
   */
  postActivity(activity: Activity): Observable<string>;

  /**
   * Gracefully terminates the connection to the Copilot Studio service.
   * This method ensures proper cleanup by completing all active observables
   * and releasing associated resources.
   *
   * After calling this method:
   * - The connectionStatus$ observable will be completed
   * - The activity$ observable will stop emitting new activities
   * - No further activities can be posted through this connection
   */
  end(): void;
}

/**
 * @summary A utility class that provides WebChat integration capabilities for Copilot Studio services.
 * @remarks
 * This class acts as a bridge between Microsoft Bot Framework WebChat and Copilot Studio,
 * enabling seamless communication through a DirectLine-compatible interface.
 *
 * ## Key Features:
 * - DirectLine protocol compatibility for easy WebChat integration
 * - Real-time bidirectional messaging with Copilot Studio agents
 * - Automatic conversation management and message sequencing
 * - Optional typing indicators for enhanced user experience
 * - Observable-based architecture for reactive programming patterns
 *
 * ## Usage Scenarios:
 * - Embedding Copilot Studio agents in web applications
 * - Creating custom chat interfaces with WebChat components
 * - Building conversational AI experiences with Microsoft's bot ecosystem
 *
 * @example Basic WebChat Integration
 * ```typescript
 * import { CopilotStudioClient } from '@microsoft/agents-copilotstudio-client';
 * import { CopilotStudioWebChat } from '@microsoft/agents-copilotstudio-client';
 *
 * // Initialize the Copilot Studio client
 * const client = new CopilotStudioClient({
 *   botId: 'your-bot-id',
 *   tenantId: 'your-tenant-id'
 * });
 *
 * // Create a WebChat-compatible connection
 * const directLine = CopilotStudioWebChat.createConnection(client, {
 *   showTyping: true
 * });
 *
 * // Integrate with WebChat
 * window.WebChat.renderWebChat({
 *   directLine: directLine,
 *   // ... other WebChat options
 * }, document.getElementById('webchat'));
 * ```
 *
 * @example Advanced Usage with Connection Monitoring
 * ```typescript
 * const connection = CopilotStudioWebChat.createConnection(client);
 *
 * // Monitor connection status
 * connection.connectionStatus$.subscribe(status => {
 *   switch (status) {
 *     case 0: console.log('Disconnected'); break;
 *     case 1: console.log('Connecting...'); break;
 *     case 2: console.log('Connected and ready'); break;
 *   }
 * });
 *
 * // Listen for incoming activities
 * connection.activity$.subscribe(activity => {
 *   console.log('Received activity:', activity);
 * });
 * ```
 */
export class CopilotStudioWebChat {
  /**
   * Creates a DirectLine-compatible connection for integrating Copilot Studio with WebChat.
   *
   * This method establishes a real-time communication channel between WebChat and the
   * Copilot Studio service. The returned connection object implements the DirectLine
   * protocol, making it fully compatible with Microsoft Bot Framework WebChat components.
   *
   * ## Connection Lifecycle:
   * 1. **Initialization**: Creates observables for connection status and activity streaming
   * 2. **Conversation Start**: Automatically initiates conversation when first activity is posted
   * 3. **Message Flow**: Handles bidirectional message exchange with proper sequencing
   * 4. **Cleanup**: Provides graceful connection termination
   *
   * ## Message Processing:
   * - User messages are validated and sent to Copilot Studio
   * - Agent responses are received and formatted for WebChat
   * - All activities include timestamps and sequence IDs for proper ordering
   * - Optional typing indicators provide visual feedback during processing
   *
   * @param client - A configured CopilotStudioClient instance that handles the underlying
   *                 communication with the Copilot Studio service. This client should be
   *                 properly authenticated and configured with the target bot details.
   *
   * @param settings - Optional configuration settings that control the behavior of the
   *                   WebChat connection. These settings allow customization of features
   *                   like typing indicators and other user experience enhancements.
   *
   * @returns A new CopilotStudioWebChatConnection instance that can be passed directly
   *          to WebChat's renderWebChat function as the directLine parameter. The
   *          connection is immediately ready for use and will automatically manage
   *          the conversation lifecycle.
   *
   * @throws Error if the provided client is not properly configured or if there are
   *         issues establishing the initial connection to the Copilot Studio service.
   *
   * @example
   * ```typescript
   * const connection = CopilotStudioWebChat.createConnection(client, {
   *   showTyping: true
   * });
   *
   * // Use with WebChat
   * window.WebChat.renderWebChat({
   *   directLine: connection
   * }, document.getElementById('webchat'));
   * ```
   */
  static createConnection (
    client: CopilotStudioClient,
    settings?: CopilotStudioWebChatSettings
  ):CopilotStudioWebChatConnection {
    logger.info('--> Creating connection between Copilot Studio and WebChat ...')
    let sequence = 0
    let activitySubscriber: Subscriber<Partial<Activity>> | undefined
    let conversation: ConversationAccount | undefined

    const connectionStatus$ = new BehaviorSubject(0)
    const activity$ = createObservable<Partial<Activity>>(async (subscriber) => {
      activitySubscriber = subscriber

      if (connectionStatus$.value < 2) {
        connectionStatus$.next(2)
        return
      }

      logger.debug('--> Connection established.')
      notifyTyping()
      const activity = await client.startConversationAsync()
      conversation = activity.conversation
      sequence = 0
      notifyActivity(activity)
    })

    const notifyActivity = (activity: Partial<Activity>) => {
      const newActivity = {
        ...activity,
        timestamp: new Date().toISOString(),
        channelData: {
          ...activity.channelData,
          'webchat:sequence-id': sequence++,
        },
      }
      logger.debug(`Notify '${newActivity.type}' activity to WebChat:`, newActivity)
      activitySubscriber?.next(newActivity)
    }

    const notifyTyping = () => {
      if (!settings?.showTyping) {
        return
      }

      const from = conversation
        ? { id: conversation.id, name: conversation.name }
        : { id: 'agent', name: 'Agent' }
      notifyActivity({ type: 'typing', from })
    }

    return {
      connectionStatus$,
      activity$,
      postActivity (activity: Activity) {
        logger.info('--> Preparing to send activity to Copilot Studio ...')

        if (!activity.text?.trim()) {
          throw new Error('Activity text cannot be empty.')
        }

        if (!activitySubscriber) {
          throw new Error('Activity subscriber is not initialized.')
        }

        return createObservable<string>(async (subscriber) => {
          try {
            const id = uuid()

            logger.info('--> Sending activity to Copilot Studio ...')

            notifyActivity({ ...activity, id })
            notifyTyping()

            const activities = await client.askQuestionAsync(activity.text!)
            for (const responseActivity of activities) {
              notifyActivity(responseActivity)
            }

            subscriber.next(id)
            subscriber.complete()
            logger.info('--> Activity received correctly from Copilot Studio.')
          } catch (error) {
            logger.error('Error sending Activity to Copilot Studio:', error)
            subscriber.error(error)
          }
        })
      },

      end () {
        logger.info('--> Ending connection between Copilot Studio and WebChat ...')
        connectionStatus$.complete()
        if (activitySubscriber) {
          activitySubscriber.complete()
          activitySubscriber = undefined
        }
      },
    }
  }
}

/**
 * Creates an RxJS Observable that wraps an asynchronous function execution.
 *
 * This utility function provides a clean way to convert async/await patterns
 * into Observable streams, enabling integration with reactive programming patterns
 * used throughout the WebChat connection implementation.
 *
 * The created Observable handles promise resolution and rejection automatically,
 * converting them to appropriate next/error signals for subscribers.
 *
 * @template T - The type of value that the observable will emit
 * @param fn - An asynchronous function that receives a Subscriber and performs
 *             the desired async operation. The function should call subscriber.next()
 *             with results and subscriber.complete() when finished.
 * @returns A new Observable that executes the provided function and emits its results
 *
 * @example
 * ```typescript
 * const dataObservable = createObservable<string>(async (subscriber) => {
 *   try {
 *     const result = await fetchData();
 *     subscriber.next(result);
 *     subscriber.complete();
 *   } catch (error) {
 *     subscriber.error(error);
 *   }
 * });
 * ```
 */
function createObservable<T> (fn: (subscriber: Subscriber<T>) => void): Observable<T> {
  return new Observable<T>((subscriber: Subscriber<T>) => {
    Promise.resolve(fn(subscriber)).catch((error) => subscriber.error(error))
  })
}
