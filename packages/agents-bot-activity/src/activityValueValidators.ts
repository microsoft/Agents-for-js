/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'
import { adaptiveCardsSearchParamsZodSchema } from './adaptive-cards/adaptiveCardsSearchParams'
import { activityZodSchema } from './activity'
import { AdaptiveCardInvokeAction, adaptiveCardInvokeActionZodSchema } from './invoke/adaptiveCardInvokeAction'
import { MessagingExtensionQuery, messagingExtensionQueryZodSchema } from './messaging-extension/messagingExtensionQuery'

export function validateValueAction (value: unknown): string {
  const valueActionZodSchema = z.object({
    action: z.string().min(1)
  })
  valueActionZodSchema.passthrough().parse(value)
  return value as string
}

export function validateValueActionName (value: unknown): string {
  const valueActionNameZodSchema = z.object({
    actionName: z.string().min(1),
  })
  valueActionNameZodSchema.passthrough().parse(value)
  return value as string
}

export function validateValueContinuation (value: unknown): string {
  const valueContinuationZodSchema = z.object({
    continuation: z.string().min(1)
  })
  valueContinuationZodSchema.passthrough().parse(value)
  return value as string
}

export function validateValueActionExecuteSelector (value: unknown) {
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

export function validateValueDataset (value: unknown) {
  const datasetZodSchema = z.object({
    dataset: z.string().min(1)
  })
  const parsedValue = datasetZodSchema.passthrough().parse(value)
  return {
    dataset: parsedValue.dataset
  }
}

export function validateValueActionFeedbackLoopData (value: unknown): {
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

export function validateAdaptiveCardInvokeAction (value: unknown) {
  adaptiveCardInvokeActionZodSchema.passthrough().parse(value)
  return value as AdaptiveCardInvokeAction
}

export function validateValueSearchQuery (value: unknown) {
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

export function validateValueQuery (value: unknown) {
  const urlZodSchema = z.object({
    url: z.string().min(1)
  })
  const parsedValue = urlZodSchema.passthrough().parse(value)
  return {
    url: parsedValue.url
  }
}

export function validatetValueBotMessagePreviewAction (value: unknown) {
  const botMessagePreviewActionZodSchema = z.object({
    botMessagePreviewAction: z.string().min(1)
  })
  const parsedValue = botMessagePreviewActionZodSchema.passthrough().parse(value)
  return {
    botMessagePreviewAction: parsedValue.botMessagePreviewAction
  }
}

export function validateValueBotActivityPreview (value: unknown) {
  const botActivityPreviewZodSchema = z.object({
    botActivityPreview: z.array(activityZodSchema.partial())
  })
  const parsedValue = botActivityPreviewZodSchema.passthrough().parse(value)
  return {
    botActivityPreview: parsedValue.botActivityPreview
  }
}

export function validateValueCommandId (value: unknown) {
  const commandIdZodSchema = z.object({
    commandId: z.string().min(1)
  })
  const parsedValue = commandIdZodSchema.passthrough().parse(value)
  return {
    commandId: parsedValue.commandId
  }
}

export function validateValueMessagingExtensionQuery (value: unknown): MessagingExtensionQuery {
  messagingExtensionQueryZodSchema.passthrough().parse(value)
  return value as MessagingExtensionQuery
}
