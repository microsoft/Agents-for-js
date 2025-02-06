// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { CardAction } from '@microsoft/agents-activity-schema'
import { TokenExchangeResource } from './tokenExchangeResource'
import { TokenPostResource } from './tokenPostResource'

export interface OAuthCard {
  buttons: CardAction[]
  connectionName: string
  text: string
  tokenExchangeResource: TokenExchangeResource
  tokenPostResource: TokenPostResource
}
