/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export class ConnectionSettings {
  public appClientId: string = ''
  public tenantId: string = ''
  public environmentId: string = ''
  public cloud: string = ''
  public customPowerPlatformCloud?: string
  public botIdentifier?: string
  public copilotBotType?: string
}

export const loadCopilotStudioConnectionSettingsFromEnv: () => ConnectionSettings = () => {
  return {
    appClientId: process.env.appClientId ?? '',
    tenantId: process.env.tenantId ?? '',
    environmentId: process.env.environmentId ?? '',
    cloud: process.env.cloud,
    customPowerPlatformCloud: process.env.customPowerPlatformCloud,
    botIdentifier: process.env.botIdentifier,
    copilotBotType: process.env.copilotBotType
  } as ConnectionSettings
}
