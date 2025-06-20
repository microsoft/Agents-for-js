/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from 'uuid'

import { Activity, ConversationAccount } from '@microsoft/agents-activity'
import { Observable, BehaviorSubject, type Observer } from 'rxjs'

import { CopilotStudioClient } from './copilotStudioClient'

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
   * When an activity is posted in WebChat, the connection will be send it to the Copilot Studio service, awaiting response.
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
    let sequence = 0
    let activityObserver: Observer<Partial<Activity>> | undefined
    let conversation: ConversationAccount | undefined

    const connectionStatus$ = new BehaviorSubject(0)
    const activity$ = Observable.create(
      async (observer: Observer<Partial<Activity>>) => {
        activityObserver = observer

        if (connectionStatus$.value < 2) {
          connectionStatus$.next(2)
          return
        }

        notifyTyping()
        const activity = await client.startConversationAsync()
        conversation = activity.conversation
        sequence = 0
        notifyActivity(activity)
      }
    )

    const notifyActivity = (activity: Partial<Activity>) => {
      activityObserver?.next({
        ...activity,
        timestamp: new Date().toISOString(),
        channelData: {
          ...activity.channelData,
          'webchat:sequence-id': sequence++,
        },
      })
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
        if (!activity.text?.trim()) {
          throw new Error('Activity text cannot be empty.')
        }

        if (!activityObserver) {
          throw new Error('Activity observer is not initialized.')
        }

        return Observable.create(async (observer: Observer<string>) => {
          try {
            const id = uuid()

            notifyActivity({ ...activity, id })
            notifyTyping()

            const activities = await client.askQuestionAsync(activity.text!)
            for (const responseActivity of activities) {
              notifyActivity(responseActivity)
            }

            observer.next(id)
            observer.complete()
          } catch (error) {
            observer.error(error)
          }
        })
      },

      end () {
        connectionStatus$.complete()
        activity$.complete()
        if (activityObserver) {
          activityObserver.complete()
          activityObserver = undefined
        }
      },
    }
  }
}
