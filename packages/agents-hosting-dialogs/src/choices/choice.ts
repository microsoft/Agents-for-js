/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CardAction } from '@microsoft/agents-activity'

/**
 * An instance of a choice that can be used to render a choice to a user or recognize something a
 * user picked.
 */
export interface Choice {
  value: string;
  action?: CardAction;
  synonyms?: string[];
}
