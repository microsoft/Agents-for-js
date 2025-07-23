/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ModelResult } from './modelResult'
import { defaultTokenizer, Token, TokenizerFunction } from './tokenizer'

/**
 * Basic search options used to control how choices are recognized in a users utterance.
 */
export interface FindValuesOptions {
  /**
   * If true, allows partial matches of values in the search.
   */
  allowPartialMatches?: boolean;

  /**
   * The locale to use for tokenization and comparison.
   */
  locale?: string;

  /**
   * The maximum token distance allowed between matches.
   */
  maxTokenDistance?: number;

  /**
   * The tokenizer function to use for breaking the utterance into tokens.
   */
  tokenizer?: TokenizerFunction;
}

/**
 * Represents a value that was successfully found and matched during a search operation.
 *
 * @remarks
 * This interface contains the matched value along with metadata about the match quality
 * and its position in the original search list.
 *
 * @example
 * ```typescript
 * // Example of a FoundValue result from searching for "red" in ["red", "green", "blue"]
 * const foundValue: FoundValue = {
 *   value: "red",
 *   index: 0,
 *   score: 1.0
 * };
 * ```
 */
export interface FoundValue {
  /**
   * The exact value that was matched from the original search list.
   *
   * @remarks
   * This is the original string value, not the user's input that matched it.
   *
   * @example "red" (when user typed "rd" and it matched "red")
   */
  value: string;

  /**
   * The zero-based index position of this value in the original list that was searched.
   *
   * @remarks
   * This allows you to correlate the found value back to its position in the source array.
   *
   * @example 0 (if "red" was the first item in the original choices array)
   */
  index: number;

  /**
   * A confidence score between 0 and 1 indicating the quality of the match.
   *
   * @remarks
   * - 1.0 indicates a perfect exact match
   * - Lower values indicate partial or fuzzy matches
   * - Calculated based on completeness (how much of the value matched) and accuracy (token distance)
   *
   * @example 1.0 for exact matches, 0.8 for close partial matches, 0.3 for distant fuzzy matches
   */
  score: number;
}

/**
 * Represents a value with its original position that can be used in search operations.
 *
 * @remarks
 * This interface is used internally by the search algorithm to maintain the relationship
 * between search values and their original positions in the source array.
 *
 * @example
 * ```typescript
 * // Example of SortedValue objects created from a choices array
 * const choices = ["red", "green", "blue"];
 * const sortedValues: SortedValue[] = choices.map((value, index) => ({
 *   value,
 *   index
 * }));
 * // Results in:
 * // [
 * //   { value: "red", index: 0 },
 * //   { value: "green", index: 1 },
 * //   { value: "blue", index: 2 }
 * // ]
 * ```
 */
export interface SortedValue {
  /**
   * The string value to be searched for during matching operations.
   *
   * @remarks
   * This is the actual text content that will be compared against user input.
   *
   * @example "red", "green", "blue" when searching color choices
   */
  value: string;

  /**
   * The zero-based index position of this value in the original source array.
   *
   * @remarks
   * This allows the search algorithm to correlate found matches back to their
   * original positions, which is essential for maintaining proper choice selection.
   *
   * @example 0 for the first item, 1 for the second item, etc.
   */
  index: number;
}

/**
 * Low-level function that searches for a set of values within an utterance.
 *
 * @remarks
 * Higher level functions like `findChoices()` and `recognizeChoices()` are layered above this function.  In most
 * cases its easier to just call one of the higher level functions instead but this function contains
 * the fuzzy search algorithm that drives choice recognition.
 *
 * @internal
 * @param utterance The text or user utterance to search over.
 * @param values List of values to search over.
 * @param options (Optional) options used to tweak the search that's performed.
 * @returns A list of found values.
 */
export function findValues (
  utterance: string,
  values: SortedValue[],
  options?: FindValuesOptions
): ModelResult<FoundValue>[] {
  function indexOfToken (token: Token, startPos: number): number {
    for (let i: number = startPos; i < tokens.length; i++) {
      if (tokens[i].normalized === token.normalized) {
        return i
      }
    }

    return -1
  }

  function findExactMatch (utterance: string, values: SortedValue[]): ModelResult<FoundValue> | null {
    const entry = values.find(({ value }) => value.toLowerCase() === utterance.toLowerCase())
    if (!entry) {
      return null
    }
    return {
      text: utterance,
      start: 0,
      end: utterance.length - 1,
      typeName: 'value',
      resolution: {
        value: entry.value,
        index: entry.index,
        score: 1,
      },
    }
  }

  const exactMatch = findExactMatch(utterance, values)
  if (exactMatch) {
    return [exactMatch]
  }

  function matchValue (
    index: number,
    value: string,
    vTokens: Token[],
    startPos: number
  ): ModelResult<FoundValue> | undefined {
    let matched = 0
    let totalDeviation = 0
    let start = -1
    let end = -1
    vTokens.forEach((token: Token) => {
      const pos: number = indexOfToken(token, startPos)
      if (pos >= 0) {
        const distance: number = matched > 0 ? pos - startPos : 0
        if (distance <= maxDistance) {
          matched++
          totalDeviation += distance
          startPos = pos + 1

          if (start < 0) {
            start = pos
          }
          end = pos
        }
      }
    })

    let result: ModelResult<FoundValue> | undefined
    if (matched > 0 && (matched === vTokens.length || opt.allowPartialMatches)) {
      const completeness: number = matched / vTokens.length

      const accuracy: number = matched / (matched + totalDeviation)

      const score: number = completeness * accuracy

      result = {
        start,
        end,
        typeName: 'value',
        resolution: {
          value,
          index,
          score,
        },
      } as ModelResult<FoundValue>
    }

    return result
  }

  const list: SortedValue[] = values.sort((a: SortedValue, b: SortedValue) => b.value.length - a.value.length)

  let matches: ModelResult<FoundValue>[] = []
  const opt: FindValuesOptions = options || {}
  const tokenizer: TokenizerFunction = opt.tokenizer || defaultTokenizer
  const tokens: Token[] = tokenizer(utterance, opt.locale)
  const maxDistance: number = opt.maxTokenDistance !== undefined ? opt.maxTokenDistance : 2
  list.forEach((entry: SortedValue) => {
    let startPos = 0
    const vTokens: Token[] = tokenizer(entry.value.trim(), opt.locale)
    while (startPos < tokens.length) {
      const match = matchValue(entry.index, entry.value, vTokens, startPos)
      if (match) {
        startPos = match.end + 1
        matches.push(match)
      } else {
        break
      }
    }
  })

  matches = matches.sort(
    (a: ModelResult<FoundValue>, b: ModelResult<FoundValue>) => b.resolution.score - a.resolution.score
  )

  const results: ModelResult<FoundValue>[] = []
  const foundIndexes: { [index: number]: boolean } = {}
  const usedTokens: { [index: number]: boolean } = {}
  matches.forEach((match: ModelResult<FoundValue>) => {
    let add = !Object.prototype.hasOwnProperty.call(foundIndexes, match.resolution.index)
    for (let i: number = match.start; i <= match.end; i++) {
      if (usedTokens[i]) {
        add = false
        break
      }
    }

    if (add) {
      foundIndexes[match.resolution.index] = true
      for (let i: number = match.start; i <= match.end; i++) {
        usedTokens[i] = true
      }

      match.start = tokens[match.start].start
      match.end = tokens[match.end].end
      match.text = utterance.substring(match.start, match.end + 1)
      results.push(match)
    }
  })

  return results.sort((a: ModelResult<FoundValue>, b: ModelResult<FoundValue>) => a.start - b.start)
}
