// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { TokenExchangeResource } from './tokenExchangeResource'
import { TokenPostResource } from './tokenPostResource'

export interface SigningResource {
  singingLink: string,
  tokenExchangeResource: TokenExchangeResource,
  tokenPostResource: TokenPostResource
}
