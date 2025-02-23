/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity } from '@microsoft/agents-bot-activity'

export class ExecuteTurnRequest {
  activity?: Activity

  constructor (activity?: Activity) {
    this.activity = activity
  }
}
