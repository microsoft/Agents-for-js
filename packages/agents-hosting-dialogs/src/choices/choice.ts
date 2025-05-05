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
  /**
   * The value of the choice, which is used to identify the choice.
   */
  value: string;

  /**
   * An optional action associated with the choice, such as a button click.
   */
  action?: CardAction;

  /**
   * Optional synonyms that can be used to recognize the choice.
   */
  synonyms?: string[];
}
