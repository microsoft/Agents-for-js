/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { CardAction } from '@microsoft/agents-activity-schema'

export class TaskModuleAction implements CardAction {
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

  type: string
  title: string
  image?: string | undefined
  text?: string | undefined
  displayText?: string | undefined
  value: unknown
  channelData?: unknown
  imageAltText?: string | undefined
}
