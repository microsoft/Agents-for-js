// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import type { Storage } from '../../storage/storage'

/**
 * Configuration for the proactive messaging subsystem.
 */
export interface ProactiveOptions {
  /**
   * Storage backend for persisting conversation references.
   *
   * If omitted, falls back to `AgentApplicationOptions.storage`.
   * A warning is logged when the fallback is used.
   * Throws at initialization time if neither is configured.
   */
  storage?: Storage

  /**
   * When `true` (default), `continueConversation()` throws if any requested
   * token handler's user has not previously signed in.
   */
  failOnUnsignedInConnections?: boolean
}
