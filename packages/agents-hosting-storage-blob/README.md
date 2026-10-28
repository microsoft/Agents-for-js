# @microsoft/agents-hosting-storage-blob

## Overview

This package allows to configure Azure Blob Storage as the backend for Agents conversation State

`BlobsStorage` retains the legacy `Storage` contract. Use `BlobsStorageV2` for
the separate `StorageV2` contract; V2 calls return keyed operation results with
`value`, `status`, and `version`.

## Usage with connectionStrings

```ts
const blobStorage = new BlobsStorage(process.env.BLOB_CONTAINER_ID!, process.env.BLOB_STORAGE_CONNECTION_STRING!)
const conversationState = new ConversationState(blobStorage)
const userState = new UserState(blobStorage)
```

```ts
const blobStorageV2 = new BlobsStorageV2(containerName, connectionString)
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

## TTL writes

`BlobsStorage` supports the shared storage TTL option:

```ts
await blobStorage.write({ 'session/123': { value: 'temporary' } }, { ttl: 3600 })
```

Expired blobs are omitted from reads and deleted on a best-effort basis when encountered. Physical auto-eviction still depends on Azure Blob lifecycle policies.
