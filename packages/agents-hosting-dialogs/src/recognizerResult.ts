/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IntentScore } from './intentScore'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from './errorHelper'

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

/**
 * Finds the intent with the highest confidence score from a recognizer result.
 *
 * @param result - The recognizer result containing intents and their scores
 * @returns An object containing the top-scoring intent name and its confidence score
 * @throws {Error} Throws an error if the result is empty or doesn't contain intents
 *
 * @remarks
 * This function iterates through all intents in the recognizer result and returns
 * the intent name and score for the intent with the highest confidence score.
 * If multiple intents have the same highest score, the last one encountered is returned.
 *
 * @example
 * ```typescript
 * const result: RecognizerResult = {
 *   text: "Book a flight to Seattle",
 *   intents: {
 *     "BookFlight": { score: 0.95 },
 *     "Cancel": { score: 0.02 },
 *     "Help": { score: 0.03 }
 *   }
 * };
 *
 * const topIntent = getTopScoringIntent(result);
 * // Returns: { intent: "BookFlight", score: 0.95 }
 * ```
 *
 */
export const getTopScoringIntent = (result: RecognizerResult): { intent: string; score: number } => {
  if (!result || !result.intents) {
    throw ExceptionHelper.generateException(
      Error,
      Errors.EmptyRecognizerResult
    )
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
