// This file emulates the process object in node.
export const process = {
  env: {
    // App ID of the App Registration used to log in, this should be in the same tenant as the Copilot.
    appClientId: 'a475b07e-5445-4edd-819b-9389935871a5',

    // Tenant ID of the App Registration used to log in, this should be in the same tenant as the Copilot.
    tenantId: '86f99aa0-6261-467a-944f-ed89af57c6e2',

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
    directConnectUrl: 'https://default86f99aa06261467a944fed89af57c6.e2.environment.api.powerplatform.com/copilotstudio/dataverse-backed/authenticated/bots/crdf7_financialInsights/conversations?api-version=2022-03-01-preview',

    DEBUG: 'copilot-studio-client'
  }
}
