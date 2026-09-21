# @microsoft/agents-hosting-storage-cosmos

## Overview

This package allows to configure Azure CosmosDB Storage as the backend for Agents conversation State

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

## TTL writes

`CosmosDbPartitionedStorage` supports the shared storage TTL option:

```ts
await cosmosStorage.write({ 'session/123': { value: 'temporary' } }, { ttl: 3600 })
```

The provider stores Cosmos DB item-level TTL on the wrapper document and also enforces logical expiry during reads.
