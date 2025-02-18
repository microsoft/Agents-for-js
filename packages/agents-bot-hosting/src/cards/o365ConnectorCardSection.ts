/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { O365ConnectorCardActionBase } from './o365ConnectorCardActionBase'
import { O365ConnectorCardFact } from './o365ConnectorCardFact'
import { O365ConnectorCardImage } from './o365ConnectorCardImage'

export type ActivityImageType = 'avatar' | 'article'

export interface O365ConnectorCardSection {
  title?: string
  text?: string
  activityTitle?: string
  activitySubtitle?: string
  activityText?: string
  activityImage?: string
  activityImageType?: ActivityImageType
  markdown?: boolean
  facts?: O365ConnectorCardFact[]
  images?: O365ConnectorCardImage[]
  potentialAction?: O365ConnectorCardActionBase[]
}
