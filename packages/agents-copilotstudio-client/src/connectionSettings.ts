/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AgentType } from './agentType'
import { CopilotStudioConnectionSettings } from './copilotStudioConnectionSettings'
import { PowerPlatformCloud } from './powerPlatformCloud'

/**
 * Represents the settings required to establish a connection to Copilot Studio.
 */
export class ConnectionSettings implements CopilotStudioConnectionSettings {
  public appClientId: string = ''
  public tenantId: string = ''
  public environmentId: string = ''
  public cloud?: PowerPlatformCloud
  public customPowerPlatformCloud?: string
  public agentIdentifier?: string
  public copilotAgentType?: AgentType
  public directConnectUrl?: string
  public useExperimentalEndpoint?: boolean = false
  public enableDiagnostics?: boolean = false
}

/**
 * Loads the connection settings for Copilot Studio from environment variables.
 * @returns The connection settings.
 */
export const loadCopilotStudioConnectionSettingsFromEnv: () => ConnectionSettings = () => {
  const cloudStr = process.env.cloud as keyof typeof PowerPlatformCloud | undefined
  const agentStr = process.env.copilotAgentType as keyof typeof AgentType | undefined

  return {
    appClientId: process.env.appClientId ?? '',
    tenantId: process.env.tenantId ?? '',
    environmentId: process.env.environmentId ?? '',
    cloud: cloudStr ? PowerPlatformCloud[cloudStr] : undefined,
    customPowerPlatformCloud: process.env.customPowerPlatformCloud,
    agentIdentifier: process.env.agentIdentifier,
    copilotAgentType: agentStr ? AgentType[agentStr] : undefined,
    directConnectUrl: process.env.directConnectUrl,
    useExperimentalEndpoint: process.env.useExperimentalEndpoint?.toLocaleLowerCase() === 'true',
    enableDiagnostics: process.env.enableDiagnostics?.toLocaleLowerCase() === 'true'
  } satisfies ConnectionSettings
}
