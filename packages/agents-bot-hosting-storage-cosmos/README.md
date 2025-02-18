# @microsoft/agents-bot-hosting-storage-cosmos

## Overview

This package allows to configure Azure CosmosDB Storage as the backend for Agents conversation State

## Usage

```ts
const cosmosDbStorageOptions = {
  databaseId: process.env.COSMOS_DATABASE_ID || 'botsDB',
  containerId: process.env.COSMOS_CONTAINER_ID || 'botState',
  cosmosClientOptions: {
    endpoint: process.env.COSMOS_ENDPOINT!,
    key: process.env.COSMOS_KEY!,
  }
} as CosmosDbPartitionedStorageOptions
const cosmosStorage = new CosmosDbPartitionedStorage(cosmosDbStorageOptions)
const conversationState = new ConversationState(cosmosStorage)
const userState = new UserState(cosmosStorage)
```