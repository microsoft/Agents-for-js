/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AdaptiveCardInvokeAction } from '@microsoft/agents-activity-schema'
import { AdaptiveCardAuthentication } from './adaptiveCardAuthentication'

export interface AdaptiveCardInvokeValue {
  action: AdaptiveCardInvokeAction
  authentication: AdaptiveCardAuthentication
  state: string
}
