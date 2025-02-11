// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { CardAction } from '../../../agents-bot-activity/dist/src'
import { TokenExchangeResource } from './tokenExchangeResource'
import { TokenPostResource } from './tokenPostResource'

export interface OAuthCard {
  buttons: CardAction[]
  connectionName: string
  text: string
  tokenExchangeResource: TokenExchangeResource
  tokenPostResource: TokenPostResource
}
