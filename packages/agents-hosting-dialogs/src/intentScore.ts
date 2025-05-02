/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Score plus any extra information about an intent.
 */
export interface IntentScore {
  /**
   * Optional. The confidence score of the intent, ranging from 0.0 to 1.0.
   */
  score?: number

  /**
   * Additional properties related to the intent.
   */
  [key: string]: unknown
}
