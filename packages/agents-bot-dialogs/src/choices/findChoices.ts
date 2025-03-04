/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { findValues, FindValuesOptions, FoundValue, SortedValue } from './findValues'
import { ModelResult } from './modelResult'
import { Choice } from './choice'

export interface FindChoicesOptions extends FindValuesOptions {
  noValue?: boolean;
  noAction?: boolean;
  recognizeNumbers?: boolean;
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
