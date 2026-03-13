/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConnectionSettings } from './connectionSettings'
import { getTokenAudience } from './powerPlatformEnvironment'

/**
 * Utility class for generating authentication scope URLs for Copilot Studio.
 */
export class ScopeHelper {
  /**
   * Returns the scope URL needed to connect to Copilot Studio from the connection settings.
   * This is used for authentication token audience configuration.
   * @param settings Copilot Studio connection settings.
   * @returns The scope URL for token audience (e.g., "https://api.powerplatform.com/.default").
   */
  static getScopeFromSettings (settings: ConnectionSettings): string {
    return getTokenAudience(settings)
  }
}
