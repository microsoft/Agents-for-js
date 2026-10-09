/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { CardAction } from '@microsoft/agents-activity'

/**
 * Represents a task module action.
 */
export class TaskModuleAction implements CardAction {
  /**
   * Creates an action that invokes a `task/fetch` task module.
   *
   * @param title The action title.
   * @param value The action data as an object or JSON string.
   */
  constructor (title: string, value: any) {
    this.type = 'invoke'
    this.title = title
    let data: any

    if (!value) {
      data = JSON.parse('{}')
    } else if (typeof value === 'object') {
      data = value
    } else {
      data = JSON.parse(value)
    }

    data.type = 'task/fetch'
    this.value = data as string
  }

  /**
   * The type of the action.
   */
  type: string
  /**
   * The title of the action.
   */
  title: string
  /**
   * The image associated with the action.
   */
  image?: string | undefined
  /**
   * The text associated with the action.
   */
  text?: string | undefined
  /**
   * The display text of the action.
   */
  displayText?: string | undefined
  /**
   * The value of the action.
   */
  value: unknown
  /**
   * The channel data of the action.
   */
  channelData?: unknown
  /**
   * The alt text for the image.
   */
  imageAltText?: string | undefined
}
