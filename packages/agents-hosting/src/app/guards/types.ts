/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity } from '@microsoft/agents-activity'
import { StoreItem } from '../../storage'
import { TurnContext } from '../../turnContext'

/**
 * Represents the status of a guard registration attempt.
 */
export enum GuardRegisterStatus {
  /** The guard has approved the request - validation passed */
  APPROVED = 'approved',
  /** The guard registration is pending further action */
  PENDING = 'pending',
  /** The guard has rejected the request - validation failed */
  REJECTED = 'rejected',
  /** The guard has ignored the request - no action taken */
  IGNORED = 'ignored',
}

/**
 * Options for guard registration.
 */
export interface GuardRegisterOptions {
  /**
   * The current turn context.
   */
  context: TurnContext
  /**
   * The active guard session, if any.
   */
  active?: ActiveGuard
}

/**
 * Interface for all guard implementations.
 */
export interface Guard {
  /**
   * Unique identifier for the guard.
   */
  readonly id: string
  /**
   * Registers the guard with the given options.
   * @param options Registration options.
   */
  register(options: GuardRegisterOptions): GuardRegisterStatus | Promise<GuardRegisterStatus>
}

/**
 * Active guard manager information.
 */
export interface ActiveGuard extends StoreItem {
  /**
   * The identifier of the guard.
  */
  guard: string
  /**
   * The current activity associated with the guard.
   */
  activity: Activity
  /**
  * The number of attempts left for the guard.
  */
  attemptsLeft: number
}
