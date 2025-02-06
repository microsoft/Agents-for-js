/** * Copyright (c) Microsoft Corporation. All rights reserved. * Licensed under the MIT License. */
import { INVOKE_RESPONSE_KEY } from './activityHandler'
import { BotAdapter } from './botAdapter'
import { Activity, ActivityTypes, ConversationReference, DeliveryModes, InputHints } from '@microsoft/agents-activity-schema'
import { ResourceResponse } from './connector-client/resourceResponse'
import { TurnContextStateCollection } from './turnContextStateCollection'
import { AttachmentInfo } from './connector-client/attachmentInfo'
import { AttachmentData } from './connector-client/attachmentData'

/**
 * Defines a handler for sending activities.
 */
export type SendActivitiesHandler = (context: TurnContext, activities: Activity[], next: () => Promise<ResourceResponse[]>) => Promise<ResourceResponse[]>

/**
 * Defines a handler for updating an activity.
 */
export type UpdateActivityHandler = (context: TurnContext, activity: Activity, next: () => Promise<void>) => Promise<void>

/**
 * Defines a handler for deleting an activity.
 */
export type DeleteActivityHandler = (context: TurnContext, reference: ConversationReference, next: () => Promise<void>) => Promise<void>

/**
 * Key for the bot callback handler.
 */
export const BotCallbackHandlerKey = 'botCallbackHandler'

/**
 * Interface for TurnContext.
 */
export interface TurnContext {}

/**
 * Represents the context object for a turn of a bot.
 */
export class TurnContext {
  private readonly _adapter?: BotAdapter
  private readonly _activity?: Activity
  private readonly _respondedRef: { responded: boolean } = { responded: false }
  private readonly _turnState = new TurnContextStateCollection()
  private readonly _onSendActivities: SendActivitiesHandler[] = []
  private readonly _onUpdateActivity: UpdateActivityHandler[] = []
  private readonly _onDeleteActivity: DeleteActivityHandler[] = []
  private readonly _turn = 'turn'
  private readonly _locale = 'locale'

  /**
   * Initializes a new instance of the TurnContext class.
   * @param adapterOrContext The adapter or context for the turn.
   * @param request The activity for the turn.
   */
  constructor (adapterOrContext: BotAdapter, request: Activity)
  constructor (adapterOrContext: TurnContext)
  constructor (adapterOrContext: BotAdapter | TurnContext, request?: Activity) {
    if (adapterOrContext instanceof TurnContext) {
      adapterOrContext.copyTo(this)
    } else {
      this._adapter = adapterOrContext
      this._activity = request as Activity
    }
  }

  /**
   * A list of buffered reply activities.
   */
  readonly bufferedReplyActivities: Activity[] = []

  /**
   * Sends a trace activity.
   * @param name The name of the trace activity.
   * @param value The value of the trace activity.
   * @param valueType The value type of the trace activity.
   * @param label The label of the trace activity.
   * @returns The resource response.
   */
  async sendTraceActivity (name: string, value?: any, valueType?: string, label?: string): Promise<ResourceResponse | undefined> {
    const traceActivityObj = {
      type: ActivityTypes.Trace,
      timestamp: new Date().toISOString(),
      name,
      value,
      valueType,
      label
    }
    const traceActivity = Activity.fromObject(traceActivityObj)
    return await this.sendActivity(traceActivity)
  }

  /**
   * Sends an activity.
   * @param activityOrText The activity or text to send.
   * @param speak The text to speak.
   * @param inputHint The input hint.
   * @returns The resource response.
   */
  async sendActivity (activityOrText: string | Activity, speak?: string, inputHint?: string): Promise<ResourceResponse | undefined> {
    let activityObject: {}
    if (typeof activityOrText === 'string') {
      activityObject = { type: ActivityTypes.Message, text: activityOrText, inputHint: inputHint || InputHints.AcceptingInput }
      if (speak) {
        activityObject = { ...activityObject, speak }
      }
    } else {
      activityObject = activityOrText
    }
    const activity = Activity.fromObject(activityObject)

    const responses = (await this.sendActivities([activity])) || []
    return responses[0]
  }

  /**
   * Sends multiple activities.
   * @param activities The activities to send.
   * @returns The resource responses.
   */
  async sendActivities (activities: Activity[]): Promise<ResourceResponse[]> {
    let sentNonTraceActivity = false
    const ref = this.activity.getConversationReference()
    const output = activities.map((activity) => {
      const result = activity.applyConversationReference(ref)
      if (!result.type) {
        result.type = ActivityTypes.Message
      }
      if (result.type === ActivityTypes.InvokeResponse) {
        this.turnState.set(INVOKE_RESPONSE_KEY, activity)
      }
      if (result.type !== ActivityTypes.Trace) {
        sentNonTraceActivity = true
      }
      if (result.id) {
        delete result.id
      }
      return result
    })
    return await this.emit(this._onSendActivities, output, async () => {
      if (this.activity.deliveryMode === DeliveryModes.ExpectReplies) {
        const responses: ResourceResponse[] = []
        output.forEach((a) => {
          this.bufferedReplyActivities.push(a)
          if (a.type === ActivityTypes.InvokeResponse) {
            this.turnState.set(INVOKE_RESPONSE_KEY, a)
          }
          responses.push({ id: '' })
        })
        if (sentNonTraceActivity) {
          this.responded = true
        }
        return responses
      } else {
        const responses = await this.adapter.sendActivities(this, output)
        for (let index = 0; index < responses?.length; index++) {
          const activity = output[index]
          activity.id = responses[index].id
        }
        if (sentNonTraceActivity) {
          this.responded = true
        }
        return responses
      }
    })
  }

