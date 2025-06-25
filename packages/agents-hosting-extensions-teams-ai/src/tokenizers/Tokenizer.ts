/**
 * @module agents-hosting-extensions-teams-ai
 */
/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface Tokenizer {
  decode(tokens: number[]): string;
  encode(text: string): number[];
}
