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
  allowPartialMatches?: boolean;
  locale?: string;
  maxTokenDistance?: number;
  tokenizer?: TokenizerFunction;
}

export interface FoundValue {
  value: string;
  index: number;
  score: number;
}

export interface SortedValue {
  value: string;
  index: number;
}

/**
 * INTERNAL: Low-level function that searches for a set of values within an utterance. Higher level
 * functions like `findChoices()` and `recognizeChoices()` are layered above this function.  In most
 * cases its easier to just call one of the higher level functions instead but this function contains
 * the fuzzy search algorithm that drives choice recognition.
 *
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
