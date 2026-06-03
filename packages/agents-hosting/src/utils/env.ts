// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/**
 * Internal helpers for parsing environment-variable strings into typed values.
 *
 * These helpers are intentionally NOT exported from the package's public
 * `index.ts`; they are an internal utility shared between the adapter,
 * authentication, and connector-client modules. Keeping them internal lets us
 * normalize behavior across the package without growing the public API.
 */

/**
 * Parses an environment-variable string into a boolean.
 *
 * Recognized truthy values (case-insensitive, trimmed): `"true"`, `"1"`.
 * Recognized falsy values (case-insensitive, trimmed): `"false"`, `"0"`.
 * Returns `undefined` for unset (`undefined`), empty strings, or any other
 * value, so callers can distinguish "not specified" from explicit `false`.
 *
 * @param value - The raw environment variable value (typically
 *   `process.env.X`).
 * @returns `true`, `false`, or `undefined` when the value is unset or
 *   unrecognized.
 */
export function parseBooleanEnv (value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined
  const v = value.trim().toLowerCase()
  if (v === 'true' || v === '1') return true
  if (v === '') return undefined
  if (v === 'false' || v === '0') return false
  return undefined
}

/**
 * Parses an environment-variable string into an integer, returning the
 * supplied fallback for unset, empty, or non-numeric values.
 *
 * @param value - The raw environment variable value.
 * @param fallback - The value to return when the input is unset or invalid.
 * @returns A finite integer, or `fallback` when the input cannot be parsed.
 */
export function parseIntEnv (value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback
  const parsed = parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

/**
 * Returns the candidate from `candidates` that is closest to `input` by
 * Levenshtein edit distance, provided the distance is no greater than
 * `maxDistance`. Returns `undefined` when no candidate is close enough or the
 * input is empty.
 *
 * Intended for "did you mean X?" hints on unknown configuration keys.
 * Comparison is case-insensitive so casing differences alone never count as
 * an edit. Ties are broken by the order in which candidates appear.
 *
 * In addition to `maxDistance`, the match must be within 50% of the input
 * length (rounded up). This prevents confident-but-wrong suggestions on
 * short inputs (e.g., a 4-char typo matching a 6-char canonical name).
 *
 * @param input - The unknown name supplied by the user.
 * @param candidates - The set of known valid names.
 * @param maxDistance - Maximum edit distance to consider a match (default 2).
 */
export function suggestClosest (
  input: string,
  candidates: readonly string[],
  maxDistance = 2
): string | undefined {
  if (!input) return undefined
  const a = input.toLowerCase()
  const cutoff = Math.min(maxDistance, Math.max(1, Math.ceil(a.length / 2)))
  let best: { name: string, distance: number } | undefined
  for (const candidate of candidates) {
    const d = levenshtein(a, candidate.toLowerCase())
    if (d <= cutoff && (!best || d < best.distance)) {
      best = { name: candidate, distance: d }
      if (d === 0) break
    }
  }
  return best?.name
}

/** Standard Levenshtein edit distance using a single-row dynamic-programming table. */
function levenshtein (a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const row = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) row[j] = j
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j]
      row[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, row[j - 1], row[j])
      prev = temp
    }
  }
  return row[b.length]
}
