# Copilot Studio WebChat Integration Sample

This sample demonstrates how to connect Microsoft Copilot Studio to a custom WebChat interface using the [Bot Framework WebChat](https://www.npmjs.com/package/botframework-webchat) component. It provides a full-stack example, including backend authentication, conversation management, and a modern frontend chat UI.

## Overview

This sample is a ready-to-run example for integrating Copilot Studio bots with a web-based chat client. It uses the Power Platform API for secure communication and token acquisition, and leverages Bot Framework WebChat for the frontend experience.

### Folder Structure

- **src/**: Contains backend logic for serving the website and Copilot Studio Client configuration.
- **public/**: Contains the frontend code for rendering the chat UI using Bot Framework WebChat and connecting to the Copilot Studio Client. Additionally, it uses Microsoft Entra ID (Azure AD) to acquire the token for communicating with the Copilot Studio API.

## 1. Prerequisites

1. [Node.js](https://nodejs.org) version 20 or higher  
   ```bash
   node --version
   ```
2. An Agent created in Microsoft Copilot Studio or access to an existing Agent.
3. Ability to create an App Registration in Azure, or access to an existing one with the `CopilotStudio.Copilots.Invoke` API Permission assigned.

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
    3. In "Select a Platform", choose "Public Client/native (mobile & desktop)".
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

1. Open the [env.TEMPLATE](./env.TEMPLATE) and rename it to `.env`.
2. Fill in the values you recorded during setup:
    - `environmentId`: The Copilot Studio Environment Id.
    - `agentIdentifier`: The Copilot Studio Schema name.
    - `tenantId`: The App Registration Directory (tenant) ID.
    - `appClientId`: The App Registration Application (client) ID.

## 5. Setup and Running the Sample

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the sample:**
   ```bash
   npm run start
   ```
   Or for development with hot reload:
   ```bash
   npm run dev
   ```

3. **Open your browser:**
   - Navigate to [http://localhost:3000](http://localhost:3000) to interact with your Copilot Studio bot via the WebChat interface.

## 6. How It Works

- The backend (`src/`) serves the website (`public/`), exposes Copilot Studio Client settings loaded from environment variables as JSON at `/agentSettings`, and serves the Copilot Studio Client compiled file for the browser to consume.
- The frontend (`public/`) uses Bot Framework WebChat to provide a chat interface, connecting through the Copilot Studio Client library to communicate with the Copilot Studio service.

## 7. Folder Details

### public/

- Implements the chat UI using Bot Framework WebChat.
- Handles authentication with Azure AD using MSAL.
- Manages token acquisition.
- Provides a connection between WebChat and Copilot Studio Client for interaction.

### src/

- Hosts the website (`public/`) and serves the Copilot Studio client from node_modules and its settings.

## 8. Additional Notes

- Ensure your Azure AD app registration has the necessary API permissions for Power Platform.
- The backend uses Express to serve the frontend and provide API endpoints.
    - **Note:** The integration between WebChat and the Copilot Studio client is independent of the build tool. Express is used here to simplify the sample code.
    - You can use any communication strategy, as long as:
        - The WebChat and Copilot Studio Client frontend code is served to the browser.
- This sample is intended for development and demonstration purposes. For production, review authentication flows and security best practices.

## 9. Authentication

The Copilot Studio Client requires a user token to operate. This sample uses a user-interactive flow to get the user token for the application ID created above.

## 10. Troubleshooting

- **Token Acquisition Errors:** If you see errors related to token acquisition, verify your `.env` configuration and Azure AD app registration permissions.
- **API Permissions:** Double-check that your Azure AD app registration has the correct API permissions and, if needed, that admin consent has been granted.
- **Agent Not Responding:** Ensure your Copilot Studio bot is published and the identifiers in your `.env` file are correct.
