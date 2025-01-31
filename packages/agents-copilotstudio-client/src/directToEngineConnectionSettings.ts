/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BotType } from './botType'
import { PowerPlatformCloud } from './powerPlatformCloud'

export interface DirectToEngineConnectionSettings {
  botIdentifier: string
  customPowerPlatformCloud: string
  environmentId: string
  cloud: PowerPlatformCloud
  copilotBotType: BotType
}
