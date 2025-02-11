/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity } from '../../agents-bot-activity'

export class ExecuteTurnRequest {
  activity?: Activity

  constructor (activity?: Activity) {
    this.activity = activity
  }
}
