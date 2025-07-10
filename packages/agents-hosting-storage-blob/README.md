# @microsoft/agents-hosting-storage-blob

## Overview

This package allows to configure Azure Blob Storage as the backend for Agents conversation State

## Usage with connectionStrings

```ts
const blobStorage = new BlobStorage(process.env.BLOB_STORAGE_CONNECTION_STRING!, process.env.BLOB_CONTAINER_ID!)
const conversationState = new ConversationState(blobStorage)
const userState = new UserState(blobStorage)
```


## Usage with EntraID authentication

>note: you must assign RBAC permissions to your storage account

```ts
const echo = new AgentApplication<TurnState>({
  storage: new BlobsStorage('', undefined, undefined,
    'https://agentsstate.blob.core.windows.net/nodejs-conversations',
    new MsalTokenCredential(loadAuthConfigFromEnv()))
})
```