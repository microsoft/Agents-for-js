/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AuthConfiguration } from './authConfiguration'

export interface AuthProvider {
  getAccessToken: (authConfig: AuthConfiguration, scope: string) => Promise<string>
}
