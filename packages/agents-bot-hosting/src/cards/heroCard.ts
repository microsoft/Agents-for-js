/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { CardAction } from '@microsoft/agents-activity-schema'
import { CardImage } from './cardImage'

export interface HeroCard {
  title: string
  subtitle: string
  text: string
  images: CardImage[]
  buttons: CardAction[]
  tap: CardAction
}
