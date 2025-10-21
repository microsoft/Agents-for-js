# AgenticAI Sample

This is a base sample that responds in the Teams demo env for Agentic AI.

## Prerequisites

- [Node.js](https://nodejs.org/en) version 20 or higher
- [dev tunnel](https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/get-started?tabs=windows)
- [Microsoft 365 Agents Toolkit](https://github.com/OfficeDev/microsoft-365-agents-toolkit)

## QuickStart using Teams

- Overview of running and testing an Agent
  - The Agentic App has already been created.  You will need that ClientId, TenantId, and secret (if neededing to run locally).
  - Configure your Agent settings to use to desired authentication type
  - Running an instance of the Agent app (either locally or deployed to Azure)
  - Test in the Kairo Teams web client

1. Configuring the authentication connection in the Agent settings
   > These instructions are for **SingleTenant, Client Secret**. For other auth type configuration, see [DotNet MSAL Authentication](https://github.com/microsoft/Agents/blob/main/docs/HowTo/MSALAuthConfigurationOptions.md).
   1. Rename env.TEMPLATE as .env.

   1. Find the `connections` section,  it should appear similar to this:

      ```bash
      connections__serviceConnection__settings__clientId={{clientId}} # this is the Client ID used for the connection.
      connections__serviceConnection__settings__clientSecret={{clientSecret}} # this is the Client Secret used for the connection.
      connections__serviceConnection__settings__tenantId={{tenantId}} # this is the tenant ID for the application.
      ```


      1. Replace all **{{ClientId}}** with the AppId of the Azure Bot.
      1. Replace all **{{TenantId}}** with the Tenant Id where your application is registered.
      1. Set the **{{ClientSecret}}** to the Secret that was created on the App Registration.
      
      > Storing sensitive values in .env files is not recommend.  Follow 
      [Microsoft identity platform authentication](https://learn.microsoft.com/en-us/entra/identity-platform/authentication-vs-authorization) and [MSAL.js](https://learn.microsoft.com/azure/active-directory/develop/msal-overview) for best practices.

1. Running the Agent
   1. Running the Agent locally
      - Requires a tunneling tool to allow for local development and debugging connected to a external client such as Microsoft Teams.
      - **For ClientSecret or Certificate authentication types only.**  Federated Credentials and Managed Identity will not work via a tunnel to a local agent and must be deployed to an App Service or container.
      
      1. Run `dev tunnels`. Please follow [Create and host a dev tunnel](https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/get-started?tabs=windows) and host the tunnel with anonymous user access command as shown below:

         ```bash
         devtunnel host -p 3978 --allow-anonymous
         ```

      1. On the Azure Bot, select **Settings**, then **Configuration**, and update the **Messaging endpoint** to `{tunnel-url}/api/messages`

      1. In the agent's root directory install dependencies by running `npm install`.
      1. Start the Agent by running `npm start`


## Further reading
To learn more about building Agents, see our [Microsoft 365 Agents SDK](https://github.com/microsoft/agents) repo.
