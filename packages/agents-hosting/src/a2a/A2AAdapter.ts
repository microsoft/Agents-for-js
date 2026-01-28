/**
 * Agents SDK adapter for adding A2A protocol support
 */

/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseAdapter } from '../baseAdapter'
import { TurnContext } from '../turnContext'
import { Activity, ConversationReference } from '@microsoft/agents-activity'
import { JwtPayload } from 'jsonwebtoken'
import { Response } from 'express'
import { AttachmentData } from '../connector-client/attachmentData'
import { AttachmentInfo } from '../connector-client/attachmentInfo'
import { Request } from '../auth/request'
import { ResourceResponse } from '../connector-client/resourceResponse'
import { debug } from '@microsoft/agents-activity/logger'
const logger = debug('agents:a2a-adapter')

/**
 * Adapter for handling agent interactions with various channels through cloud-based services.
 *
 * @remarks
 * CloudAdapter processes incoming HTTP requests from A2A clients, validates and
 * authenticates them, and generates outgoing responses. It manages the communication
 * flow between agents and users across different channels, handling activities, attachments,
 * and conversation continuations.
 */
export class A2AAdapter extends BaseAdapter {
  constructor () {
    super()
    // todo : implement
    logger.debug('A2A Adapter initialized')
  }

  /**
     * Sends multiple activities to the conversation.
     * @param context - The TurnContext for the current turn.
     * @param activities - The activities to send.
     * @returns A promise representing the array of ResourceResponses for the sent activities.
     */
  async sendActivities (context: TurnContext, activities: Activity[]): Promise<ResourceResponse[]> {
    // todo : implement
    return []
  }

  async updateActivity (context: TurnContext, activity: Activity): Promise<ResourceResponse | void> {
    throw new Error('Method not implemented.')
  }

  async deleteActivity (context: TurnContext, reference: Partial<ConversationReference>): Promise<void> {
    throw new Error('Method not implemented.')
  }

  async uploadAttachment (context: TurnContext, conversationId: string, attachmentData: AttachmentData): Promise<ResourceResponse> {
    throw new Error('Method not implemented.')
  }

  async getAttachmentInfo (context: TurnContext, attachmentId: string): Promise<AttachmentInfo> {
    throw new Error('Method not implemented.')
  }

  async getAttachment (context: TurnContext, attachmentId: string, viewId: string): Promise<NodeJS.ReadableStream> {
    throw new Error('Method not implemented.')
  }

  async continueConversation (
    botAppIdOrIdentity: string | JwtPayload,
    reference: ConversationReference,
    logic: (revocableContext: TurnContext) => Promise<void>,
    isResponse: Boolean = false): Promise<void> {
    throw new Error('Method not implemented.')
  }

  /**
       * Processes an incoming request and sends the response.
       * @param request - The incoming request.
       * @param res - The response to send.
       * @param logic - The logic to execute.
       * @param headerPropagation - Optional function to handle header propagation.
       */
  public async process (
    request: Request,
    res: Response,
    logic: (context: TurnContext) => Promise<void>): Promise<void> {
    // todo : implement
    logger.debug('Processing A2A request')
  }
}