  /**
   * Updates an activity.
   * @param activity The activity to update.
   * @returns A promise representing the asynchronous operation.
   */
  async updateActivity (activity: Activity): Promise<void> {
    const ref: ConversationReference = this.activity.getConversationReference()
    const a: Activity = activity.applyConversationReference(ref)
    return await this.emit(this._onUpdateActivity, a, async () =>
      await this.adapter.updateActivity(this, a).then(() => {})
    )
  }

  /**
   * Deletes an activity.
   * @param idOrReference The ID or reference of the activity to delete.
   * @returns A promise representing the asynchronous operation.
   */
  async deleteActivity (idOrReference: string | ConversationReference): Promise<void> {
    let reference: ConversationReference
    if (typeof idOrReference === 'string') {
      reference = this.activity.getConversationReference()
      reference.activityId = idOrReference
    } else {
      reference = idOrReference
    }
    return await this.emit(this._onDeleteActivity, reference, async () => await this.adapter.deleteActivity(this, reference))
  }

  /**
   * Uploads an attachment.
   * @param conversationId The conversation ID.
   * @param attachmentData The attachment data.
   * @returns The resource response.
   */
  async uploadAttachment (conversationId: string, attachmentData: AttachmentData): Promise<ResourceResponse> {
    return await this.adapter.uploadAttachment(conversationId, attachmentData)
  }

  /**
   * Gets attachment information.
   * @param attachmentId The attachment ID.
   * @returns The attachment information.
   */
  async getAttachmentInfo (attachmentId: string): Promise<AttachmentInfo> {
    return await this.adapter.getAttachmentInfo(attachmentId)
  }

  /**
   * Gets an attachment.
   * @param attachmentId The attachment ID.
   * @param viewId The view ID.
   * @returns The readable stream of the attachment.
   */
  async getAttachment (attachmentId: string, viewId: string): Promise<NodeJS.ReadableStream> {
    return await this.adapter.getAttachment(attachmentId, viewId)
  }

  /**
   * Registers a handler for sending activities.
   * @param handler The handler to register.
   * @returns The current TurnContext instance.
   */
  onSendActivities (handler: SendActivitiesHandler): this {
    this._onSendActivities.push(handler)
    return this
  }

  /**
   * Registers a handler for updating activities.
   * @param handler The handler to register.
   * @returns The current TurnContext instance.
   */
  onUpdateActivity (handler: UpdateActivityHandler): this {
    this._onUpdateActivity.push(handler)
    return this
  }

  /**
   * Registers a handler for deleting activities.
   * @param handler The handler to register.
   * @returns The current TurnContext instance.
   */
  onDeleteActivity (handler: DeleteActivityHandler): this {
    this._onDeleteActivity.push(handler)
    return this
  }

  /**
   * Copies the properties of this TurnContext to another TurnContext.
   * @param context The context to copy to.
   */
  protected copyTo (context: TurnContext): void {
    ['_adapter', '_activity', '_respondedRef', '_services', '_onSendActivities', '_onUpdateActivity', '_onDeleteActivity'].forEach((prop: string) => ((context as any)[prop] = (this as any)[prop]))
  }

  /**
   * Gets the adapter for the turn.
   */
  get adapter (): BotAdapter {
    return this._adapter as BotAdapter
  }

  /**
   * Gets the activity for the turn.
   */
  get activity (): Activity {
    return this._activity as Activity
  }

  /**
   * Gets or sets whether the turn has responded.
   */
  get responded (): boolean {
    return this._respondedRef.responded
  }

  set responded (value: boolean) {
    if (!value) {
      throw new Error("TurnContext: cannot set 'responded' to a value of 'false'.")
    }
    this._respondedRef.responded = true
  }

  /**
   * Gets or sets the locale for the turn.
   */
  get locale (): string | undefined {
    const turnObj = this._turnState.get(this._turn)
    if (turnObj && typeof turnObj[this._locale] === 'string') {
      return turnObj[this._locale]
    }
    return undefined
  }

  set locale (value: string | undefined) {
    let turnObj = this._turnState.get(this._turn)
    if (turnObj) {
      turnObj[this._locale] = value
    } else {
      turnObj = { [this._locale]: value }
      this._turnState.set(this._turn, turnObj)
    }
  }

  /**
   * Gets the turn state collection.
   */
  get turnState (): TurnContextStateCollection {
    return this._turnState
  }

  /**
   * Emits events to the registered handlers.
   * @param handlers The handlers to emit to.
   * @param arg The argument to pass to the handlers.
   * @param next The next function to call.
   * @returns The result of the handlers.
   */
  private async emit<A, T>(handlers: Array<(context: TurnContext, arg: A, next: () => Promise<T>) => Promise<T>>, arg: A, next: () => Promise<T>): Promise<T> {
    const runHandlers = async ([handler, ...remaining]: typeof handlers): Promise<T> => {
      try {
        return handler ? await handler(this, arg, async () => await runHandlers(remaining)) : await Promise.resolve(next())
      } catch (err) {
        return await Promise.reject(err)
      }
    }
    return await runHandlers(handlers)
  }
}
