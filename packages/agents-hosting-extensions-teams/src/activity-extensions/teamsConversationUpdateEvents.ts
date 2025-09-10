/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConversationUpdateEvents } from '@microsoft/agents-hosting'

/**
 * Represents the types of conversation update events specific to Microsoft Teams.
 * Extends the base `ConversationUpdateEvents` with additional Teams-specific events.
 */
export type TeamsConversationUpdateEvents =
    ConversationUpdateEvents |
    /**
     * Event triggered when a new channel is created.
     */
    'channelCreated'
    /**
     * Event triggered when a channel is renamed.
     */
    | 'channelRenamed'
    /**
     * Event triggered when a channel is deleted.
     */
    | 'channelDeleted'
    /**
     * Event triggered when a deleted channel is restored.
     */
    | 'channelRestored'
    /**
     * Event triggered when a team is renamed.
     */
    | 'teamRenamed'
    /**
     * Event triggered when a team is deleted.
     */
    | 'teamDeleted'
    /**
     * Event triggered when a team is permanently deleted.
     */
    | 'teamHardDeleted'
    /**
     * Event triggered when a team is archived.
     */
    | 'teamArchived'
    /**
     * Event triggered when an archived team is unarchived.
     */
    | 'teamUnarchived'
    /**
     * Event triggered when a deleted team is restored.
     */
    | 'teamRestored'
    /**
     * Event triggered when the topic name is updated.
     */
    | 'topicName'
    /**
     * Event triggered when the conversation history is disclosed.
     */
    | 'historyDisclosed'
