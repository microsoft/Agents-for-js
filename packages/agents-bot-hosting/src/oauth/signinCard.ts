// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { CardAction } from '../../../agents-bot-activity/dist/src'

export interface SigninCard {
  text?: string
  buttons: CardAction[]
}
