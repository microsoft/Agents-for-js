/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'
import { v4 as uuid } from 'uuid'
import { ActivityTypes, activityTypesZodSchema } from './activityTypes'
import { SuggestedActions, suggestedActionsZodSchema } from './action/SuggestedActions'
import { ActivityEventNames, activityEventNamesZodSchema } from './ActivityEventNames'
import { ActivityImportance, activityImportanceZodSchema } from './ActivityImportance'
import { TextHighlight, textHighlightZodSchema } from './TextHighlight'
import { SemanticAction, semanticActionZodSchema } from './action/SemanticAction'
import { ChannelAccount, channelAccountZodSchema } from './conversation/ChannelAccount'
import { ConversationAccount, conversationAccountZodSchema } from './conversation/ConversationAccount'
import { TextFormatTypes, textFormatTypesZodSchema } from './TextFormatTypes'
import { AttachmentLayoutTypes, attachmentLayoutTypesZodSchema } from './attachment/AttachmentLayoutTypes'
import { MessageReaction, messageReactionZodSchema } from './MessageReaction'
import { InputHints, inputHintsZodSchema } from './InputHints'
import { Attachment, attachmentZodSchema } from './attachment/Attachment'
import { Entity, entityZodSchema } from './entity/Entity'
import { ConversationReference, conversationReferenceZodSchema } from './conversation/ConversationReference'
import { EndOfConversationCodes, endOfConversationCodesZodSchema } from './conversation/EndOfConversationCodes'
import { DeliveryModes, deliveryModesZodSchema } from './DeliveryModes'
import { Channels } from './conversation/Channels'
import { Mention } from './entity/Mention'
import { ResourceResponse } from './conversation/ResourceResponse'

const activityZodSchema = z.object({
  type: z.union([activityTypesZodSchema, z.string().min(1)]),
  text: z.string().min(1).optional(),
  id: z.string().min(1).optional(),
  channelId: z.string().min(1).optional(),
  from: channelAccountZodSchema.optional(),
  timestamp: z.string().min(1).datetime().optional(),
  localTimestamp: z.string().min(1).transform(s => new Date(s)).optional(),
  localTimezone: z.string().min(1).optional(),
  callerId: z.string().min(1).optional(),
  serviceUrl: z.string().min(1).optional(),
  conversation: conversationAccountZodSchema.optional(),
  recipient: channelAccountZodSchema.optional(),
  textFormat: z.union([textFormatTypesZodSchema, z.string().min(1)]).optional(),
  attachmentLayout: z.union([attachmentLayoutTypesZodSchema, z.string().min(1)]).optional(),
  membersAdded: z.array(channelAccountZodSchema).optional(),
  membersRemoved: z.array(channelAccountZodSchema).optional(),
  reactionsAdded: z.array(messageReactionZodSchema).optional(),
  reactionsRemoved: z.array(messageReactionZodSchema).optional(),
  topicName: z.string().min(1).optional(),
  historyDisclosed: z.boolean().optional(),
  locale: z.string().min(1).optional(),
  speak: z.string().min(1).optional(),
  inputHint: z.union([inputHintsZodSchema, z.string().min(1)]).optional(),
  summary: z.string().min(1).optional(),
  suggestedActions: suggestedActionsZodSchema.optional(),
  attachments: z.array(attachmentZodSchema).optional(),
  entities: z.array(entityZodSchema).optional(),
  channelData: z.unknown().optional(),
  action: z.string().min(1).optional(),
  replyToId: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  valueType: z.string().min(1).optional(),
  value: z.unknown().optional(),
  name: z.union([activityEventNamesZodSchema, z.string().min(1)]).optional(),
  relatesTo: conversationReferenceZodSchema.optional(),
  code: z.union([endOfConversationCodesZodSchema, z.string().min(1)]).optional(),
  expiration: z.string().min(1).datetime().optional(),
  importance: z.union([activityImportanceZodSchema, z.string().min(1)]).optional(),
  deliveryMode: z.union([deliveryModesZodSchema, z.string().min(1)]).optional(),
  listenFor: z.array(z.string().min(1)).optional(),
  textHighlights: z.array(textHighlightZodSchema).optional(),
  semanticAction: semanticActionZodSchema.optional()
})

