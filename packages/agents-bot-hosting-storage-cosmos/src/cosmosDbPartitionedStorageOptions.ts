// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { CosmosClientOptions } from '@azure/cosmos'

export interface CosmosDbPartitionedStorageOptions {
  databaseId: string;
  containerId: string;
  containerThroughput?: number;
  keySuffix?: string;
  compatibilityMode?: boolean;

  cosmosClientOptions?: CosmosClientOptions;
  // tokenCredential?: TokenCredential;
}
