/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { CardAction } from '@microsoft/agents-activity-schema'
import { MediaUrl } from './mediaUrl'
import { ThumbnailUrl } from './thumbnailUrl'

export interface AudioCard {
  title: string
  subtitle: string
  text: string
  image: ThumbnailUrl
  media: MediaUrl[]
  buttons: CardAction[]
  shareable: boolean
  autoloop: boolean
  autostart: boolean
  aspect: string
  duration: string
  value: any
}
