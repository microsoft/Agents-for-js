/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents the settings required to establish a connection to Copilot Studio.
 */
export class ConnectionSettings {
  /** The client ID of the application. */
  public appClientId: string = ''
  /** The tenant ID of the application. */
  public tenantId: string = ''
  /** The environment ID of the application. */
  public environmentId: string = ''
  /** The cloud environment of the application. */
  public cloud: string = ''
  /** The custom Power Platform cloud URL, if any. */
  public customPowerPlatformCloud?: string
  /** The identifier of the agent. */
  public agentIdentifier?: string
  /** The type of the Copilot agent. */
  public copilotAgentType?: string
}

/**
 * Loads the connection settings for Copilot Studio from environment variables.
 * @returns The connection settings.
 */
export const loadCopilotStudioConnectionSettingsFromEnv: () => ConnectionSettings = () => {
  return {
    appClientId: process.env.appClientId ?? '',
    tenantId: process.env.tenantId ?? '',
    environmentId: process.env.environmentId ?? '',
    cloud: process.env.cloud,
    customPowerPlatformCloud: process.env.customPowerPlatformCloud,
    agentIdentifier: process.env.agentIdentifier,
    copilotAgentType: process.env.copilotAgentType
  } as ConnectionSettings
}
