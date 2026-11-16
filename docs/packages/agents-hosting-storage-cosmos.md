# @microsoft/agents-hosting-storage-cosmos

Package-specific guidance and examples relocated from the package README.
Start with the [Microsoft 365 Agents SDK documentation](https://learn.microsoft.com/microsoft-365/agents-sdk/)
for primary developer guidance. The examples below are excerpts; surrounding
application setup, variables, or imports may be omitted.

See the [package guide index](../PACKAGE-GUIDES.md) for related guides and
the source revision used for this migration.

## Storage contract compatibility

`CosmosDbPartitionedStorage` retains the legacy `Storage` contract. Use
`CosmosDbPartitionedStorageV2` for the separate `StorageV2` contract; V2 calls
return keyed operation results with `value`, `status`, and `version`.

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
const cosmosStorageV2 = new CosmosDbPartitionedStorageV2(cosmosDbStorageOptions)
```