export class Activity {
  type: ActivityTypes | string
  text?: string
  id?: string
  channelId?: string
  from?: ChannelAccount
  timestamp?: Date | string
  localTimestamp?: Date | string
  localTimezone?: string
  callerId?: string
  serviceUrl?: string
  conversation?: ConversationAccount
  recipient?: ChannelAccount
  textFormat?: TextFormatTypes | string
  attachmentLayout?: AttachmentLayoutTypes | string
  membersAdded?: ChannelAccount[]
  membersRemoved?: ChannelAccount[]
  reactionsAdded?: MessageReaction[]
  reactionsRemoved?: MessageReaction[]
  topicName?: string
  historyDisclosed?: boolean
  locale?: string
  speak?: string
  inputHint?: InputHints | string
  summary?: string
  suggestedActions?: SuggestedActions
  attachments?: Attachment[]
  entities?: Entity[]
  channelData?: unknown
  action?: string
  replyToId?: string
  label?: string
  valueType?: string
  value?: unknown
  name?: ActivityEventNames | string
  relatesTo?: ConversationReference
  code?: EndOfConversationCodes | string
  expiration?: string | Date
  importance?: ActivityImportance | string
  deliveryMode?: DeliveryModes | string
  listenFor?: string[]
  textHighlights?: TextHighlight[]
  semanticAction?: SemanticAction
  rawTimestamp?: string
  rawExpiration?: string
  rawLocalTimestamp?: string
  [x: string]: unknown

  constructor (t: ActivityTypes | string) {
    if (t === undefined) {
      throw new Error('Invalid ActivityType: undefined')
    }
    if (t === null) {
      throw new Error('Invalid ActivityType: null')
    }
    if ((typeof t === 'string') && (t.length === 0)) {
      throw new Error('Invalid ActivityType: empty string')
    }
    this.type = t
  }

  static fromJson (json: string): Activity {
    return this.fromObject(JSON.parse(json))
  }

  static fromObject (o: object): Activity {
    return activityZodSchema.passthrough().parse(o)
  }

  static getContinuationActivity (reference: ConversationReference): Activity {
    return {
      type: ActivityTypes.Event,
      name: ActivityEventNames.ContinueConversation,
      id: uuid(),
      channelId: reference.channelId,
      locale: reference.locale,
      serviceUrl: reference.serviceUrl,
      conversation: reference.conversation,
      recipient: reference.bot,
      from: reference.user,
      relatesTo: reference
    }
  }

  private static getAppropriateReplyToId (source: Activity): string | undefined {
    if (
      source.type !== ActivityTypes.ConversationUpdate ||
        (source.channelId !== Channels.Directline && source.channelId !== Channels.Webchat)
    ) {
      return source.id
    }

    return undefined
  }

  static getConversationReference (activity: Activity): ConversationReference {
    if (activity.recipient == null) {
      throw new Error('Activity Recipient undefined')
    }
    if (activity.conversation == null) {
      throw new Error('Activity Conversation undefined')
    }
    if (!activity.channelId) {
      throw new Error('Activity ChannelId undefined')
    }
    if (!activity.serviceUrl) {
      throw new Error('Activity ServiceUrl undefined')
    }

    return {
      activityId: this.getAppropriateReplyToId(activity),
      user: activity.from,
      bot: activity.recipient,
      conversation: activity.conversation,
      channelId: activity.channelId,
      locale: activity.locale,
      serviceUrl: activity.serviceUrl
    }
  }

  static applyConversationReference (
    activity: Activity,
    reference: ConversationReference,
    isIncoming = false
  ): Activity {
    activity.channelId = reference.channelId
    activity.locale ??= reference.locale
    activity.serviceUrl = reference.serviceUrl
    activity.conversation = reference.conversation
    if (isIncoming) {
      activity.from = reference.user
      activity.recipient = reference.bot
      if (reference.activityId) {
        activity.id = reference.activityId
      }
    } else {
      activity.from = reference.bot
      activity.recipient = reference.user
      if (reference.activityId) {
        activity.replyToId = reference.activityId
      }
    }

    return activity
  }

  private static getMentions (activity: Activity): Mention[] {
    const result: Mention[] = []
    if (activity.entities !== undefined) {
      for (let i = 0; i < activity.entities.length; i++) {
        if (activity.entities[i].type.toLowerCase() === 'mention') {
          result.push(activity.entities[i] as unknown as Mention)
        }
      }
    }
    return result
  }

  private static removeMentionText (activity: Activity, id: string): string {
    const mentions = this.getMentions(activity)
    const mentionsFiltered = mentions.filter((mention): boolean => mention.mentioned.id === id)
    if ((mentionsFiltered.length > 0) && activity.text) {
      activity.text = activity.text.replace(mentionsFiltered[0].text, '').trim()
    }
    return activity.text || ''
  }

  static removeRecipientMention (activity: Activity): string {
    if ((activity.recipient != null) && activity.recipient.id) {
      return this.removeMentionText(activity, activity.recipient.id)
    }
    return ''
  }

  static getReplyConversationReference (
    activity: Activity,
    reply: ResourceResponse
  ): ConversationReference {
    const reference: ConversationReference = this.getConversationReference(activity)

    reference.activityId = reply.id

    return reference
  }
}
