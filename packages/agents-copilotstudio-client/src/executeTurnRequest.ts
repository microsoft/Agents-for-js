/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity } from '@microsoft/agents-bot-activity'

export class ExecuteTurnRequest {
  /** The activity to be executed. */
  activity?: Activity

  /**
   * Creates an instance of ExecuteTurnRequest.
   * @param activity The activity to be executed.
   */
  constructor (activity?: Activity) {
    this.activity = activity
  }
}
