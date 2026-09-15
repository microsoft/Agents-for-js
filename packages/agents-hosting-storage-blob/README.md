# @microsoft/agents-hosting-storage-blob

## Overview

This package allows to configure Azure Blob Storage as the backend for Agents conversation State

`BlobsStorage` retains the legacy `Storage` contract by default. Set
`storageVersion: 2` in its options to select `StorageV2`; V2 calls return keyed
operation results with `value`, `status`, and `version`.

## Usage with connectionStrings

```ts
const blobStorage = new BlobsStorage(process.env.BLOB_CONTAINER_ID!, process.env.BLOB_STORAGE_CONNECTION_STRING!)
const conversationState = new ConversationState(blobStorage)
const userState = new UserState(blobStorage)
```

```ts
const blobStorageV2 = new BlobsStorage(containerName, connectionString, {
  storageVersion: 2,
})
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
