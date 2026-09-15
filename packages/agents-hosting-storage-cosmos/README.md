# @microsoft/agents-hosting-storage-cosmos

## Overview

This package allows to configure Azure CosmosDB Storage as the backend for Agents conversation State

`CosmosDbPartitionedStorage` retains the legacy `Storage` contract by default.
Set `storageVersion: 2` in its options to select `StorageV2`; V2 calls return
keyed operation results with `value`, `status`, and `version`.

## Usage

```ts
const cosmosDbStorageOptions = {
  databaseId: process.env.COSMOS_DATABASE_ID || 'agentsDB',
  containerId: process.env.COSMOS_CONTAINER_ID || 'agentsState',
  cosmosClientOptions: {
    endpoint: process.env.COSMOS_ENDPOINT!,
    key: process.env.COSMOS_KEY!,
  }
} as CosmosDbPartitionedStorageOptions
const cosmosStorage = new CosmosDbPartitionedStorage(cosmosDbStorageOptions)
const conversationState = new ConversationState(cosmosStorage)
const userState = new UserState(cosmosStorage)
```

```ts
const cosmosStorageV2 = new CosmosDbPartitionedStorage({
  ...cosmosDbStorageOptions,
  storageVersion: 2,
})
```
