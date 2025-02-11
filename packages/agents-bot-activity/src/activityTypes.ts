/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

export enum ActivityTypes {
  Message = 'message',
  ContactRelationUpdate = 'contactRelationUpdate',
  ConversationUpdate = 'conversationUpdate',
  Typing = 'typing',
  EndOfConversation = 'endOfConversation',
  Event = 'event',
  Invoke = 'invoke',
  InvokeResponse = 'invokeResponse',
  DeleteUserData = 'deleteUserData',
  MessageUpdate = 'messageUpdate',
  MessageDelete = 'messageDelete',
  InstallationUpdate = 'installationUpdate',
  MessageReaction = 'messageReaction',
  Suggestion = 'suggestion',
  Trace = 'trace',
  Handoff = 'handoff',
  Command = 'command',
  CommandResult = 'commandResult',
  Delay = 'delay'
}

export const activityTypesZodSchema = z.enum([
  'message',
  'contactRelationUpdate',
  'conversationUpdate',
  'typing',
  'endOfConversation',
  'event',
  'invoke',
  'invokeResponse',
  'deleteUserData',
  'messageUpdate',
  'messageDelete',
  'installationUpdate',
  'messageReaction',
  'suggestion',
  'trace',
  'handoff',
  'command',
  'commandResult',
  'delay'
])
