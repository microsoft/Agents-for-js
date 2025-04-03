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
 * Signature for an alternate word breaker.
 *
 * @param text The text to be tokenized.
 * @param locale (Optional) locale of the text if known.
 */
export type TokenizerFunction = (text: string, locale?: string) => Token[]

/**
 * Simple tokenizer that breaks on spaces and punctuation.
 *
 * @param text The input text.
 * @param _locale Optional, identifies the locale of the input text.
 * @returns A list of tokens.
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
    const codePoint: number = text.codePointAt(i) || text.charCodeAt(i)
    const chr: string = String.fromCodePoint(codePoint)

    if (isBreakingChar(codePoint)) {
      appendToken(i - 1)
    } else if (codePoint > 0xffff) {
      appendToken(i - 1)
      tokens.push({
        start: i,
        end: i + (chr.length - 1),
        text: chr,
        normalized: chr,
      })
    } else if (!token) {
      token = { start: i, text: chr } as Token
    } else {
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
