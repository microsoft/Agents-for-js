// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { TaskModuleResponse, TaskModuleTaskInfo } from '@microsoft/agents-bot-hosting'

export class TaskModuleResponseFactory {
  static toTaskModuleResponse (taskInfo: TaskModuleTaskInfo): TaskModuleResponse {
    return TaskModuleResponseFactory.createResponse(taskInfo)
  }

  static createResponse (taskInfo: TaskModuleTaskInfo) {
    const taskModuleResponse: TaskModuleResponse = {
      task: {
        type: 'continue',
        value: taskInfo
      }
    }

    return taskModuleResponse
  }

  static createMessageResponse (message: string): TaskModuleResponse {
    const taskModuleResponse: TaskModuleResponse = {
      task: {
        type: 'message',
        value: message
      }
    }

    return taskModuleResponse
  }
}
