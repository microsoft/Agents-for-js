/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { CardAction } from '../../../agents-bot-activity/dist/src'
import { CardImage } from './cardImage'

export interface ThumbnailCard {
  title: string
  subtitle: string
  text: string
  images: CardImage[]
  buttons: CardAction[]
  tap: CardAction
}
