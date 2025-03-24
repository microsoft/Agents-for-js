/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TurnContext } from '../turnContext'

export type Selector = (context: TurnContext) => Promise<boolean>

export type RouteSelector = Selector
