# @microsoft/agents-hosting-storage-cosmos

Start with the [Microsoft 365 Agents SDK documentation](https://learn.microsoft.com/microsoft-365/agents-sdk/)
for primary developer guidance. The examples below are excerpts; surrounding
application setup, variables, or imports may be omitted.

See the [package guide index](../PACKAGE-GUIDES.md) for related contributor guides.

## Storage contract compatibility

`CosmosDbPartitionedStorage` retains the legacy `Storage` contract. Use
`CosmosDbPartitionedStorageV2` for the separate `StorageV2` contract; V2 calls
return keyed operation results with `value`, `status`, and `version`.

## Legacy state integration

For database, container, endpoint, and key configuration, see the
[JavaScript storage guide](https://learn.microsoft.com/microsoft-365/agents-sdk/storage?tabs=javascript).
Given those `cosmosDbStorageOptions`, legacy state buckets use the provider as follows:

```ts
const cosmosStorage = new CosmosDbPartitionedStorage(cosmosDbStorageOptions)
const conversationState = new ConversationState(cosmosStorage)
const userState = new UserState(cosmosStorage)
```

## V2 construction

```ts
const cosmosStorageV2 = new CosmosDbPartitionedStorageV2(cosmosDbStorageOptions)
```
