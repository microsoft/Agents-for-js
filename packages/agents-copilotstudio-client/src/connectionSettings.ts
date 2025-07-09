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
  /** The client ID of the application. */
  public appClientId: string = ''
  /** The tenant ID of the application. */
  public tenantId: string = ''
  /** The environment ID of the application. */
  public environmentId: string = ''
  /** The cloud environment of the application. */
  public cloud?: PowerPlatformCloud
  /** The custom Power Platform cloud URL, if any. */
  public customPowerPlatformCloud?: string
  /** The identifier of the agent. */
  public agentIdentifier?: string
  /** The type of the Copilot agent. */
  public copilotAgentType?: AgentType
  /** The URL to connect directly to Copilot Studio endpoint */
  public directConnectUrl?: string
  /** Flag to use the experimental endpoint if available */
  public useExperimentalEndpoint?: boolean = false
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
    cloud: cloudStr ? PowerPlatformCloud[cloudStr] : PowerPlatformCloud.Prod,
    customPowerPlatformCloud: process.env.customPowerPlatformCloud,
    agentIdentifier: process.env.agentIdentifier,
    copilotAgentType: agentStr ? AgentType[agentStr] : AgentType.Published,
    directConnectUrl: process.env.directConnectUrl,
    useExperimentalEndpoint: process.env.useExperimentalEndpoint?.toLocaleLowerCase() === 'true'
  } satisfies ConnectionSettings
}
