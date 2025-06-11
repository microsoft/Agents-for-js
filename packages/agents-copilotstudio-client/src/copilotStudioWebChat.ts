/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity, ConversationAccount } from "@microsoft/agents-activity";

import { Observable } from "rxjs/Observable";
import { BehaviorSubject } from "rxjs/BehaviorSubject";
import type { Observer } from "rxjs/Observer";

import { CopilotStudioClient } from "./copilotStudioClient";

interface CopilotStudioWebChatConnectionSettings {
  showTyping?: boolean;
}

export const CopilotStudioWebChat = {
  createConnection(
    client: CopilotStudioClient,
    settings?: CopilotStudioWebChatConnectionSettings
  ) {
    let sequence = 0;
    let activityObserver: Observer<Partial<Activity>> | undefined;
    let conversation: ConversationAccount | undefined;

    const connectionStatus$ = new BehaviorSubject(0);
    const activity$ = Observable.create(
      async (observer: Observer<Partial<Activity>>) => {
        activityObserver = observer;

        if (connectionStatus$.value < 2) {
          connectionStatus$.next(2);
          return;
        }

        notifyTyping();
        const activity = await client.startConversationAsync();
        conversation = activity.conversation;
        sequence = 0;
        notifyActivity(activity);
      }
    );

    const notifyActivity = (activity: Partial<Activity>) => {
      activityObserver?.next({
        ...activity,
        timestamp: new Date().toISOString(),
        channelData: {
          ...activity.channelData,
          "webchat:sequence-id": sequence++,
        },
      });
    };

    const notifyTyping = () => {
      if (!settings?.showTyping) {
        return;
      }

      const from = conversation
        ? { id: conversation.id, name: conversation.name }
        : { id: "agent", name: "Agent" };
      notifyActivity({ type: "typing", from });
    };

    return {
      connectionStatus$,
      activity$,
      postActivity(activity: Activity) {
        if (!activity.text?.trim()) {
          throw new Error("TODO");
        }

        if (!activityObserver) {
          throw new Error("TODO");
        }

        return Observable.create(async (observer: Observer<string>) => {
          try {
            const id = Math.random().toString(36).substring(2, 15); // TODO: Use a better ID generation method

            notifyActivity({ ...activity, id });

            const activities = await client.askQuestionAsync(activity.text!);

            notifyTyping();
            for (const reponseActivity of activities) {
              notifyActivity(reponseActivity);
            }

            observer.next(id);
          } catch (error) {
            observer.error(error);
          }
        });
      },

      end() {
        connectionStatus$.complete();
        activity$.complete();
        if (activityObserver) {
          activityObserver.complete();
          activityObserver = undefined;
        }
      },
    };
  },
};
