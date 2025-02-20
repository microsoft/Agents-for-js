/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { CardAction } from '@microsoft/agents-bot-activity'

/**
 * Interface representing a Card Image.
 */
export interface CardImage {
  /** The URL of the image. */
  url: string
  /** The alternative text for the image. */
  alt?: string
  /** The action to be performed when the image is tapped. */
  tap?: CardAction
}
