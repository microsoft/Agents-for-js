/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConversationUpdateEvents } from '@microsoft/agents-hosting'

export type TeamsConversationUpdateEvents =
    ConversationUpdateEvents |
    'channelCreated'
    | 'channelRenamed'
    | 'channelDeleted'
    | 'channelRestored'
    | 'teamRenamed'
    | 'teamDeleted'
    | 'teamHardDeleted'
    | 'teamArchived'
    | 'teamUnarchived'
    | 'teamRestored'
    | 'topicName'
    | 'historyDisclosed'
