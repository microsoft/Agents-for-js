/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { CardAction } from '../../../agents-bot-activity/dist/src'
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
