/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { CardAction } from '@microsoft/agents-activity-schema'
import { CardImage } from './cardImage'

export interface ReceiptItem {
  title: string
  subtitle?: string
  text?: string
  image: CardImage
  price: string
  quantity: number
  tap?: CardAction
}
