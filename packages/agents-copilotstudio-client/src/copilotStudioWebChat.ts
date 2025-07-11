/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from 'uuid'

import { Activity, ConversationAccount } from '@microsoft/agents-activity'
import { Observable, BehaviorSubject, type Subscriber } from 'rxjs'

import { CopilotStudioClient } from './copilotStudioClient'
import { debug } from '@microsoft/agents-activity/src/logger'

const logger = debug('copilot-studio:webchat')

export interface CopilotStudioWebChatSettings {
  /**
   * Whether to show typing indicators in the WebChat.
   * Defaults to false.
   */
  showTyping?: boolean;
}

export interface CopilotStudioWebChatConnection {
  /**
   * An observable that emits the connection status.
   * 0 - Disconnected
   * 1 - Connecting
   * 2 - Connected
  */
  connectionStatus$: BehaviorSubject<number>;

  /**
   * An observable that emits incoming activities.
   * The emitted activities will have a 'webchat:sequence-id' in their channelData.
   */
  activity$: Observable<Partial<Activity>>;

  /**
   * Posts an activity to the Copilot Studio service.
   * The activity must have a non-empty text field.
   * Returns an observable that emits the activity ID once the activity is posted.
   *
   * @param activity - The activity to post.
   * @returns An observable that emits the activity ID.
   */
  postActivity(activity: Activity): Observable<string>;

  /**
   * Ends the connection.
   * This will complete the connectionStatus$ and activity$ observables.
   */
  end(): void;
}

/**
 * This class is intended to be used in WebChat applications to connect to the Copilot Studio service.
 *
 * example usage:
 * ```javascript
 * const client = new CopilotStudioClient(...)
 * window.WebChat.renderWebChat({
 *   directLine: CopilotStudioWebChat.createConnection(client)
 * })
 * ```
 */
export class CopilotStudioWebChat {
  /**
   * Creates a new DirectLine-Like connection to WebChat.
   * When an activity is posted in WebChat, the connection will send it to the Copilot Studio service, awaiting response.
   * After a response is received, it will emit the incoming activity back to WebChat.
   *
   * @param client - The Copilot Studio client instance.
   * @param settings - Optional settings for the WebChat connection.
   * @returns A new instance of CopilotStudioWebChatConnection.
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
 * Creates an observable that allows executing an asynchronous function.
 * @param fn - The function to execute.
 * @returns A new observable.
 */
function createObservable<T> (fn: (subscriber: Subscriber<T>) => void): Observable<T> {
  return new Observable<T>((subscriber) => {
    Promise.resolve(fn(subscriber)).catch((error) => subscriber.error(error))
  })
}
