/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
export interface Token {
  start: number;
  end: number;
  text: string;
  normalized: string;
}

/**
 * Signature for an alternate word breaker that can be passed to `recognizeChoices()`,
 * `findChoices()`, or `findValues()`.
 *
 * @remarks
 * The `defaultTokenizer()` is fairly simple and only breaks on spaces and punctuation.
 * @param TokenizerFunction.text The text to be tokenized.
 * @param TokenizerFunction.locale (Optional) locale of the text if known.
 */
export type TokenizerFunction = (text: string, locale?: string) => Token[]

/**
 * Simple tokenizer that breaks on spaces and punctuation.
 *
 * @param text The input text.
 * @param _locale Optional, identifies the locale of the input text.
 * @returns A list of tokens.
 * @remarks
 * The only normalization done is to lowercase the tokens. Developers can wrap this tokenizer with
 * their own function to perform additional normalization like [stemming](https://github.com/words/stemmer).
 */
export function defaultTokenizer (text: string, _locale?: string): Token[] {
  const tokens: Token[] = []
  let token: Token | undefined

  function appendToken (end: number): void {
    if (token) {
      token.end = end
      token.normalized = token.text.toLowerCase()
      tokens.push(token)
      token = undefined
    }
  }

  // Parse text
  const length: number = text ? text.length : 0
  let i = 0
  while (i < length) {
    // Get both the UNICODE value of the current character and the complete character itself
    // which can potentially be multiple segments.
    const codePoint: number = text.codePointAt(i) || text.charCodeAt(i)
    const chr: string = String.fromCodePoint(codePoint)

    // Process current character
    if (isBreakingChar(codePoint)) {
      // Character is in Unicode Plane 0 and is in an excluded block
      appendToken(i - 1)
    } else if (codePoint > 0xffff) {
      // Character is in a Supplementary Unicode Plane. This is where emoji live so
      // we're going to just break each character in this range out as its own token.
      appendToken(i - 1)
      tokens.push({
        start: i,
        end: i + (chr.length - 1),
        text: chr,
        normalized: chr,
      })
    } else if (!token) {
      // Start a new token
      token = { start: i, text: chr } as Token
    } else {
      // Add on to current token
      token.text += chr
    }
    i += chr.length
  }
  appendToken(length - 1)

  return tokens
}

/**
 * @private
 * @param codePoint number of character
 */
function isBreakingChar (codePoint: number): boolean {
  return (
    isBetween(codePoint, 0x0000, 0x002f) ||
        isBetween(codePoint, 0x003a, 0x0040) ||
        isBetween(codePoint, 0x005b, 0x0060) ||
        isBetween(codePoint, 0x007b, 0x00bf) ||
        isBetween(codePoint, 0x02b9, 0x036f) ||
        isBetween(codePoint, 0x2000, 0x2bff) ||
        isBetween(codePoint, 0x2e00, 0x2e7f)
  )
}

/**
 * @private
 * @param value number value
 * @param from low range
 * @param to high range
 */
function isBetween (value: number, from: number, to: number): boolean {
  return value >= from && value <= to
}
