# @microsoft/agents-hosting-storage-cosmos

## Overview

This package allows to configure Azure CosmosDB Storage as the backend for Agents conversation State

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

## Microsoft Entra ID and managed identities

Pass an Azure `TokenCredential` through the existing constructor's
`cosmosClientOptions.aadCredentials` option. As with Blob storage, the application
creates and configures the credential. The Cosmos client handles token acquisition
and renewal. The same options work with either storage version.

For a system-assigned managed identity, install `@azure/identity` in your application
and enable the identity on the Azure resource running the agent:

```ts
import { ManagedIdentityCredential } from '@azure/identity'
import {
  CosmosDbPartitionedStorage,
  CosmosDbPartitionedStorageV2,
} from '@microsoft/agents-hosting-storage-cosmos'
import type { CosmosDbPartitionedStorageOptions } from '@microsoft/agents-hosting-storage-cosmos'

const credential = new ManagedIdentityCredential()
const options: CosmosDbPartitionedStorageOptions = {
  databaseId: 'agentsDB',
  containerId: 'agentsState',
  cosmosClientOptions: {
    endpoint: process.env.COSMOS_ENDPOINT!,
    aadCredentials: credential,
  },
}

// Choose the class matching your application's storage contract.
const storage = new CosmosDbPartitionedStorage(options)
const storageV2 = new CosmosDbPartitionedStorageV2(options)
```

For a user-assigned identity attached to the Azure host, select its client ID when
creating the credential:

```ts
const credential = new ManagedIdentityCredential({
  clientId: process.env.AZURE_CLIENT_ID!,
})
```

Other Azure credentials, including `DefaultAzureCredential` for local development
or a credential configured for workload identity federation, can be supplied in
the same `aadCredentials` property. See the
[Azure Identity documentation](https://learn.microsoft.com/en-us/javascript/api/overview/azure/identity-readme?view=azure-node-latest)
for credential selection and environment requirements.

The Agents SDK also exposes the credential used in the Blob storage example:

```ts
import {
  loadAuthConfigFromEnv,
  MsalTokenCredential,
} from '@microsoft/agents-hosting'

const credential = new MsalTokenCredential(loadAuthConfigFromEnv())
```

Supply that credential as `aadCredentials` using your agent's existing authentication
configuration. Its Cosmos scope forwarding is covered by tests with a mocked token
provider; live managed identity deployment still requires validation in your Azure
environment. The current wrapper reports a short token expiry, which can cause
frequent credential calls, and its provider returns an empty token without a
`clientId` outside production. For a system-assigned identity without an application
client ID, use the Azure Identity credential shown above.

### Provision resources and assign permissions

When `aadCredentials` is supplied without a `key` or `tokenProvider`, storage reads
the existing container directly. It does not read the database, create resources,
or modify throughput or TTL. Provision the database and container using Azure CLI,
the Azure portal, ARM/Bicep, or another management-plane deployment tool before
the first storage operation. Missing resources produce an initialization error
explaining this requirement.

Assign the runtime identity **Cosmos DB Built-in Data Contributor** (role ID
`00000000-0000-0000-0000-000000000002`), scoped to
`/dbs/<databaseId>/colls/<containerId>` when possible. Cosmos data-plane roles are
separate from Azure management roles: an Azure Contributor assignment alone does
not grant item access. Custom roles need `Microsoft.DocumentDB/databaseAccounts/readMetadata`
at the container scope and the item `read`, `create`, `replace`, `upsert`, and
`delete` data actions. See the
[Cosmos data-plane security reference](https://learn.microsoft.com/en-us/azure/cosmos-db/reference-data-plane-security)
and [role assignment guide](https://learn.microsoft.com/en-us/azure/cosmos-db/how-to-connect-role-based-access-control).

Entra tokens cannot authorize database/container creation or throughput management
through the Cosmos data endpoint, even with data contributor permissions. See
[nondata operation restrictions](https://learn.microsoft.com/en-us/azure/cosmos-db/troubleshoot-forbidden#nondata-operations-arent-allowed).

Supply one authentication mechanism for predictable configuration. Existing key
and `tokenProvider` configurations retain their resource-creation behavior. For
compatibility, configurations combining either of those with `aadCredentials`
also retain the existing initialization path; the Cosmos SDK determines their
authorization behavior. To use container-scoped, existing-resource initialization,
supply `aadCredentials` alone.

### Partitioning and expiration

Provision new containers with the single partition key path `/id`. The default
`compatibilityMode: true` also supports legacy `/_partitionKey` and unpartitioned
container metadata. With `compatibilityMode: false`, Entra initialization requires
`/id`. Custom and hierarchical partition keys are unsupported on the Entra path.
Existing key escaping and `keySuffix` rules apply to both authentication mechanisms.

For per-item TTL with `CosmosDbPartitionedStorageV2`, enable container TTL with
`defaultTtl: -1`. This allows explicit item expiration without expiring other items
by default. If container TTL is disabled, Cosmos ignores item TTL; a positive
container default can expire items without an override, including legacy writes.
Storage does not change a pre-existing container's TTL. See
[Cosmos TTL semantics](https://learn.microsoft.com/en-us/azure/cosmos-db/time-to-live).

### Reuse a storage instance

Reuse a storage instance across your application's state objects. Each instance
owns its authenticated client and shares initialization across its own concurrent
operations. Separate instances initialize independently so credentials, transport
options, and detected partition settings cannot leak between them. Failed
initialization can be retried on the same instance.
