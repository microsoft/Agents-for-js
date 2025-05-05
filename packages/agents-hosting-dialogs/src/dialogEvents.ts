/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents the events related to the "lifecycle" of the dialog.
 *
 * These events are used to signal various stages or actions within a dialog's lifecycle.
 */
export class DialogEvents {
  /**
   * Event triggered when a dialog begins.
   */
  static readonly beginDialog = 'beginDialog'

  /**
   * Event triggered to reprompt a dialog.
   */
  static readonly repromptDialog = 'repromptDialog'

  /**
   * Event triggered when a dialog is canceled.
   */
  static readonly cancelDialog = 'cancelDialog'

  /**
   * Event triggered when an activity is received.
   */
  static readonly activityReceived = 'activityReceived'

  /**
   * Event triggered when the dialog version changes.
   */
  static readonly versionChanged = 'versionChanged'

  /**
   * Event triggered when an error occurs.
   */
  static readonly error = 'error'
}
