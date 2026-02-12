/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity, RoleTypes } from '@microsoft/agents-activity'
import { TurnContext } from '@microsoft/agents-hosting'
import type { Message, TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from '@a2a-js/sdk' with { 'resolution-mode': 'require' }
import type { RequestContext } from '@a2a-js/sdk/server' with { 'resolution-mode': 'require' }
import { v4 as uuidv4 } from 'uuid'

/**
 * Tools for translating between A2A protocol and Activity protocol
 */

export function a2aMessageToActivity (requestContext: RequestContext): Activity {
  const { taskId, contextId, userMessage } = requestContext
  return Activity.fromObject({
    type: 'message',
    id: uuidv4(),
    channelId: 'A2A',
    conversation: { id: taskId },
    recipient: { role: RoleTypes.User, id: 'user' },
    from: { role: RoleTypes.Agent, id: 'agent' },
    text: userMessage.parts.map((part: any) => part.text).join('\n'),
    channelData: {
      taskId, contextId
    }
  })
}

export function activityToA2AMessage (context: TurnContext, activity: Activity): Message | TaskStatusUpdateEvent | TaskArtifactUpdateEvent {
  const hasStreamingEntity = activity.entities?.some((entity) => entity.type === 'streaminfo')
  if (activity.type === 'message') {
    // TODO:
    // the message version below works nicely with the a2a inspector
    // however does not work with MCS
    // const message: Message = {
    //   kind: 'message',
    //   messageId: activity.id || uuidv4(),
    //   role: 'agent',
    //   parts: [{ kind: 'text', text: activity.text || '' }],
    //   contextId: context.activity.channelData?.contextId || uuidv4(),
    //   taskId: context.activity.conversation?.id,
    // }

    // this version works with MCS but not the a2a inspector
    const message: TaskStatusUpdateEvent = {
      kind: 'status-update',
      taskId: context.activity.conversation?.id!,
      contextId: context.activity.channelData?.contextId || uuidv4(),
      final: false,
      status: {
        state: 'input-required',
        message: {
          role: 'agent',
          parts: [{ kind: 'text', text: activity.text || '' }],
          messageId: activity.id || uuidv4(),
          contextId: context.activity.channelData?.contextId || uuidv4(),
          taskId: context.activity.conversation?.id,
          kind: 'message',
        }
      }
    }

    return message
  } else if (activity.type === 'typing' && hasStreamingEntity) {
    const typingIndicator: TaskArtifactUpdateEvent = {
      kind: 'artifact-update',
      contextId: context.activity.channelData?.contextId,
      taskId: context.activity.conversation?.id!,
      artifact: {
        artifactId: context.activity.channelData?.contextId,
        parts: [{ kind: 'text', text: activity.text || 'typing...' }],
      },
    }
    return typingIndicator
  } else {
    throw new Error(`Unhandled activity type on A2A channel: ${activity.type}`)
  }
}
