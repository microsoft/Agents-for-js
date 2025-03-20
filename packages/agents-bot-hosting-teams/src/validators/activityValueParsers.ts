/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'
import { activityZodSchema, AdaptiveCardInvokeAction, adaptiveCardInvokeActionZodSchema } from '@microsoft/agents-bot-hosting'
import { MessagingExtensionQuery, messagingExtensionQueryZodSchema } from '../messaging-extension'
import { adaptiveCardsSearchParamsZodSchema } from '../adaptive-cards'

/**
 * Validates the given value as a value action.
 *
 * @param {unknown} value - The value to validate.
 * @returns {string} - The validated value action.
 */
export function parseValueAction (value: unknown): string {
  const valueActionZodSchema = z.object({
    action: z.string().min(1)
  })
  valueActionZodSchema.passthrough().parse(value)
  return value as string
}

/**
 * Validates the given value as a value action name.
 *
 * @param {unknown} value - The value to validate.
 * @returns {string} - The validated value action name.
 */
export function parseValueActionName (value: unknown): string {
  const valueActionNameZodSchema = z.object({
    actionName: z.string().min(1),
  })
  valueActionNameZodSchema.passthrough().parse(value)
  return value as string
}

/**
 * Validates the given value as a value continuation.
 *
 * @param {unknown} value - The value to validate.
 * @returns {string} - The validated value continuation.
 */
export function parseValueContinuation (value: unknown): string {
  const valueContinuationZodSchema = z.object({
    continuation: z.string().min(1)
  })
  valueContinuationZodSchema.passthrough().parse(value)
  return value as string
}

/**
 * Validates the given value as a value action execute selector.
 *
 * @param {unknown} value - The value to validate.
 * @returns {object} - The validated value action execute selector.
 */
export function parseValueActionExecuteSelector (value: unknown) {
  const actionZodSchema = z.object({
    type: z.string().min(1),
    verb: z.string().min(1)
  })
  const actionValueExecuteSelector = z.object({
    action: actionZodSchema
  })
  const parsedValue = actionValueExecuteSelector.passthrough().parse(value)
  return parsedValue
}

/**
 * Validates the given value as a dataset.
 *
 * @param {unknown} value - The value to validate.
 * @returns {object} - The validated dataset.
 */
export function parseValueDataset (value: unknown) {
  const datasetZodSchema = z.object({
    dataset: z.string().min(1)
  })
  const parsedValue = datasetZodSchema.passthrough().parse(value)
  return {
    dataset: parsedValue.dataset
  }
}

/**
 * Validates the given value as action feedback loop data.
 *
 * @param {unknown} value - The value to validate.
 * @returns {object} - The validated action feedback loop data.
 */
export function parseValueActionFeedbackLoopData (value: unknown): {
  actionValue: {
    reaction: 'like' | 'dislike';
    feedback: string | Record<string, any>;
  }
} {
  const feedbackLoopDataActionValueZodSchema = z.object({
    actionValue: z.object({
      reaction: z.union([z.literal('like'), z.literal('dislike')]),
      feedback: z.union([z.string().min(1), z.record(z.string(), z.any())])
    })
  })
  const parsedValue = feedbackLoopDataActionValueZodSchema.passthrough().parse(value)
  return {
    actionValue: {
      reaction: parsedValue.actionValue.reaction,
      feedback: parsedValue.actionValue.feedback
    }
  }
}

/**
 * Validates the given value as an adaptive card invoke action.
 *
 * @param {unknown} value - The value to validate.
 * @returns {AdaptiveCardInvokeAction} - The validated adaptive card invoke action.
 */
export function parseAdaptiveCardInvokeAction (value: unknown) {
  adaptiveCardInvokeActionZodSchema.passthrough().parse(value)
  return value as AdaptiveCardInvokeAction
}

/**
 * Validates the given value as a search query.
 *
 * @param {unknown} value - The value to validate.
 * @returns {object} - The validated search query.
 */
export function parseValueSearchQuery (value: unknown) {
  const queryOptionsZodSchema = z.object({
    top: z.number(),
    skip: z.number(),
  })
  const searchValueZodSchema = adaptiveCardsSearchParamsZodSchema.extend({
    queryOptions: queryOptionsZodSchema
  })
  const validSearchValue = searchValueZodSchema.passthrough().parse(value)
  return {
    queryOptions: {
      top: validSearchValue.queryOptions.top,
      skip: validSearchValue.queryOptions.skip
    },
    queryText: validSearchValue.queryText,
    dataset: validSearchValue.dataset
  }
}

/**
 * Validates the given value as a query.
 *
 * @param {unknown} value - The value to validate.
 * @returns {object} - The validated query.
 */
export function parseValueQuery (value: unknown) {
  const urlZodSchema = z.object({
    url: z.string().min(1)
  })
  const parsedValue = urlZodSchema.passthrough().parse(value)
  return {
    url: parsedValue.url
  }
}

/**
 * Validates the given value as a bot message preview action.
 *
 * @param {unknown} value - The value to validate.
 * @returns {object} - The validated bot message preview action.
 */
export function parseValueBotMessagePreviewAction (value: unknown) {
  const botMessagePreviewActionZodSchema = z.object({
    botMessagePreviewAction: z.string().min(1)
  })
  const parsedValue = botMessagePreviewActionZodSchema.passthrough().parse(value)
  return {
    botMessagePreviewAction: parsedValue.botMessagePreviewAction
  }
}

/**
 * Validates the given value as a bot activity preview.
 *
 * @param {unknown} value - The value to validate.
 * @returns {object} - The validated bot activity preview.
 */
export function parseValueBotActivityPreview (value: unknown) {
  const botActivityPreviewZodSchema = z.object({
    botActivityPreview: z.array(activityZodSchema.partial())
  })
  const parsedValue = botActivityPreviewZodSchema.passthrough().parse(value)
  return {
    botActivityPreview: parsedValue.botActivityPreview
  }
}

/**
 * Validates the given value as a command ID.
 *
 * @param {unknown} value - The value to validate.
 * @returns {object} - The validated command ID.
 */
export function parseValueCommandId (value: unknown) {
  const commandIdZodSchema = z.object({
    commandId: z.string().min(1)
  })
  const parsedValue = commandIdZodSchema.passthrough().parse(value)
  return {
    commandId: parsedValue.commandId
  }
}

/**
 * Validates the given value as a messaging extension query.
 *
 * @param {unknown} value - The value to validate.
 * @returns {MessagingExtensionQuery} - The validated messaging extension query.
 */
export function parseValueMessagingExtensionQuery (value: unknown): MessagingExtensionQuery {
  messagingExtensionQueryZodSchema.passthrough().parse(value)
  return value as MessagingExtensionQuery
}
