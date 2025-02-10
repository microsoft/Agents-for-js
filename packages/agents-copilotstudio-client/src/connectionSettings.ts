/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PowerPlatformCloud } from './powerPlatformCloud'

export class ConnectionSettings {
  public appClientId: string = ''
  public tenantId: string = ''
  public environmentId: string = ''
  public cloud: number = PowerPlatformCloud.Unknown
  public customPowerPlatformCloud?: string
  public botIdentifier?: string
  public copilotBotType?: string
}

export const loadCopilotStudioConnectionSettingsFromEnv: () => ConnectionSettings = () => {
  return {
    appClientId: process.env.appClientId ?? '',
    tenantId: process.env.tenantId ?? '',
    environmentId: process.env.environmentId ?? '',
    cloud: process.env.cloud ?? PowerPlatformCloud.Unknown,
    customPowerPlatformCloud: process.env.customPowerPlatformCloud,
    botIdentifier: process.env.botIdentifier,
    copilotBotType: process.env.copilotBotType
  } as ConnectionSettings
}
