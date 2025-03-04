/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { findValues, FindValuesOptions, FoundValue, SortedValue } from './findValues'
import { ModelResult } from './modelResult'
import { Choice } from './choice'

export interface FindChoicesOptions extends FindValuesOptions {
  /**
     * (Optional) If `true`, the choices `value` field will NOT be search over. Defaults to `false`.
     */
  noValue?: boolean;

  /**
     * (Optional) If `true`, the the choices `action.title` field will NOT be searched over.
     * Defaults to `false`.
     */
  noAction?: boolean;

  /**
     * (Optional) Default is `true`.  If `false`, the Number Model will not be used to check the utterance for numbers.
     */
  recognizeNumbers?: boolean;

  /**
     * (Optional) Default is `true`.  If `false`, the Ordinal Model will not be used to check the utterance for ordinal numbers.
     */
  recognizeOrdinals?: boolean;
}

export interface FoundChoice {
  value: string;
  index: number;
  score: number;
  synonym?: string;
}

/**
 * Mid-level search function for recognizing a choice in an utterance.
 *
 * @remarks
 * This function is layered above `findValues()` and simply determines all of the synonyms that
 * should be searched for before calling `findValues()` to perform the actual search. The
 * `recognizeChoices()` function is layered above this function and adds the ability to select a
 * choice by index or ordinal position in the list. Calling this particular function is useful
 * when you don't want the index and ordinal position recognition done by `recognizeChoices()`.
 *
 * ```TypeScript
 * const { findChoices } = require('botbuilder-choices');
 *
 * const choices = ['red', 'green', 'blue'];
 * const utterance = context.activity.text;
 * const results = findChoices(utterance, choices);
 * if (results.length == 1) {
 *     await context.sendActivity(`I like ${results[0].resolution.value} too!`);
 * } else if (results.length > 1) {
 *     const ambiguous = results.map((r) => r.resolution.value);
 *     await context.sendActivity(ChoiceFactory.forChannel(context, ambiguous, `Which one?`));
 * } else {
 *     await context.sendActivity(ChoiceFactory.forChannel(context, choices, `I didn't get that... Which color?`));
 * }
 * ```
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

  // Normalize choices
  const list: Choice[] = (choices || []).map((choice) =>
    typeof choice === 'string' ? { value: choice } : choice
  )

  // Build up full list of synonyms to search over.
  // - Each entry in the list contains the index of the choice it belongs to which will later be
  //   used to map the search results back to their choice.
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

  // Find synonyms in utterance and map back to their choices
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
