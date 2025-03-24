// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { CosmosClientOptions } from '@azure/cosmos'

/**
 * Options for configuring Cosmos DB partitioned storage.
 */
export interface CosmosDbPartitionedStorageOptions {
  /**
   * The ID of the database.
   */
  databaseId: string;
  /**
   * The ID of the container.
   */
  containerId: string;
  /**
   * The throughput of the container.
   */
  containerThroughput?: number;
  /**
   * The suffix to append to keys.
   */
  keySuffix?: string;
  /**
   * Indicates whether compatibility mode is enabled.
   */
  compatibilityMode?: boolean;

  /**
   * The options for the Cosmos client.
   */
  cosmosClientOptions?: CosmosClientOptions;
  // tokenCredential?: TokenCredential;
}
