/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from 'uuid'
import { z } from 'zod'
import { SemanticAction, semanticActionZodSchema } from './action/semanticAction'
import { SuggestedActions, suggestedActionsZodSchema } from './action/suggestedActions'
import { ActivityEventNames, activityEventNamesZodSchema } from './activityEventNames'
import { ActivityImportance, activityImportanceZodSchema } from './activityImportance'
import { ActivityTypes, activityTypesZodSchema } from './activityTypes'
import { Attachment, attachmentZodSchema } from './attachment/attachment'
import { AttachmentLayoutTypes, attachmentLayoutTypesZodSchema } from './attachment/attachmentLayoutTypes'
import { ChannelAccount, channelAccountZodSchema } from './conversation/channelAccount'
import { Channels } from './conversation/channels'
import { ConversationAccount, conversationAccountZodSchema } from './conversation/conversationAccount'
import { ConversationReference, conversationReferenceZodSchema } from './conversation/conversationReference'
import { EndOfConversationCodes, endOfConversationCodesZodSchema } from './conversation/endOfConversationCodes'
import { DeliveryModes, deliveryModesZodSchema } from './deliveryModes'
import { Entity, entityZodSchema } from './entity/entity'
import { Mention } from './entity/mention'
import { InputHints, inputHintsZodSchema } from './inputHints'
import { MessageReaction, messageReactionZodSchema } from './messageReaction'
import { TextFormatTypes, textFormatTypesZodSchema } from './textFormatTypes'
import { TextHighlight, textHighlightZodSchema } from './textHighlight'

/**
 * Zod schema for validating an Activity object.
 */
