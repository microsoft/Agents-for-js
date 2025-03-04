/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BotType } from './botType'
import { PowerPlatformCloud } from './powerPlatformCloud'

/**
 * Represents the settings required to establish a direct connection to the engine.
 */
export interface DirectToEngineConnectionSettings {
  /** The identifier of the bot. */
  botIdentifier: string
  /** The custom Power Platform cloud URL. */
  customPowerPlatformCloud: string
  /** The environment ID of the application. */
  environmentId: string
  /** The cloud environment of the application. */
  cloud: PowerPlatformCloud
  /** The type of the Copilot bot. */
  copilotBotType: BotType
}
