/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { Attachment } from '@microsoft/agents-bot-activity'

export interface TaskModuleTaskInfo {
  title?: string
  height?: number | 'small' | 'medium' | 'large'
  width?: number | 'small' | 'medium' | 'large'
  url?: string
  card?: Attachment
  fallbackUrl?: string
  completionBotId?: string
}
