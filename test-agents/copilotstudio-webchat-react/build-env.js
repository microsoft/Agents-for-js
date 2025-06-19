// This file emulates the process object in node.
export const process = {
  env: {
    // App ID of the App Registration used to log in, this should be in the same tenant as the Copilot.
    appClientId: '',

    // Tenant ID of the App Registration used to log in, this should be in the same tenant as the Copilot.
    tenantId: '',

    // Environment ID of the environment with the Copilot Studio App.
    environmentId: '',

    // PowerPlatformCloud enum key.
    cloud: '',

    // Power Platform API endpoint to use if Cloud is configured as "Other".
    customPowerPlatformCloud: '',

    // Schema Name of the Copilot to use.
    agentIdentifier: '',

    // AgentType enum key.
    copilotAgentType: '',

    // Flag to enable token acquisition with an "appClientSecret" instead.
    useS2SConnection: false,

    // App secret used for the S2S connection.
    appClientSecret: '',

    // URL used to connect to the Copilot Studio service.
    directConnectUrl: '',

    DEBUG: 'copilot-studio-client'
  }
}
