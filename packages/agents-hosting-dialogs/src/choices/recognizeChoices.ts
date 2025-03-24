/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { findChoices, FindChoicesOptions, FoundChoice } from './findChoices'
import { ModelResult } from './modelResult'
import { Choice } from './choice'
import { debug } from '@microsoft/agents-hosting'

const logger = debug('dialogs:recognizeChoices')

/**
 * High level function for recognizing a choice in a users utterance.
 *
 * @param utterance The text or user utterance to search over. For an incoming 'message' activity you can simply use `context.activity.text`.
 * @param choices List of choices to search over.
 * @param options (Optional) options used to tweak the search that's performed.
 * @returns A list of found choices, sorted by most relevant first.
 */
export function recognizeChoices (
  utterance: string,
  choices: (string | Choice)[],
  options?: FindChoicesOptions
): ModelResult<FoundChoice>[] {
  function matchChoiceByIndex (match: ModelResult<any>): void {
    try {
      const index: number = parseInt(match.resolution.value, 10) - 1
      if (index >= 0 && index < list.length) {
        const choice: Choice = list[index]
        matched.push({
          start: match.start,
          end: match.end,
          typeName: 'choice',
          text: match.text,
          resolution: {
            value: choice.value,
            index,
            score: 1,
          },
        })
      }
    } catch (error: any) {
      logger.error('Error: ', error)
      throw error
    }
  }

  // Initialize options
  options = Object.assign(
    {
      locale: 'en-us',
      recognizeNumbers: true,
      recognizeOrdinals: true,
    } as FindChoicesOptions,
    options
  )

  // Normalize choices
  const list: Choice[] = (choices || [])
    .map((choice) => (typeof choice === 'string' ? { value: choice } : choice))
    .filter(
      (choice: Choice) => choice // TODO: does this do anything?
    )

  // Try finding choices by text search first
  // - We only want to use a single strategy for returning results to avoid issues where utterances
  //   like the "the third one" or "the red one" or "the first division book" would miss-recognize as
  //   a numerical index or ordinal as well.
  let matched: ModelResult<FoundChoice>[] = findChoices(utterance, list, options)
  if (matched.length === 0) {
    // Next try finding by ordinal
    if (options.recognizeOrdinals) {
      // TODO: Review recognizeOrdinal function
      // const ordinals: ModelResult[] = Recognizers.recognizeOrdinal(utterance, options.locale ?? '')
      const ordinals: ModelResult[] = []
      ordinals.forEach(matchChoiceByIndex)
    }

    // Finally try by numerical index
    if (matched.length === 0 && options.recognizeNumbers) {
      // TODO: Review recognizeNumber function
      // const numbers: ModelResult[] = Recognizers.recognizeNumber(utterance, options.locale ?? '').forEach(matchChoiceByIndex)
      const numbers: ModelResult[] = []
      numbers.forEach(matchChoiceByIndex)
    }

    // Sort any found matches by their position within the utterance.
    // - The results from findChoices() are already properly sorted so we just need this
    //   for ordinal & numerical lookups.
    matched = matched.sort((a: ModelResult<FoundChoice>, b: ModelResult<FoundChoice>) => a.start - b.start)
  }

  return matched
}
