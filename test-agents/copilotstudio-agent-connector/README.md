# Copilot Studio Agent Connector

- This sample responds to Power Apps Connector requests from Copilot Studio.
- This sample shows how to use an OBO Exchange to read from Graph to get their name and respond with "Hi, {{name}}"

## Prerequisites

-  [NodeJS](https://nodejs.org) version 20.0 or greater
-  [dev tunnel](https://learn.microsoft.com/azure/developer/dev-tunnels/get-started?tabs=windows) (for local development)

## Configure and run the Agent

1. [Create an Azure Bot](https://aka.ms/AgentsSDK-CreateBot)
   - Record the Application ID, the Tenant ID, and the Client Secret for use below

1. Configure the token connection in the Agent settings
   > The instructions for this sample are for a SingleTenant Azure Bot using ClientSecrets.  The token connection configuration will vary if a different type of Azure Bot was configured.  For more information see [MSAL Authentication provider](https://learn.microsoft.com/microsoft-365/agents-sdk/azure-bot-authentication-for-javascript)

    1. Open the `env.TEMPLATE` file in the root of the sample project and rename it to `.env`
    1. Find the **connections__serviceConnection__settings** section and update **clientId**, **tenantId** and **clientSecret**
  

1. Configure the UserAuthorization handler
   1. Open the `.env` file and add the name of the OAuth Connection, note the prefix must match the name of the auth handlers in the code, so for:

    ```ts
    class AutoSignInDemo extends AgentApplication<TurnState> {
      constructor () {
        super({
          storage: new MemoryStorage(),
          authorization: {
            graph: { text: 'Sign in with Microsoft Graph', title: 'Graph Sign In' },
          }
        })
    ```

    you should have:

    ```env
    graph_type=connectorUserAuthorization
    graph_obo_connectionName=
    graph_obo_scopes=
    ```
      

1. Run `dev tunnels`. Please follow [Create and host a dev tunnel](https://learn.microsoft.com/azure/developer/dev-tunnels/get-started?tabs=windows) and host the tunnel with anonymous user access command as shown below:

   ```bash
   devtunnel host -p 3978 --allow-anonymous
   ```

1. Update your Azure Bot ``Messaging endpoint`` with the tunnel Url:  `{tunnel-url}/api/messages`

1. Run the bot from a terminal with `npm start`

## Configure the MCS Connector Agent
- TBD
