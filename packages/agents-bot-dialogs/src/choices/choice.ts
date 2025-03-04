/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CardAction } from '@microsoft/agents-bot-hosting'

/**
 * An instance of a choice that can be used to render a choice to a user or recognize something a
 * user picked.
 *
 * @remarks
 * The value will be rendered to a user unless an action is provided in which
 * case the actions `title` will be rendered to the user.
 *
 * At recognition time the `value` will always be what gets returned by `findChoices()` and
 * `recognizeChoices()`. By default, the users utterance will be compared against all of the
 * strings provided in the choice. You can disable it using the `value` and/or `action.title` during
 * recognition using the `FindChoicesOptions` structure.
 *
 * ```TypeScript
 * const choice = {
 *     value: 'red',
 *     action: {
 *         type: 'imBack',
 *         title: 'The Red Pill',
 *         value: 'red pill'
 *     },
 *     synonyms: ['crimson', 'scarlet', 'ruby', 'cherry']
 * };
 * ```
 */
export interface Choice {
  value: string;
  action?: CardAction;
  synonyms?: string[];
}
