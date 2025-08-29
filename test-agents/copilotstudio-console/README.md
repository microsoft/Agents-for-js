# Copilot Studio Client Console Sample

## Instructions - Setup

### Prerequisite

To setup for this sample, you will need the following:

1. An Agent Created in Microsoft Copilot Studio
1. Ability to Create a Application Identity in Azure for a Public Client/Native App Registration Or access to an existing Public Client/Native App registration with the CopilotStudio.Copilot.Invoke API Permission assigned. 

### Create a Agent in Copilot Studio

1. Create a Agent in [Copilot Studio](https://copilotstudio.microsoft.com)
    1. Publish your newly created Agent
    1. In Copilot Studio, go to Settings > Advanced > Metadata. Copy the following values for later configueration:
        1. Schema name
        1. Environment Id

### Create an Application Registration in Entra ID - User Interactive Login

This step will require permissions to Create application identities in your Azure tenant. For this sample, you will be creating a Native Client Application Identity, which does not have secrets.

1. Open https://portal.azure.com 
1. Navigate to Entra Id
1. Create an new App Registration in Entra ID 
    1. Provide a Name
    1. Choose "Accounts in this organization directory only"
    1. In the "Select a Platform" list, Choose "Public Client/native (mobile & desktop) 
    1. In the Redirect URI url box, type in `http://localhost` (**note: use HTTP, not HTTPS**)
    1. Then click register.
1. In your newly created application
    1. On the Overview page, note the following for later configuration:
        1. the Application (client) ID
        1. the Directory (tenant) ID
    1. Go to Manage
    1. Go to API Permissions
    1. Click Add Permission
        1. In the side panel that appears, Click the tab `API's my organization uses`
        1. Search for `Power Platform API`.
            1. *If you do not see `Power Platform API` see the note at the bottom of this section.*
        1. In the permissions list choose `Delegated Permissions`, `CopilotStudio` and Check `CopilotStudio.Copilots.Invoke`
        1. Click `Add Permissions`
    1. (Optional) Click `Grant Admin consent for copilotsdk`
    1. Close Azure Portal

> [!TIP]
> If you do not see `Power Platform API` in the list of API's your organization uses, you need to add the Power Platform API to your tenant. To do that, goto [Power Platform API Authentication](https://learn.microsoft.com/power-platform/admin/programmability-authentication-v2#step-2-configure-api-permissions) and follow the instructions on Step 2 to add the Power Platform Admin API to your Tenant

#### Instructions - Configure the Example Application

1. Open the [env.TEMPLATE](./copilotstudio/env.TEMPLATE) and rename it to .env.
2. Fill in the values you recorded during setup:
    - `environmentId`: The Copilot Studio Environment Id.
    - `schemaName`: The Copilot Studio Schema name.
    - `directConnectUrl`: The URL to connect directly to the Copilot Studio service. When provided, `environmentId` + `schemaName` are ignored.
    - `tenantId`: The App Registration Directory (tenant) ID.
    - `appClientId`: The App Registration Application (client) ID.

#### Instructions - Configure the Example Application

1. Open the [env.TEMPLATE](./copilotstudio/env.TEMPLATE) and rename it to .env.
2. Fill in the values you recorded during setup:
    - `environmentId`: The Copilot Studio Environment Id.
    - `schemaName`: The Copilot Studio Schema name.
    - `directConnectUrl`: The URL used to connect to the Copilot Studio service (use this OR environmentId + schemaName).
    - `tenantId`: The App Registration Directory (tenant) ID.
    - `appClientId`: The App Registration Application (client) ID.
    - `useS2SConnection`: true.
    - `appClientSecret`: The App Registration secret. Certificates & Secrets => Client secrets.

### Optional Configuration
This sample allows to configure the following settings in the .env file:
   - `authorityEndpoint`: The login authority to use for the connection. Default: "https://login.microsoftonline.com".
   - `cloud`: The cloud hosting the Power Platform Services. Default: "Prod".
   - `customPowerPlatformCloud`: The Power Platform API endpoint when cloud is set to "Other".
   - `copilotAgentType`: The type of Copilot Studio Agent (Published or Prebuilt). Default: "Published".
   - `useExperimentalEndpoint`: The flag to use the URL provided via the  "x-ms-d2e-experimental" header for subsequent calls to the Copilot Studio service.

### Running the Sample

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the sample:
   ```bash
   npm run start
   ```
