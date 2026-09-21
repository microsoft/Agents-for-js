# Authentication Handler Test Scenarios for Microsoft Teams

This document presents a comprehensive suite of test cases for authentication handlers. The scenarios cover sign-in, sign-out, multi-provider flows, and error handling, demonstrating session management and user experience. All tests are compatible with a range of storage providers, including BlobStorage, CosmosDbPartitionedStorage, and FileStorage.

## Requirements

- [Dev Tunnels](https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/get-started?tabs=windows) for local development and testing
- Storage providers: BlobStorage, CosmosDbPartitionedStorage, FileStorage, etc
- Azure Bot OAuth connections:
  - **Graph**: [Microsoft's AADv2 setup guide](https://github.com/microsoft/Agents/blob/main/docs/HowTo/azurebot-user-authentication-fic.md#register-the-oauth-identity-with-the-azure-bot)
  - **GitHub**: Requires a GitHub account. In GitHub, go to Settings → Developer settings → OAuth apps, create a new OAuth app, and set the callback URL to `https://token.botframework.com/.auth/web/redirect`. In Azure Bot connection settings, provide the `clientId`, `clientSecret`, and required scopes: `user repo`.

## Reference

- 🧑: User interaction
- 🤖: Bot interaction
- `magic code`: 6-digit code sent to the bot by Microsoft Teams via the `signin/verifyState` invoke
- `/me`: Login route for `graph` auth handler
- `/status`: Login route for `graph` and `github` auth handlers
- `/logout`: Logout route for `graph` and `github` auth handlers
- `oAuthCard`: <br>
  ![oAuthCard](https://github.com/user-attachments/assets/9a639a59-6806-4150-acb2-1144b9ae931b)


## Test Cases

### 1. Basic Login Flow

**Description:**
User logs in to retrieve information from the Graph provider.

**Steps:**

1. 🧑 → Sends `/me` message
2. 🤖 → Shows `oAuthCard`
3. 🧑 → Clicks `oAuthCard` sign-in button
4. 🤖 → Receives the `signin/verifyState` invoke activity with `magic code`
5. 🤖 → Shows signed-in user information from the Graph provider

### 2. Session Persistence After Bot Restart

**Description:**
User restarts the bot and checks if the session persists.

**Steps:**

1. 🧑 → Already logged in (see [Basic Login Flow](#1-basic-login-flow))
2. 🧑 → Restarts bot
3. 🧑 → Sends `/me` message
4. 🤖 → Shows signed-in user information from the Graph provider

### 3. Login, Restart Bot During Sign-In, and Logout

**Description:**
User logs in, restarts the bot during sign-in, and logs out to verify session handling.

**Steps:**

1. 🧑 → Sends `/me` message
2. 🤖 → Shows `oAuthCard`
3. 🧑 → Clicks `oAuthCard` sign-in button
4. 🧑 → Restarts bot
5. 🤖 → Receives the `signin/verifyState` invoke activity with `magic code`
6. 🤖 → Shows signed-in user information from the Graph provider
7. 🧑 → Sends `/me` message
8. 🤖 → Shows signed-in user information from the Graph provider
9. 🧑 → Sends `/logout` message
10. 🤖 → Shows logged-out message

### 4. Logout and Login

**Description:**
User logs out and then logs in again to confirm re-authentication works.

**Steps:**

1. 🧑 → Already logged in (see [Basic Login Flow](#1-basic-login-flow))
2. 🧑 → Sends `/logout` message
3. 🧑 → Sends `/me` message
4. 🤖 → Shows `oAuthCard`
5. 🧑 → Clicks `oAuthCard` sign-in button
6. 🤖 → Receives the `signin/verifyState` invoke activity with `magic code`
7. 🤖 → Shows signed-in user information from the Graph provider

### 5. Multi-Handler Login

**Description:**
User checks status and logs in to both handlers to verify multi-handler support.

**Steps:**

1. 🧑 → Sends `/status` message
2. 🤖 → Shows `graph` `oAuthCard`
3. 🧑 → Clicks `oAuthCard` sign-in button
4. 🤖 → Receives the `signin/verifyState` invoke activity with `magic code`
5. 🤖 → Shows `github` `oAuthCard`
6. 🧑 → Clicks `oAuthCard` sign-in button
7. 🤖 → Receives the `signin/verifyState` invoke activity with `magic code`
8. 🤖 → Shows token status for both auth handlers

### 6. Multi-Handler Logout and Re-Login

**Description:**
User logs out of all handlers and then logs in again to both, confirming full session reset and re-authentication.

**Steps:**

1. 🧑 → Already logged in (see [Multi-Handler Login](#5-multi-handler-login))
2. 🧑 → Sends `/logout` message
3. 🤖 → Shows all handlers logged out message
4. 🧑 → Logs in to both handlers again (see [Multi-Handler Login](#5-multi-handler-login))

### 7. Multi-Server Instances

**Description:**
User simulates having multiple server instances by removing the handler from storage and verifies recovery by re-authenticating, validating that token memory is refreshed.

**Steps:**

1. 🧑 → Sends `/me` message
2. 🤖 → Shows `oAuthCard`
3. 🧑 → Removes handler from storage (simulates wrong memory flow)
4. 🧑 → Sends `/me` message
5. 🤖 → Shows `oAuthCard`
6. 🤖 → Receives the `signin/verifyState` invoke activity with `magic code`
7. 🤖 → Shows signed-in user information from the Graph provider

### 8. Token Exchange

**Description:**
User logs in through token exchange to retrieve information from the Graph provider.
Note: Configure the Graph connection to work with token exchange in Microsoft Teams by using the Developer Portal extension, Apps > Single sign-on section.

**Steps:**

1. 🧑 → Sends `/me` message
2. 🤖 → Shows signed-in user information from the Graph provider
