/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BotType } from './botType'
import { PowerPlatformCloud } from './powerPlatformCloud'

export class ConnectionSettings {
  public appClientId: string = ''
  public tenantId: string = ''
  public environmentId: string = ''
  public cloud?: PowerPlatformCloud = PowerPlatformCloud.Unknown
  public customPowerPlatformCloud?: string
  public botIdentifier?: string
  public copilotBotType?: BotType
}

export const loadCopilotStudioConnectionSettingsFromEnv: () => ConnectionSettings = () => {
  return {
    environmentId: process.env.environmentId,
    cloud: process.env.cloud,
    customPowerPlatformCloud: process.env.customPowerPlatformCloud,
    botIdentifier: process.env.botIdentifier,
    copilotBotType: process.env.copilotBotType,
    appClientId: process.env.appClientId,
    tenantId: process.env.tenantId
  } as ConnectionSettings
}
