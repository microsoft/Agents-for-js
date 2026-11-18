# @microsoft/agents-hosting-storage-blob

Start with the [Microsoft 365 Agents SDK documentation](https://learn.microsoft.com/microsoft-365/agents-sdk/)
for primary developer guidance. The examples below are excerpts; surrounding
application setup, variables, or imports may be omitted.

See the [package guide index](../PACKAGE-GUIDES.md) for related contributor guides.

## Storage contract compatibility

`BlobsStorage` retains the legacy `Storage` contract. Use `BlobsStorageV2` for
the separate `StorageV2` contract; V2 calls return keyed operation results with
`value`, `status`, and `version`.

## Legacy state integration

For connection-string construction, see the
[JavaScript storage guide](https://learn.microsoft.com/microsoft-365/agents-sdk/storage?tabs=javascript).
Given a configured `blobStorage`, legacy state buckets use it as follows:

```ts
const conversationState = new ConversationState(blobStorage)
const userState = new UserState(blobStorage)
```

## V2 construction

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
