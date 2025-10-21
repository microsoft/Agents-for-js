# Authentication Handler Test Scenarios for Web Chat

This document presents a comprehensive suite of test cases for authentication handlers. The scenarios cover login, logout, multi-provider flows, and error handling, demonstrating session management and user experience. All tests are compatible with a range of storage providers, including BlobStorage, CosmosDbPartitionedStorage, and FileStorage.

## Requirements

- [Dev Tunnels](https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/get-started?tabs=windows) for local development and testing
- Storage providers: BlobStorage, CosmosDbPartitionedStorage, FileStorage, etc
- Azure Bot OAuth connections:
  - **Graph**: [Microsoft's AADv2 setup guide](https://github.com/microsoft/Agents/blob/main/docs/HowTo/azurebot-user-authentication-fic.md#register-the-oauth-identity-with-the-azure-bot)
  - **GitHub**: Requires a GitHub account. In GitHub, go to Settings → Developer settings → OAuth apps, create a new OAuth app, and set the callback URL to `https://token.botframework.com/.auth/web/redirect`. In Azure Bot connection settings, provide the `clientId`, `clientSecret`, and required scopes: `user repo`.

## Reference

- 🧑: User interaction
- 🤖: Bot interaction
- `magic code`: 6-digit code gathered from the `oAuthCard`
- `/me`: Login route for `graph` auth handler
- `/prs`: Lists GitHub pull requests; triggers GitHub sign-in if needed
- `/status`: Login route for `graph` and `github` auth handlers
- `/logout`: Logout route for `graph` and `github` auth handlers
- `oAuthCard`: <br>
  ![oAuthCard](https://github.com/user-attachments/assets/5a5a124b-5247-4715-a9f6-2f750059a466)

## Test Cases

> [!NOTE]
> These test cases were created using the [autoAuth](/samples/auth/autoAuth.ts) sample.

### 1. Basic Login Flow

**Description:**
User logs in to retrieve information from the Graph provider.

**Steps:**

1. 🧑 → Sends `/me` message
2. 🤖 → Shows `oAuthCard`
3. 🧑 → Clicks `oAuthCard` sign-in button
4. 🧑 → Retrieves and sends `magic code`
5. 🤖 → Shows signed-in user information from the Graph provider

### 2. Session Persistence After Page Reload

**Description:**
User reloads the web page or restarts the bot and verifies that the authentication session persists.

**Steps:**

1. 🧑 → Already logged in (see [Basic Login Flow](#1-basic-login-flow))
2. 🧑 → Reloads web page or restarts the bot
3. 🧑 → Sends `/me` message
4. 🤖 → Shows signed-in user information from the Graph provider

### 3. Login, Restart Bot During Sign-In, and Logout

**Description:**
User logs in, restarts the bot during sign-in, and logs out to verify session handling.

**Steps:**

1. 🧑 → Sends `/me` message
2. 🤖 → Shows `oAuthCard`
3. 🧑 → Clicks `oAuthCard` sign-in button
4. 🧑 → Retrieves `magic code`
5. 🧑 → Restarts bot
6. 🧑 → Sends `magic code`
7. 🤖 → Shows signed-in user information from the Graph provider
8. 🧑 → Sends `/me` message
9. 🤖 → Shows signed-in user information from the Graph provider
10. 🧑 → Sends `/logout` message
11. 🤖 → Shows logged-out message

### 4. Logout and Login

**Description:**
User logs out and then logs in again to confirm re-authentication works.

**Steps:**

1. 🧑 → Already logged in (see [Basic Login Flow](#1-basic-login-flow))
2. 🧑 → Sends `/logout` message
3. 🧑 → Sends `/me` message
4. 🤖 → Shows `oAuthCard`
5. 🧑 → Clicks `oAuthCard` sign-in button
6. 🧑 → Retrieves and sends `magic code`
7. 🤖 → Shows signed-in user information from the Graph provider

### 5. Invalid Magic Code Format and Retry

**Description:**
User enters an invalid magic code format, then retries with the correct code to complete sign-in.

**Steps:**

1. 🧑 → Sends `/me` message
2. 🤖 → Shows `oAuthCard`
3. 🧑 → Clicks `oAuthCard` sign-in button
4. 🧑 → Sends invalid magic code format (e.g., `abc`)
5. 🤖 → Shows invalid magic code format message
6. 🧑 → Sends correct magic code
7. 🤖 → Shows signed-in user information from the Graph provider

### 6. Exhaust Magic Code Retries

**Description:**
User enters invalid magic codes until the maximum number of attempts is reached.

**Steps:**

1. 🧑 → Sends `/me` message
2. 🤖 → Shows `oAuthCard`
3. 🧑 → Sends invalid magic code (e.g., `abc`)
4. 🤖 → Shows invalid magic code format message
5. 🧑 → Sends invalid magic code (e.g., `abc`)
6. 🤖 → Shows invalid magic code format message
7. 🧑 → Sends invalid magic code (e.g., `abc`)
8. 🤖 → Shows invalid magic code format message
9. 🧑 → Sends invalid magic code (e.g., `abc`)
10. 🤖 → Shows 'You have exceeded the maximum number of attempts.' message

### 7. Correct Format but Invalid Magic Code Sent to Service

**Description:**
User enters an invalid magic code, sending the wrong magic code to the service, resulting in an invalid or expired magic code.

**Steps:**

1. 🧑 → Sends `/me` message
2. 🤖 → Shows `oAuthCard`
3. 🧑 → Sends correct format but invalid magic code (e.g., `123456`)
4. 🤖 → Shows the code entered is invalid

### 8. Restart Conversation During Sign-In

**Description:**
User restarts the conversation during sign-in and resets the flow.

**Steps:**

1. 🧑 → Sends `/me` message
2. 🤖 → Shows `oAuthCard`
3. 🧑 → Restarts conversation
4. 🤖 → Shows the on members added message

### 9. Multi-Handler Login

**Description:**
User checks status and logs in to both handlers to verify multi-handler support.

**Steps:**

1. 🧑 → Sends `/status` message
2. 🤖 → Shows `graph` `oAuthCard`
3. 🧑 → Clicks `oAuthCard` sign-in button
4. 🧑 → Retrieves and sends `magic code`
5. 🤖 → Shows `github` `oAuthCard`
6. 🧑 → Clicks `oAuthCard` sign-in button
7. 🧑 → Retrieves and sends `magic code`
8. 🤖 → Shows token status for both auth handlers

### 10. Login the First Handler

**Description:**
User checks status and logs in first handler to verify multi-handler support.

**Steps:**

1. 🧑 → Sends `/me` message
2. 🤖 → Shows `graph` `oAuthCard`
3. 🧑 → Clicks `oAuthCard` sign-in button
4. 🧑 → Retrieves and sends `magic code`
5. 🧑 → Sends `/status` message
6. 🤖 → Shows `github` `oAuthCard`
7. 🧑 → Clicks `oAuthCard` sign-in button
8. 🧑 → Retrieves and sends `magic code`
9. 🤖 → Shows token status for both auth handlers

### 11. Login the Second Handler

**Description:**
User checks status and logs in second handler to verify multi-handler support.

**Steps:**

1. 🧑 → Sends `/prs` message
2. 🤖 → Shows `github` `oAuthCard`
3. 🧑 → Clicks `oAuthCard` sign-in button
4. 🧑 → Retrieves and sends `magic code`
5. 🧑 → Sends `/status` message
6. 🤖 → Shows `graph` `oAuthCard`
7. 🧑 → Clicks `oAuthCard` sign-in button
8. 🧑 → Retrieves and sends `magic code`
9. 🤖 → Shows token status for both auth handlers

### 12. Multi-Handler Logout

**Description:**
User logs out of all handlers.

**Steps:**

1. 🧑 → Already logged in (see [Multi-Handler Login](#9-multi-handler-login))
2. 🧑 → Sends `/logout` message
3. 🤖 → Shows all handlers logged out message

### 13. Multi-Server Instances

**Description:**
User simulates having multiple server instances by removing the handler from storage and verifies recovery by re-authenticating.

**Steps:**

1. 🧑 → Sends `/me` message
2. 🤖 → Shows `oAuthCard`
3. 🧑 → Removes handler from storage (simulates wrong memory flow)
4. 🧑 → Sends `/me` message
5. 🤖 → Shows `oAuthCard`
6. 🧑 → Retrieves and sends `magic code`
7. 🤖 → Shows signed-in user information from the Graph provider
