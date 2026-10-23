// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Activity } from '@microsoft/agents-activity'
import { addTargetedMessageInfo } from './teamsActivityExtensions'

const QUOTED_REPLY_ENTITY_TYPE = 'quotedReply'
const QUOTED_PLACEHOLDER_PATTERN = /<quoted messageId="[^"]*"\/>/g

export function normalizePromptPreviewActivity (activity: Activity, messageId: string): void {
  if (activity.entities) {
    activity.entities = activity.entities.filter(entity => entity.type !== QUOTED_REPLY_ENTITY_TYPE)
  }

  if (activity.text) {
    const textWithoutPlaceholder = activity.text.replace(QUOTED_PLACEHOLDER_PATTERN, '')
    if (textWithoutPlaceholder.length !== activity.text.length) {
      activity.text = textWithoutPlaceholder.trim()
    }
  }

  addTargetedMessageInfo(activity, messageId)
}
