/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

/**
 * Enum representing the different Teams channel types.
 */
export enum ChannelTypes {
  /**
   * Represents a private Teams channel.
   */
  Private = 'private',

  /**
   * Represents a shared Teams channel.
   */
  Shared = 'shared',

  /**
   * Represents a standard Teams channel.
   */
  Standard = 'standard',
}

/**
 * Zod schema for validating channel types.
 */
export const channelTypeZodSchema = z.enum(['standard', 'private', 'shared'])
