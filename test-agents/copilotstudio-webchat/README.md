# Copilot Studio WebChat Integration Sample

This sample demonstrates how to connect Microsoft Copilot Studio to a custom WebChat interface using the [Bot Framework WebChat](https://www.npmjs.com/package/botframework-webchat) component. It provides a full-stack example, including backend authentication, conversation management, and a modern frontend chat UI.

## Overview

This sample is a ready-to-run example for integrating Copilot Studio agents with a web-based chat client. It uses the Power Platform API for secure communication and token acquisition, and leverages Bot Framework WebChat for the frontend experience.

## 1. Prerequisites

1. An Agent created in Microsoft Copilot Studio or access to an existing Agent.
2. Ability to create an App Registration in Azure, or access to an existing one with the `CopilotStudio.Copilots.Invoke` API Permission assigned.

## 2. Create an Agent in Copilot Studio

1. Create an Agent in [Copilot Studio](https://copilotstudio.microsoft.com).
    1. Publish your newly created Copilot.
    2. Go to **Settings > Advanced > Metadata** and copy the following values for later:
        - Schema name
        - Environment Id

## 3. Create an Application Registration in Entra ID

This step requires permissions to create application identities in your Azure tenant. For this sample, create a Native Client Application Identity (no secrets required):

1. Open [Azure Portal](https://portal.azure.com).
2. Navigate to Entra ID.
3. Create a new App Registration:
    1. Provide a Name.
    2. Choose "Accounts in this organization directory only".
    3. In "Select a Platform", choose "Single-page application".
    4. In the Redirect URI box, enter `http://localhost` (**use HTTP, not HTTPS**).
    5. Click Register.
4. In your new application:
    1. On the Overview page, note:
        - Application (client) ID
        - Directory (tenant) ID
    2. Go to **API Permissions** in the Manage section.
    3. Click **Add Permission**:
        1. In the side panel, click the `APIs my organization uses` tab.
        2. Search for `Power Platform API` or `8578e004-a5c6-46e7-913e-12f58912df43`.
            - *If you do not see `Power Platform API`, see the note below.*
        3. In *Delegated permissions*, choose `CopilotStudio` and check `CopilotStudio.Copilots.Invoke`.
        4. Click **Add Permissions**.
    4. (Optional) Click **Grant Admin consent** for your app.

> [!TIP]  
> If you do not see `Power Platform API` in the list, you need to add it to your tenant. See [Power Platform API Authentication](https://learn.microsoft.com/power-platform/admin/programmability-authentication-v2#step-2-configure-api-permissions) and follow Step 2 to add the API.

## 4. Configure the Example Application

1. Open the [settings.js](./settings.js) file.
2. Fill in the values you recorded during setup:
    - `environmentId`: The Copilot Studio Environment Id.
    - `agentIdentifier`: The Copilot Studio Schema name.
    - `tenantId`: The App Registration Directory (tenant) ID.
    - `appClientId`: The App Registration Application (client) ID.
3. Alternatively, you can provide a direct URL to connect to Copilot Studio instead of specifying the `environmentId` and `agentIdentifier` values:
    - `directConnectUrl`: The URL to connect to the Copilot Studio service.

## 5. Run the Sample

1. **Open the project in VS Code.**

2. **Start Live Preview:**
   - Open the Command Palette (`Ctrl+Shift+P` or `F1`).
   - Type and select `Live Preview: Start Server`.
   - Navigate to [`http://localhost:3000/test-agents/copilotstudio-webchat`](http://localhost:3000/test-agents/copilotstudio-webchat) in a browser to interact with your Copilot Studio agent via the WebChat interface.

> [!TIP]  
> If you do not have the Live Preview extension installed, search for "Live Preview" in the Extensions view and install it from Microsoft.

## 6. Additional Notes

- Ensure your Azure AD app registration has the necessary API permissions for Power Platform.
- This sample is intended for development and demonstration purposes. For production, review authentication flows and security best practices. See the [Microsoft identity platform authentication best practices](https://learn.microsoft.com/en-us/entra/identity-platform/authentication-vs-authorization) and [MSAL.js best practices](https://learn.microsoft.com/azure/active-directory/develop/msal-overview).

## 7. Authentication

The Copilot Studio Client requires a user token to operate. This sample uses a user-interactive flow to obtain the user token for the application ID created above.

## 8. Troubleshooting

- **Token Acquisition Errors:** If you see errors related to token acquisition, verify your `settings.js` configuration and Azure AD app registration permissions.
- **API Permissions:** Double-check that your Azure AD app registration has the correct API permissions and, if needed, that admin consent has been granted.
- **Agent Not Responding:** Ensure your Copilot Studio agent is published and the identifiers in your `settings.js` file are correct.
