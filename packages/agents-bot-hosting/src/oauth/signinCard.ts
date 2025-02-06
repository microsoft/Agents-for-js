// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { CardAction } from '@microsoft/agents-activity-schema'

export interface SigninCard {
  text?: string
  buttons: CardAction[]
}
