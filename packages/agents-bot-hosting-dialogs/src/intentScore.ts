/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Score plus any extra information about an intent.
 */
export interface IntentScore {
  score?: number;
  [key: string]: unknown;
}