export const activityZodSchema = z.object({
  type: z.union([activityTypesZodSchema, z.string().min(1)]),
  text: z.string().optional(),
  id: z.string().min(1).optional(),
  channelId: z.string().min(1).optional(),
  from: channelAccountZodSchema.optional(),
  timestamp: z.union([z.date(), z.string().min(1).datetime().optional(), z.string().min(1).transform(s => new Date(s)).optional()]),
  localTimestamp: z.string().min(1).transform(s => new Date(s)).optional().or(z.date()).optional(), // z.string().min(1).transform(s => new Date(s)).optional(),
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
  /**
   * The type of the activity.
   */
  type: ActivityTypes | string

  /**
   * The text content of the activity.
   */
  text?: string

  /**
   * The unique identifier of the activity.
   */
  id?: string

  /**
   * The channel ID where the activity originated.
   */
  channelId?: string

  /**
   * The account of the sender of the activity.
   */
  from?: ChannelAccount

  /**
   * The timestamp of the activity.
   */
  timestamp?: Date | string

  /**
   * The local timestamp of the activity.
   */
  localTimestamp?: Date | string

  /**
   * The local timezone of the activity.
   */
  localTimezone?: string

  /**
   * The caller ID of the activity.
   */
  callerId?: string

  /**
   * The service URL of the activity.
   */
  serviceUrl?: string

  /**
   * The conversation account associated with the activity.
   */
  conversation?: ConversationAccount

  /**
   * The recipient of the activity.
   */
  recipient?: ChannelAccount

  /**
   * The text format of the activity.
   */
  textFormat?: TextFormatTypes | string

  /**
   * The attachment layout of the activity.
   */
  attachmentLayout?: AttachmentLayoutTypes | string

  /**
   * The members added to the conversation.
   */
  membersAdded?: ChannelAccount[]

  /**
   * The members removed from the conversation.
   */
  membersRemoved?: ChannelAccount[]

  /**
   * The reactions added to the activity.
   */
  reactionsAdded?: MessageReaction[]

  /**
   * The reactions removed from the activity.
   */
  reactionsRemoved?: MessageReaction[]

  /**
   * The topic name of the activity.
   */
  topicName?: string

  /**
   * Indicates whether the history is disclosed.
   */
  historyDisclosed?: boolean

  /**
   * The locale of the activity.
   */
  locale?: string

  /**
   * The speech text of the activity.
   */
  speak?: string

  /**
   * The input hint for the activity.
   */
  inputHint?: InputHints | string

  /**
   * The summary of the activity.
   */
  summary?: string

  /**
   * The suggested actions for the activity.
   */
  suggestedActions?: SuggestedActions

  /**
   * The attachments of the activity.
   */
  attachments?: Attachment[]

  /**
   * The entities associated with the activity.
   */
  entities?: Entity[]

  /**
   * The channel-specific data for the activity.
   */
  channelData?: any

  /**
   * The action associated with the activity.
   */
  action?: string

  /**
   * The ID of the activity being replied to.
   */
  replyToId?: string

  /**
   * The label for the activity.
   */
  label?: string

  /**
   * The value type of the activity.
   */
  valueType?: string

  /**
   * The value associated with the activity.
   */
  value?: unknown

  /**
   * The name of the activity event.
   */
  name?: ActivityEventNames | string

  /**
   * The conversation reference for the activity.
   */
  relatesTo?: ConversationReference

  /**
   * The end-of-conversation code for the activity.
   */
  code?: EndOfConversationCodes | string

  /**
   * The expiration time of the activity.
   */
  expiration?: string | Date

  /**
   * The importance of the activity.
   */
  importance?: ActivityImportance | string

  /**
   * The delivery mode of the activity.
   */
  deliveryMode?: DeliveryModes | string

  /**
   * The list of keywords to listen for in the activity.
   */
  listenFor?: string[]

  /**
   * The text highlights in the activity.
   */
  textHighlights?: TextHighlight[]

  /**
   * The semantic action associated with the activity.
   */
  semanticAction?: SemanticAction

  /**
   * The raw timestamp of the activity.
   */
  rawTimestamp?: string

  /**
   * The raw expiration time of the activity.
   */
  rawExpiration?: string

  /**
   * The raw local timestamp of the activity.
   */
  rawLocalTimestamp?: string

  /**
   * Additional properties of the activity.
   */
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
  public getMentions (activity: Activity): Mention[] {
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
   * Normalizes mentions in the activity by removing mention tags and optionally removing recipient mention.
   * @param removeMention Whether to remove the recipient mention from the activity.
   */
  public normalizeMentions (removeMention: boolean = false): void {
    if (this.type === ActivityTypes.Message) {
      if (removeMention) {
        // Strip recipient mention tags and text
        this.removeRecipientMention()

        // Strip entity.mention records for recipient id
        if (this.entities !== undefined && this.recipient?.id) {
          this.entities = this.entities.filter((entity) => {
            if (entity.type.toLowerCase() === 'mention') {
              const mention = entity as unknown as Mention
              return mention.mentioned.id !== this.recipient?.id
            }
            return true
          })
        }
      }

      // Remove <at> </at> tags keeping the inner text
      if (this.text) {
        this.text = Activity.removeAt(this.text)
      }

      // Remove <at> </at> tags from mention records keeping the inner text
      if (this.entities !== undefined) {
        const mentions = this.getMentions(this)
        for (const mention of mentions) {
          if (mention.text) {
            mention.text = Activity.removeAt(mention.text)?.trim()
          }
        }
      }
    }
  }

  /**
   * Removes <at> </at> tags from the specified text.
   * @param text The text to process.
   * @returns The text with <at> </at> tags removed.
   */
  private static removeAt (text: string): string {
    if (!text) {
      return text
    }

    let foundTag: boolean
    do {
      foundTag = false
      const iAtStart = text.toLowerCase().indexOf('<at')
      if (iAtStart >= 0) {
        const iAtEnd = text.indexOf('>', iAtStart)
        if (iAtEnd > 0) {
          const iAtClose = text.toLowerCase().indexOf('</at>', iAtEnd)
          if (iAtClose > 0) {
            // Replace </at>
            let followingText = text.substring(iAtClose + 5)

            // If first char of followingText is not whitespace, insert space
            if (followingText.length > 0 && !(/\s/.test(followingText[0]))) {
              followingText = ` ${followingText}`
            }

            text = text.substring(0, iAtClose) + followingText

            // Get tag content (text between <at...> and </at>)
            const tagContent = text.substring(iAtEnd + 1, iAtClose)

            // Replace <at ...> with just the tag content
            let prefixText = text.substring(0, iAtStart)

            // If prefixText is not empty and doesn't end with whitespace, add a space
            if (prefixText.length > 0 && !(/\s$/.test(prefixText))) {
              prefixText += ' '
            }

            text = prefixText + tagContent + followingText

            // We found one, try again, there may be more
            foundTag = true
          }
        }
      }
    } while (foundTag)

    return text
  }

  /**
   * Removes the mention text for a given ID.
   * @param id The ID of the mention to remove.
   * @returns The updated text.
   */
  public removeMentionText (id: string): string {
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
