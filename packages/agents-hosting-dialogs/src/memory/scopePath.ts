/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Defines paths for the available scopes.
 */
export class ScopePath {
  /**
   * Path for user-specific data.
   */
  static readonly user = 'user'

  /**
   * Path for conversation-specific data.
   */
  static readonly conversation = 'conversation'

  /**
   * Path for dialog-specific data.
   */
  static readonly dialog = 'dialog'

  /**
   * Path for dialog class-specific data.
   */
  static readonly dialogClass = 'dialogClass'

  /**
   * Path for dialog context-specific data.
   */
  static readonly dialogContext = 'dialogContext'

  /**
   * Path for the current dialog instance data.
   */
  static readonly this = 'this'

  /**
   * Path for class-specific data.
   */
  static readonly class = 'class'

  /**
   * Path for settings-specific data.
   */
  static readonly settings = 'settings'

  /**
   * Path for turn-specific data.
   */
  static readonly turn = 'turn'
}
