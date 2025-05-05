/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IntentScore } from './intentScore'

/**
 * Value returned from a recognizer.
 */
export interface RecognizerResult {
  /**
   * The original text input provided by the user.
   */
  text: string

  /**
   * Optional. The modified version of the text input, if applicable.
   */
  alteredText?: string

  /**
   * A mapping of intent names to their corresponding confidence scores.
   */
  intents: Record<string, IntentScore>

  /**
   * Optional. Entities recognized in the input, if any.
   */
  entities?: any

  /**
   * Additional properties that may be included in the recognizer result.
   */
  [propName: string]: any
}

export const getTopScoringIntent = (result: RecognizerResult): { intent: string; score: number } => {
  if (!result || !result.intents) {
    throw new Error('result is empty')
  }

  let topIntent = ''
  let topScore = -1
  for (const [intentName, intent] of Object.entries(result.intents)) {
    const score = intent.score ?? -1
    if (!topIntent || score > topScore) {
      topIntent = intentName
      topScore = score
    }
  }

  return {
    intent: topIntent,
    score: topScore,
  }
}
