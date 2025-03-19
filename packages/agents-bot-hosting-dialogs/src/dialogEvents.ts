/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents the events related to the "lifecycle" of the dialog.
 */
export class DialogEvents {
  static readonly beginDialog = 'beginDialog'
  static readonly repromptDialog = 'repromptDialog'
  static readonly cancelDialog = 'cancelDialog'
  static readonly activityReceived = 'activityReceived'
  static readonly versionChanged = 'versionChanged'
  static readonly error = 'error'
}
