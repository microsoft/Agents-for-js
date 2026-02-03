/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConversationReference } from '@microsoft/agents-activity'
import { JwtPayload } from 'jsonwebtoken'
import { Storage, StoreItem } from '../../storage'

/**
 * Options for configuring proactive messaging support on an {@link AgentApplication}.
 */
export interface ProactiveOptions {
  /**
   * Storage provider used to persist conversation references.
   * Defaults to the application's configured storage.
   */
  storage?: Storage;

  /**
   * When true, the SDK automatically persists conversation references
   * after each turn (defaults to false).
   */
  autoPersistReferences?: boolean;

  /**
   * Optional time-to-live in seconds for stored references.
   * When set, references expiring in the past are automatically removed.
   */
  referenceTtlSeconds?: number;

  /**
   * Optional factory to customize how a storage key is derived for a conversation.
   */
  keyFactory?: (channelId: string, conversationId: string) => string | Promise<string>;
}

/**
 * Represents a stored conversation reference and associated identity.
 */
export interface ProactiveReferenceRecord extends StoreItem {
  conversationId: string;
  channelId: string;
  identity: JwtPayload;
  reference: ConversationReference;
  updatedUtc: string;
  expiresUtc?: string;
}

/**
 * Result of sending proactive activities.
 */
export interface ProactiveSendResult {
  /**
   * Activity identifiers returned from the connector.
   */
  activityIds: string[];
}
