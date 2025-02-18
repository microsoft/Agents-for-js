/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TokenExchangeInvokeRequest } from './tokenExchangeInvokeRequest'

export interface AdaptiveCardAuthentication extends TokenExchangeInvokeRequest {
  // No-op. This interface was accidentally created as a duplicate of TokenExchangeInvokeRequest but must remain for backwards-compatibility.
}
