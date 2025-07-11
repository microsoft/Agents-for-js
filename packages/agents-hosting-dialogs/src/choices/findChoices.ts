/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { findValues, FindValuesOptions, FoundValue, SortedValue } from './findValues'
import { ModelResult } from './modelResult'
import { Choice } from './choice'

export interface FindChoicesOptions extends FindValuesOptions {
  /**
   * If true, the value of the choice will not be included in the search.
   */
  noValue?: boolean;

  /**
   * If true, the action title of the choice will not be included in the search.
   */
  noAction?: boolean;

  /**
   * If true, numbers will be recognized as choices.
   */
  recognizeNumbers?: boolean;

  /**
   * If true, ordinals (e.g., first, second) will be recognized as choices.
   */
  recognizeOrdinals?: boolean;
}

/**
 * Represents a choice that was found and matched within a user's utterance.
 * This interface contains information about the matched choice, including its
 * original value, position in the choices list, confidence score, and the
 * specific text that triggered the match.
 */
export interface FoundChoice {
  /**
   * The original value of the choice that was matched. This is the canonical
   * value from the choice list, not the text that was actually found in the utterance.
   */
  value: string;

  /**
   * The zero-based index of this choice in the original choices array that was
   * passed to the findChoices function. This allows you to map back to the
   * original choice object if needed.
   */
  index: number;

  /**
   * A confidence score between 0.0 and 1.0 indicating how well the found text
   * matches the choice. Higher scores indicate better matches, with 1.0 being
   * a perfect match.
   */
  score: number;

  /**
   * The specific text or synonym that was actually matched in the user's utterance.
   * This may be different from the choice's value if the match was made against
   * a synonym, action title, or alternative representation of the choice.
   */
  synonym?: string;
}

/**
 * Mid-level search function for recognizing a choice in an utterance.
 *
 * @param utterance The text or user utterance to search over. For an incoming 'message' activity you can simply use `context.activity.text`.
 * @param choices List of choices to search over.
 * @param options (Optional) options used to tweak the search that's performed.
 * @returns A list of found choices, sorted by most relevant first.
 */
export function findChoices (
  utterance: string,
  choices: (string | Choice)[],
  options?: FindChoicesOptions
): ModelResult<FoundChoice>[] {
  const opt: FindChoicesOptions = options || {}

  const list: Choice[] = (choices || []).map((choice) =>
    typeof choice === 'string' ? { value: choice } : choice
  )

  const synonyms: SortedValue[] = []
  list.forEach((choice: Choice, index: number) => {
    if (!opt.noValue) {
      synonyms.push({ value: choice.value, index })
    }
    if (choice.action && choice.action.title && !opt.noAction) {
      synonyms.push({ value: choice.action.title, index })
    }
    (choice.synonyms || []).forEach((synonym: string) => synonyms.push({ value: synonym, index }))
  })

  return findValues(utterance, synonyms, options).map((v: ModelResult<FoundValue>) => {
    const choice: Choice = list[v.resolution.index]

    return {
      start: v.start,
      end: v.end,
      typeName: 'choice',
      text: v.text,
      resolution: {
        value: choice.value,
        index: v.resolution.index,
        score: v.resolution.score,
        synonym: v.resolution.value,
      },
    } as ModelResult<FoundChoice>
  })
}
