/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { O365ConnectorCardActionBase } from './o365ConnectorCardActionBase'
import { O365ConnectorCardSection } from './o365ConnectorCardSection'

export interface O365ConnectorCard {
  title?: string;
  text?: string;
  summary?: string;
  themeColor?: string;
  sections?: O365ConnectorCardSection[];
  potentialAction?: O365ConnectorCardActionBase[];
}
