/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'
import { v4 as uuid } from 'uuid'
import { ActivityTypes, activityTypesZodSchema } from './activityTypes'
import { SuggestedActions, suggestedActionsZodSchema } from './action/suggestedActions'
import { ActivityEventNames, activityEventNamesZodSchema } from './activityEventNames'
import { ActivityImportance, activityImportanceZodSchema } from './activityImportance'
import { TextHighlight, textHighlightZodSchema } from './textHighlight'
import { SemanticAction, semanticActionZodSchema } from './action/semanticAction'
import { ChannelAccount, channelAccountZodSchema } from './conversation/channelAccount'
import { ConversationAccount, conversationAccountZodSchema } from './conversation/conversationAccount'
import { TextFormatTypes, textFormatTypesZodSchema } from './textFormatTypes'
import { AttachmentLayoutTypes, attachmentLayoutTypesZodSchema } from './attachment/attachmentLayoutTypes'
import { MessageReaction, messageReactionZodSchema } from './messageReaction'
import { InputHints, inputHintsZodSchema } from './inputHints'
import { Attachment, attachmentZodSchema } from './attachment/attachment'
import { Entity, entityZodSchema } from './entity/entity'
import { ConversationReference, conversationReferenceZodSchema } from './conversation/conversationReference'
import { EndOfConversationCodes, endOfConversationCodesZodSchema } from './conversation/endOfConversationCodes'
import { DeliveryModes, deliveryModesZodSchema } from './deliveryModes'
import { Channels } from './conversation/channels'
import { Mention } from './entity/mention'

/**
 * Zod schema for validating an Activity object.
 */
export const activityZodSchema = z.object({
  type: z.union([activityTypesZodSchema, z.string().min(1)]),
  text: z.string().min(1).optional(),
  id: z.string().min(1).optional(),
  channelId: z.string().min(1).optional(),
  from: channelAccountZodSchema.optional(),
  timestamp: z.union([z.date(), z.string().min(1).datetime().optional(), z.string().min(1).transform(s => new Date(s)).optional()]),
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
  entities: z.array(entityZodSchema.passthrough()).optional(),
  channelData: z.any().optional(),
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

/**
 * Represents an activity in a conversation.
 */
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
  channelData?: any
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

  /**
   * Creates a new Activity instance.
   * @param t The type of the activity.
   * @throws Will throw an error if the activity type is invalid.
   */
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

  /**
   * Creates an Activity instance from a JSON string.
   * @param json The JSON string representing the activity.
   * @returns The created Activity instance.
   */
  static fromJson (json: string): Activity {
    return this.fromObject(JSON.parse(json))
  }

  /**
   * Creates an Activity instance from an object.
   * @param o The object representing the activity.
   * @returns The created Activity instance.
   */
  static fromObject (o: object): Activity {
    const parsedActivity = activityZodSchema.passthrough().parse(o)
    const activity = new Activity(parsedActivity.type)
    Object.assign(activity, parsedActivity)
    return activity
  }

  /**
   * Creates a continuation activity from a conversation reference.
   * @param reference The conversation reference.
   * @returns The created continuation activity.
   */
  static getContinuationActivity (reference: ConversationReference): Activity {
    const continuationActivityObj = {
      type: ActivityTypes.Event,
      name: ActivityEventNames.ContinueConversation,
      id: uuid(),
      channelId: reference.channelId,
      locale: reference.locale,
      serviceUrl: reference.serviceUrl,
      conversation: reference.conversation,
      recipient: reference.agent,
      from: reference.user,
      relatesTo: reference
    }
    const continuationActivity: Activity = Activity.fromObject(continuationActivityObj)
    return continuationActivity
  }

  /**
   * Gets the appropriate reply-to ID for the activity.
   * @returns The reply-to ID, or undefined if not applicable.
   */
  private getAppropriateReplyToId (): string | undefined {
    if (
      this.type !== ActivityTypes.ConversationUpdate ||
        (this.channelId !== Channels.Directline && this.channelId !== Channels.Webchat)
    ) {
      return this.id
    }

    return undefined
  }

  /**
   * Gets the conversation reference for the activity.
   * @returns The conversation reference.
   * @throws Will throw an error if required properties are undefined.
   */
  public getConversationReference (): ConversationReference {
    if (this.recipient === null || this.recipient === undefined) {
      throw new Error('Activity Recipient undefined')
    }
    if (this.conversation === null || this.conversation === undefined) {
      throw new Error('Activity Conversation undefined')
    }
    if (this.channelId === null || this.channelId === undefined) {
      throw new Error('Activity ChannelId undefined')
    }
    if (this.serviceUrl === null || this.serviceUrl === undefined) {
      throw new Error('Activity ServiceUrl undefined')
    }

    return {
      activityId: this.getAppropriateReplyToId(),
      user: this.from,
      agent: this.recipient,
      conversation: this.conversation,
      channelId: this.channelId,
      locale: this.locale,
      serviceUrl: this.serviceUrl
    }
  }

  /**
   * Applies a conversation reference to the activity.
   * @param reference The conversation reference.
   * @param isIncoming Whether the activity is incoming.
   * @returns The updated activity.
   */
  public applyConversationReference (
    reference: ConversationReference,
    isIncoming = false
  ): Activity {
    this.channelId = reference.channelId
    this.locale ??= reference.locale
    this.serviceUrl = reference.serviceUrl
    this.conversation = reference.conversation
    if (isIncoming) {
      this.from = reference.user
      this.recipient = reference.agent ?? undefined
      if (reference.activityId) {
        this.id = reference.activityId
      }
    } else {
      this.from = reference.agent ?? undefined
      this.recipient = reference.user
      if (reference.activityId) {
        this.replyToId = reference.activityId
      }
    }

    return this
  }

  public clone (): Activity {
    const activityCopy = JSON.parse(JSON.stringify(this))

    for (const key in activityCopy) {
      if (typeof activityCopy[key] === 'string' && !isNaN(Date.parse(activityCopy[key]))) {
        activityCopy[key] = new Date(activityCopy[key] as string)
      }
    }

    Object.setPrototypeOf(activityCopy, Activity.prototype)
    return activityCopy
  }

  /**
   * Gets the mentions in the activity.
   * @param activity The activity.
   * @returns The list of mentions.
   */
  private getMentions (activity: Activity): Mention[] {
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

  /**
   * Removes the mention text for a given ID.
   * @param id The ID of the mention to remove.
   * @returns The updated text.
   */
  private removeMentionText (id: string): string {
    const mentions = this.getMentions(this)
    const mentionsFiltered = mentions.filter((mention): boolean => mention.mentioned.id === id)
    if ((mentionsFiltered.length > 0) && this.text) {
      this.text = this.text.replace(mentionsFiltered[0].text, '').trim()
    }
    return this.text || ''
  }

  /**
   * Removes the recipient mention from the activity text.
   * @returns The updated text.
   */
  public removeRecipientMention (): string {
    if ((this.recipient != null) && this.recipient.id) {
      return this.removeMentionText(this.recipient.id)
    }
    return ''
  }

  /**
   * Gets the conversation reference for a reply.
   * @param replyId The ID of the reply.
   * @returns The conversation reference.
   */
  public getReplyConversationReference (
    replyId: string
  ): ConversationReference {
    const reference: ConversationReference = this.getConversationReference()

    reference.activityId = replyId

    return reference
  }

  public toJsonString (): string {
    return JSON.stringify(this)
  }
}
