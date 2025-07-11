/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Provides constants used to manage the state of a dialog turn.
 *
 * @remarks
 * These constants are used as keys to store and retrieve specific state information
 * during the execution of a dialog turn.
 */
export class DialogTurnStateConstants {
  /**
   * Symbol representing the configuration for the dialog turn.
   */
  static configuration = Symbol('configuration')

  /**
   * Symbol representing the dialog manager instance.
   */
  static dialogManager = Symbol('dialogManager')

  /**
   * Symbol representing the queue storage for the dialog turn.
   */
  static queueStorage = Symbol('queueStorage')
}
