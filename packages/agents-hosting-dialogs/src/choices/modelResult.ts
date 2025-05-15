/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents the result of a model recognition process.
 * @template T - The type of the resolution containing additional details about the match.
 */
export interface ModelResult<T extends Record<string, any> = {}> {
  /**
   * The text that was matched.
   */
  text: string;

  /**
   * The start index of the match in the input text.
   */
  start: number;

  /**
   * The end index of the match in the input text.
   */
  end: number;

  /**
   * The type of the recognized model result.
   */
  typeName: string;

  /**
   * The resolution containing additional details about the match.
   */
  resolution: T;
}
