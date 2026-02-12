/**
 * Agents SDK adapter for adding A2A protocol support
 */

/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Storage } from '@microsoft/agents-hosting'

// Import types only with resolution-mode for CommonJS
import type { TaskStore } from '@a2a-js/sdk/server' with { 'resolution-mode': 'require' }
import type { Task } from '@a2a-js/sdk' with { 'resolution-mode': 'require' }

/* TaskStore implementation that uses the Agents Hosting Storage interface for persistence.
 * Wraps the Agents SDK storage class with the A2A get/set
*/
export class A2ATaskStore implements TaskStore {
  constructor (private storage: Storage) {

  }

  makeKeyFromTaskId (taskId: string): string {
    return `task-${taskId}`
  }

  async load (taskId: string): Promise<Task | undefined> {
    const key = this.makeKeyFromTaskId(taskId)
    const entry = await this.storage.read([key])
    if (entry[key]) {
      return entry[key] as Task
    }
    return undefined
  }

  async save (task: Task): Promise<void> {
    const key = this.makeKeyFromTaskId(task.id)
    // Store copies to prevent internal mutation if caller reuses objects
    const update = {
      [key]: JSON.parse(JSON.stringify(task))
    }
    await this.storage.write(update)
  }
}
