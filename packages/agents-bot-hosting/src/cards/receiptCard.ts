/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { CardAction } from '../../../agents-bot-activity/dist/src'
import { Fact } from './fact'
import { ReceiptItem } from './receiptItem'

export interface ReceiptCard {
  title: string
  facts: Fact[]
  items: ReceiptItem[]
  tap?: CardAction
  total: string
  tax: string
  vat?: string
  buttons: CardAction[]
}
