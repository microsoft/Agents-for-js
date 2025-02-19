# Migration to @microsoft/agents-bot-hosting

This document outlines the necessary migrations to adapt BotBuilder samples for use with the Agents SDK.
These are the main steps to considerate:

## 1. Replace Packages

Update required packages to use the new SDK libraries:  
- `botframework-schema` → `@microsoft/agents-activity-schema`  
- `botbuilder` → `@microsoft/agents-bot-hosting`  
- `botbuilder-azure-blobs` → `@microsoft/agents-bot-hosting-storage-blob`  
- `botbuilder-azure` `CosmosDB` → `@microsoft/agents-bot-hosting-storage-cosmos`  

## 2. Update Classes and Methods 

The following classes and methods have had significant modifications, requiring updates in the sample bots:

### a. ConfigurationBotFrameworkAuthentication

- Replaced by `AuthConfiguration`, which can be instantiated using `loadBotAuthConfigFromEnv` or `loadAuthConfigFromEnv`.  
- `MicrosoftAppType` has been removed from the configuration, as it is now handled internally by the SDK.  
- While `loadBotAuthConfigFromEnv` maintains compatibility with the previous authentication format, `loadAuthConfigFromEnv` follows the updated format:  

  | Old Variable              | New Variable  |  
  |---------------------------|---------------|  
  | `MicrosoftAppId`          | `clientId`    |  
  | `MicrosoftAppPassword`    | `clientSecret`|  
  | `MicrosoftAppTenantId`    | `tenantId`    |  

### b. StatePropertyAccessor

- Replaced by `BotStatePropertyAccessor`.

### c. Activity

- Object literals can no longer be used as an `Activity`. Instead, use `MessageFactory` and its properties to create `Activity` objects or `Activity.FromObject` method.  
- **Conversation references** are now managed by `Activity` instead of `TurnContext`. The following methods have been moved to the `Activity` class:
  - `getConversationReference`
  - `applyConversationReference`
  - `getReplyConversationReference`
  - `removeRecipientMention`
- `Activity` can now be instantiated using its constructor.

### d. Storage

- `BlobsStorage` has been replaced by `AzureBlobStorage`.
- Token Credential authentication is not available. Authentication must now use a connection string.

### e. SSO Authentication

- The SSO authentications actions and flow managed by dialog prompts now are in charge of webChatOAuthFlowActionTypes.

### f. ActivityHandler

- `ActivityHandlerBase` and `ActivityHandler` have been merged into a single class, consolidating their methods into a unified structure.

### g. Agents-activity-schema

- The `ActionTypes` class is now part of @microsoft/agents-activity-schema, not the main package(`botbuilder`).

## 3. Server Changes

Use **Express** instead of Restify for compatibility with the Agents server. Follow these steps:
  1. Create an instance of an Express application to handle HTTP requests.
  2. Implement rate limiting to prevent CodeQL alerts.
  3. Parse incoming request bodies as JSON, allowing the bot to process structured data.
  4. Apply JWT authentication using the `authorizeJWT` middleware.
  5. Intercept `POST` requests to the `/api/messages` endpoint and use the adapter’s `process` method.
  6. Listen for incoming requests on the specified port.
  ```typescript
  import express, { Response } from 'express'
  import rateLimit from 'express-rate-limit'
  import { Request, authorizeJWT } from '@microsoft/agents-bot-hosting'

  const app = express()

  app.use(rateLimit({ validate: { xForwardedForHeader: false } }))
  app.use(express.json())
  app.use(authorizeJWT(authConfig))

  app.post('/api/messages', async (req: Request, res: Response) => {
    await adapter.process(req, res, async (context) => await myBot.run(context))
  })

  const port = process.env.PORT || 3978
  app.listen(port, () => {
    console.log(`\nServer listening to port ${port} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`)
  })
  ```
