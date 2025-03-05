/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TurnContext } from '../turnContext'

/**
 * A selector function for matching incoming activities.
 */
export type Selector = (context: TurnContext) => Promise<boolean>

/**
 * Function for selecting whether a route handler should be triggered.
 * @param context Context for the current turn of conversation with the user.
 * @returns A promise that resolves with a boolean indicating whether the route handler should be triggered.
 */
export type RouteSelector = Selector
