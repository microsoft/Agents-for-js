/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ActivityHandler } from '../activityHandler'
import { ConnectorClient } from '../connector-client/connectorClient'
import { TurnContext } from '../turnContext'
import { ReadReceiptInfo } from './readReceipInfo'
import * as z from 'zod'
import { ChannelInfo, Channels, MessagingExtensionQuery, TeamInfo, validateValueMessagingExtensionQuery } from '@microsoft/agents-activity-schema'
import { FileConsentCardResponse } from './file/fileConsentCardResponse'
import { TaskModuleRequest } from './task/taskModuleRequest'
import { TabRequest } from './tab/tabRequest'
import { TabSubmit } from './tab/tabSubmit'
import { TabResponse } from './tab/tabResponse'
import { TaskModuleResponse } from './task/taskModuleResponse'
import { TeamsChannelAccount } from '../connector-client/teamsChannelAccount'
import { MeetingStartEventDetails } from './meeting/meetingStartEventDetails'
import { MeetingEndEventDetails } from './meeting/meetingEndEventDetails'
import { MeetingParticipantsEventDetails } from './meeting/meetingParticipantsEventDetails'
import { TeamsMeetingMember } from './meeting/teamsMeetingMember'
import { O365ConnectorCardActionQuery } from './query/o365ConnectorCardActionQuery'
import { AppBasedLinkQuery } from './query/appBasedLinkQuery'
import { SigninStateVerificationQuery } from './query/signinStateVerificationQuery'
import { ConfigResponse } from './bot-config/configResponse'
import { MessagingExtensionAction } from './messaging-extension/messagingExtensionAction'
import { MessagingExtensionResponse } from './messaging-extension/messagingExtensionResponse'
import { MessagingExtensionActionResponse } from './messaging-extension/messagingExtensionActionResponse'
import { InvokeResponse } from '../invoke/invokeResponse'

const TeamsMeetingStartT = z
  .object({
    Id: z.string(),
    JoinUrl: z.string(),
    MeetingType: z.string(),
    Title: z.string(),
    StartTime: z.string()
  })

const TeamsMeetingEndT = z
  .object({
    Id: z.string(),
    JoinUrl: z.string(),
    MeetingType: z.string(),
    Title: z.string(),
    EndTime: z.string()
  })

export class TeamsActivityHandler extends ActivityHandler {
  protected async onInvokeActivity (context: TurnContext): Promise<InvokeResponse> {
    let runEvents = true
    try {
      if (!context.activity.name && context.activity.channelId === 'msteams') {
        return await this.handleTeamsCardActionInvoke(context)
      } else {
        switch (context.activity.name) {
          case 'config/fetch':
            return ActivityHandler.createInvokeResponse(
              await this.handleTeamsConfigFetch(context, context.activity.value)
            )
          case 'config/submit':
            return ActivityHandler.createInvokeResponse(
              await this.handleTeamsConfigSubmit(context, context.activity.value)
            )
          case 'fileConsent/invoke':
            return ActivityHandler.createInvokeResponse(
              await this.handleTeamsFileConsent(context, context.activity.value as FileConsentCardResponse)
            )

          case 'actionableMessage/executeAction':
            await this.handleTeamsO365ConnectorCardAction(context, context.activity.value as O365ConnectorCardActionQuery)
            return ActivityHandler.createInvokeResponse()

          case 'composeExtension/queryLink':
            return ActivityHandler.createInvokeResponse(
              await this.handleTeamsAppBasedLinkQuery(context, context.activity.value as AppBasedLinkQuery)
            )

          case 'composeExtension/anonymousQueryLink':
            return ActivityHandler.createInvokeResponse(
              await this.handleTeamsAnonymousAppBasedLinkQuery(context, context.activity.value as AppBasedLinkQuery)
            )

          case 'composeExtension/query':
            return ActivityHandler.createInvokeResponse(
              await this.handleTeamsMessagingExtensionQuery(context, validateValueMessagingExtensionQuery(context.activity.value))
            )

          case 'composeExtension/selectItem':
            return ActivityHandler.createInvokeResponse(
              await this.handleTeamsMessagingExtensionSelectItem(context, context.activity.value)
            )

          case 'composeExtension/submitAction':
            return ActivityHandler.createInvokeResponse(
              await this.handleTeamsMessagingExtensionSubmitActionDispatch(
                context,
                context.activity.value as MessagingExtensionAction
              )
            )

          case 'composeExtension/fetchTask':
            return ActivityHandler.createInvokeResponse(
              await this.handleTeamsMessagingExtensionFetchTask(context, context.activity.value as MessagingExtensionAction)
            )

          case 'composeExtension/querySettingUrl':
            return ActivityHandler.createInvokeResponse(
              await this.handleTeamsMessagingExtensionConfigurationQuerySettingUrl(
                context,
                context.activity.value as MessagingExtensionQuery
              )
            )

          case 'composeExtension/setting':
            await this.handleTeamsMessagingExtensionConfigurationSetting(context, context.activity.value)
            return ActivityHandler.createInvokeResponse()

          case 'composeExtension/onCardButtonClicked':
            await this.handleTeamsMessagingExtensionCardButtonClicked(context, context.activity.value)
            return ActivityHandler.createInvokeResponse()

          case 'task/fetch':
            return ActivityHandler.createInvokeResponse(
              await this.handleTeamsTaskModuleFetch(context, context.activity.value as TaskModuleRequest)
            )

          case 'task/submit':
            return ActivityHandler.createInvokeResponse(
              await this.handleTeamsTaskModuleSubmit(context, context.activity.value as TaskModuleRequest)
            )

          case 'tab/fetch':
            return ActivityHandler.createInvokeResponse(
              await this.handleTeamsTabFetch(context, context.activity.value as TabRequest)
            )

          case 'tab/submit':
            return ActivityHandler.createInvokeResponse(
              await this.handleTeamsTabSubmit(context, context.activity.value as TabSubmit)
            )

          default:
            runEvents = false
            return await super.onInvokeActivity(context)
        }
      }
    } catch (err: any) {
      if (err.message === 'NotImplemented') {
        return { status: 501 }
      } else if (err.message === 'BadRequest') {
        return { status: 400 }
      }
      throw err
    } finally {
      if (runEvents) {
        this.defaultNextEvent(context)()
      }
    }
  }

  protected async handleTeamsCardActionInvoke (_context: TurnContext): Promise<InvokeResponse> {
    throw new Error('NotImplemented')
  }

  protected async handleTeamsConfigFetch (_context: TurnContext, _configData: any): Promise<ConfigResponse> {
    throw new Error('NotImplemented')
  }

  protected async handleTeamsConfigSubmit (_context: TurnContext, _configData: any): Promise<ConfigResponse> {
    throw new Error('NotImplemented')
  }

  protected async handleTeamsFileConsent (
    context: TurnContext,
    fileConsentCardResponse: FileConsentCardResponse
  ): Promise<void> {
    switch (fileConsentCardResponse.action) {
      case 'accept':
        return await this.handleTeamsFileConsentAccept(context, fileConsentCardResponse)
      case 'decline':
        return await this.handleTeamsFileConsentDecline(context, fileConsentCardResponse)
      default:
        throw new Error('BadRequest')
    }
  }

  protected async handleTeamsFileConsentAccept (
    _context: TurnContext,
    _fileConsentCardResponse: FileConsentCardResponse
  ): Promise<void> {
    throw new Error('NotImplemented')
  }

  protected async handleTeamsFileConsentDecline (
    _context: TurnContext,
    _fileConsentCardResponse: FileConsentCardResponse
  ): Promise<void> {
    throw new Error('NotImplemented')
  }

  protected async handleTeamsO365ConnectorCardAction (
    _context: TurnContext,
    _query: O365ConnectorCardActionQuery
  ): Promise<void> {
    throw new Error('NotImplemented')
  }

  // protected async onSignInInvoke (context: TurnContext): Promise<void> {
  //   switch (context.activity.name) {
  //     case verifyStateOperationName:
  //       return await this.handleTeamsSigninVerifyState(context, context.activity.value as SigninStateVerificationQuery)
  //     case tokenExchangeOperationName:
  //       return await this.handleTeamsSigninTokenExchange(context, context.activity.value as SigninStateVerificationQuery)
  //   }
  // }

  protected async handleTeamsSigninVerifyState (
    _context: TurnContext,
    _query: SigninStateVerificationQuery
  ): Promise<void> {
    throw new Error('NotImplemented')
  }

  protected async handleTeamsSigninTokenExchange (
    _context: TurnContext,
    _query: SigninStateVerificationQuery
  ): Promise<void> {
    throw new Error('NotImplemented')
  }

  protected async handleTeamsMessagingExtensionCardButtonClicked (
    _context: TurnContext,
    _cardData: any
  ): Promise<void> {
    throw new Error('NotImplemented')
  }

  protected async handleTeamsTaskModuleFetch (
    _context: TurnContext,
    _taskModuleRequest: TaskModuleRequest
  ): Promise<TaskModuleResponse> {
    throw new Error('NotImplemented')
  }

  protected async handleTeamsTaskModuleSubmit (
    _context: TurnContext,
    _taskModuleRequest: TaskModuleRequest
  ): Promise<TaskModuleResponse> {
    throw new Error('NotImplemented')
  }

  protected async handleTeamsTabFetch (_context: TurnContext, _tabRequest: TabRequest): Promise<TabResponse> {
    throw new Error('NotImplemented')
  }

  protected async handleTeamsTabSubmit (_context: TurnContext, _tabSubmit: TabSubmit): Promise<TabResponse> {
    throw new Error('NotImplemented')
  }

  protected async handleTeamsAppBasedLinkQuery (
    _context: TurnContext,
    _query: AppBasedLinkQuery
  ): Promise<MessagingExtensionResponse> {
    throw new Error('NotImplemented')
  }

  protected async handleTeamsAnonymousAppBasedLinkQuery (
    _context: TurnContext,
    _query: AppBasedLinkQuery
  ): Promise<MessagingExtensionResponse> {
    throw new Error('NotImplemented')
  }

  protected async handleTeamsMessagingExtensionQuery (
    _context: TurnContext,
    _query: MessagingExtensionQuery
  ): Promise<MessagingExtensionResponse> {
    throw new Error('NotImplemented')
  }

  protected async handleTeamsMessagingExtensionSelectItem (
    _context: TurnContext,
    _query: any
  ): Promise<MessagingExtensionResponse> {
    throw new Error('NotImplemented')
  }

  protected async handleTeamsMessagingExtensionSubmitActionDispatch (
    context: TurnContext,
    action: MessagingExtensionAction
  ): Promise<MessagingExtensionActionResponse> {
    if (action.botMessagePreviewAction) {
      switch (action.botMessagePreviewAction) {
        case 'edit':
          return await this.handleTeamsMessagingExtensionBotMessagePreviewEdit(context, action)
        case 'send':
          return await this.handleTeamsMessagingExtensionBotMessagePreviewSend(context, action)
        default:
          throw new Error('BadRequest')
      }
    } else {
      return await this.handleTeamsMessagingExtensionSubmitAction(context, action)
    }
  }

  protected async handleTeamsMessagingExtensionSubmitAction (
    _context: TurnContext,
    _action: MessagingExtensionAction
  ): Promise<MessagingExtensionActionResponse> {
    throw new Error('NotImplemented')
  }

  protected async handleTeamsMessagingExtensionBotMessagePreviewEdit (
    _context: TurnContext,
    _action: MessagingExtensionAction
  ): Promise<MessagingExtensionActionResponse> {
    throw new Error('NotImplemented')
  }

  protected async handleTeamsMessagingExtensionBotMessagePreviewSend (
    _context: TurnContext,
    _action: MessagingExtensionAction
  ): Promise<MessagingExtensionActionResponse> {
    throw new Error('NotImplemented')
  }

  protected async handleTeamsMessagingExtensionFetchTask (
    _context: TurnContext,
    _action: MessagingExtensionAction
  ): Promise<MessagingExtensionActionResponse> {
    throw new Error('NotImplemented')
  }

  protected async handleTeamsMessagingExtensionConfigurationQuerySettingUrl (
    _context: TurnContext,
    _query: MessagingExtensionQuery
  ): Promise<MessagingExtensionResponse> {
    throw new Error('NotImplemented')
  }

  protected async handleTeamsMessagingExtensionConfigurationSetting (_context: TurnContext, _settings: any): Promise<void> {
    throw new Error('NotImplemented')
  }

  protected async dispatchConversationUpdateActivity (context: TurnContext): Promise<void> {
    if (context.activity.channelId === 'msteams') {
      const channelData = context.activity.validateTeamsChannelData(context.activity.channelData)

      if ((context.activity.membersAdded != null) && context.activity.membersAdded.length > 0) {
        return await this.onTeamsMembersAdded(context)
      }

      if ((context.activity.membersRemoved != null) && context.activity.membersRemoved.length > 0) {
        return await this.onTeamsMembersRemoved(context)
      }

      if (!channelData || !channelData.eventType) {
        return await super.dispatchConversationUpdateActivity(context)
      }

      switch (channelData.eventType) {
        case 'channelCreated':
          return await this.onTeamsChannelCreated(context)

        case 'channelDeleted':
          return await this.onTeamsChannelDeleted(context)

        case 'channelRenamed':
          return await this.onTeamsChannelRenamed(context)

        case 'teamArchived':
          return await this.onTeamsTeamArchived(context)

        case 'teamDeleted':
          return await this.onTeamsTeamDeleted(context)

        case 'teamHardDeleted':
          return await this.onTeamsTeamHardDeleted(context)

        case 'channelRestored':
          return await this.onTeamsChannelRestored(context)

        case 'teamRenamed':
          return await this.onTeamsTeamRenamed(context)

        case 'teamRestored':
          return await this.onTeamsTeamRestored(context)

        case 'teamUnarchived':
          return await this.onTeamsTeamUnarchived(context)

        default:
          return await super.dispatchConversationUpdateActivity(context)
      }
    } else {
      return await super.dispatchConversationUpdateActivity(context)
    }
  }

  protected async dispatchMessageUpdateActivity (context: TurnContext): Promise<void> {
    if (context.activity.channelId === 'msteams') {
      const channelData = context.activity.validateTeamsChannelData(context.activity.channelData)

      switch (channelData.eventType) {
        case 'undeleteMessage':
          return await this.onTeamsMessageUndelete(context)

        case 'editMessage':
          return await this.onTeamsMessageEdit(context)

        default:
          return await super.dispatchMessageUpdateActivity(context)
      }
    } else {
      return await super.dispatchMessageUpdateActivity(context)
    }
  }

  protected async dispatchMessageDeleteActivity (context: TurnContext): Promise<void> {
    if (context.activity.channelId === 'msteams') {
      const channelData = context.activity.validateTeamsChannelData(context.activity.channelData)

      switch (channelData.eventType) {
        case 'softDeleteMessage':
          return await this.onTeamsMessageSoftDelete(context)

        default:
          return await super.dispatchMessageDeleteActivity(context)
      }
    } else {
      return await super.dispatchMessageDeleteActivity(context)
    }
  }

  protected async onTeamsMessageUndelete (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsMessageUndelete', this.defaultNextEvent(context))
  }

  protected async onTeamsMessageEdit (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsMessageEdit', this.defaultNextEvent(context))
  }

  protected async onTeamsMessageSoftDelete (context: TurnContext): Promise<void> {
    await this.handle(context, 'onTeamsMessageSoftDelete', this.defaultNextEvent(context))
  }

  protected async onTeamsMembersAdded (context: TurnContext): Promise<void> {
    if ('TeamsMembersAdded' in this.handlers && this.handlers.TeamsMembersAdded.length > 0) {
      if (!context.activity || (context.activity.membersAdded == null)) {
        throw new Error('OnTeamsMemberAdded: context.activity is undefined')
      }
      for (let i = 0; i < context.activity.membersAdded.length; i++) {
        const channelAccount = context.activity.membersAdded[i]

        if (
          'givenName' in channelAccount ||
                    'surname' in channelAccount ||
                    'email' in channelAccount ||
                    'userPrincipalName' in channelAccount ||
                    ((context.activity.recipient != null) && context.activity.recipient.id === channelAccount.id)
        ) {
          continue
        }

        try {
          context.activity.membersAdded[i] = await ConnectorClient.getMember(context.activity, channelAccount.id!)
        } catch (err: any) {
          const errCode: string = err.body && err.body.error && err.body.error.code
          if (errCode === 'ConversationNotFound') {
            const teamsChannelAccount: TeamsChannelAccount = {
              id: channelAccount.id,
              name: channelAccount.name,
              aadObjectId: channelAccount.aadObjectId,
              role: channelAccount.role
            }

            context.activity.membersAdded[i] = teamsChannelAccount
          } else {
            throw err
          }
        }
      }

      await this.handle(context, 'TeamsMembersAdded', this.defaultNextEvent(context))
    } else {
      await this.handle(context, 'MembersAdded', this.defaultNextEvent(context))
    }
  }

  protected async onTeamsMembersRemoved (context: TurnContext): Promise<void> {
    if ('TeamsMembersRemoved' in this.handlers && this.handlers.TeamsMembersRemoved.length > 0) {
      await this.handle(context, 'TeamsMembersRemoved', this.defaultNextEvent(context))
    } else {
      await this.handle(context, 'MembersRemoved', this.defaultNextEvent(context))
    }
  }

  protected async onTeamsChannelCreated (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsChannelCreated', this.defaultNextEvent(context))
  }

  protected async onTeamsChannelDeleted (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsChannelDeleted', this.defaultNextEvent(context))
  }

  protected async onTeamsChannelRenamed (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsChannelRenamed', this.defaultNextEvent(context))
  }

  protected async onTeamsTeamArchived (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsTeamArchived', this.defaultNextEvent(context))
  }

  protected async onTeamsTeamDeleted (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsTeamDeleted', this.defaultNextEvent(context))
  }

  protected async onTeamsTeamHardDeleted (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsTeamHardDeleted', this.defaultNextEvent(context))
  }

  protected async onTeamsChannelRestored (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsChannelRestored', this.defaultNextEvent(context))
  }

  protected async onTeamsTeamRenamed (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsTeamRenamed', this.defaultNextEvent(context))
  }

  protected async onTeamsTeamRestored (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsTeamRestored', this.defaultNextEvent(context))
  }

  protected async onTeamsTeamUnarchived (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsTeamUnarchived', this.defaultNextEvent(context))
  }

  onTeamsMessageUndeleteEvent (handler: (context: TurnContext, next: () => Promise<void>) => Promise<void>): this {
    return this.on('TeamsMessageUndelete', async (context, next) => {
      await handler(context, next)
    })
  }

  onTeamsMessageEditEvent (handler: (context: TurnContext, next: () => Promise<void>) => Promise<void>): this {
    return this.on('TeamsMessageEdit', async (context, next) => {
      await handler(context, next)
    })
  }

  onTeamsMessageSoftDeleteEvent (handler: (context: TurnContext, next: () => Promise<void>) => Promise<void>): this {
    return this.on('onTeamsMessageSoftDelete', async (context, next) => {
      await handler(context, next)
    })
  }

  onTeamsMembersAddedEvent (
    handler: (
      membersAdded: TeamsChannelAccount[],
      teamInfo: TeamInfo,
      context: TurnContext,
      next: () => Promise<void>
    ) => Promise<void>
  ): this {
    return this.on('TeamsMembersAdded', async (context, next) => {
      const teamsChannelData = context.activity.validateTeamsChannelData(context.activity.channelData)
      await handler(context.activity.membersAdded || [], teamsChannelData.team as TeamInfo, context, next)
    })
  }

  onTeamsMembersRemovedEvent (
    handler: (
      membersRemoved: TeamsChannelAccount[],
      teamInfo: TeamInfo,
      context: TurnContext,
      next: () => Promise<void>
    ) => Promise<void>
  ): this {
    return this.on('TeamsMembersRemoved', async (context, next) => {
      const teamsChannelData = context.activity.validateTeamsChannelData(context.activity.channelData)
      await handler(context.activity.membersRemoved || [], teamsChannelData.team as TeamInfo, context, next)
    })
  }

  onTeamsChannelCreatedEvent (
    handler: (
      channelInfo: ChannelInfo,
      teamInfo: TeamInfo,
      context: TurnContext,
      next: () => Promise<void>
    ) => Promise<void>
  ): this {
    return this.on('TeamsChannelCreated', async (context, next) => {
      const teamsChannelData = context.activity.validateTeamsChannelData(context.activity.channelData)
      await handler(teamsChannelData.channel as ChannelInfo, teamsChannelData.team as TeamInfo, context, next)
    })
  }

  onTeamsChannelDeletedEvent (
    handler: (
      channelInfo: ChannelInfo,
      teamInfo: TeamInfo,
      context: TurnContext,
      next: () => Promise<void>
    ) => Promise<void>
  ): this {
    return this.on('TeamsChannelDeleted', async (context, next) => {
      const teamsChannelData = context.activity.validateTeamsChannelData(context.activity.channelData)
      await handler(teamsChannelData.channel as ChannelInfo, teamsChannelData.team as TeamInfo, context, next)
    })
  }

  onTeamsChannelRenamedEvent (
    handler: (
      channelInfo: ChannelInfo,
      teamInfo: TeamInfo,
      context: TurnContext,
      next: () => Promise<void>
    ) => Promise<void>
  ): this {
    return this.on('TeamsChannelRenamed', async (context, next) => {
      const teamsChannelData = context.activity.validateTeamsChannelData(context.activity.channelData)
      await handler(teamsChannelData.channel as ChannelInfo, teamsChannelData.team as TeamInfo, context, next)
    })
  }

  onTeamsTeamArchivedEvent (
    handler: (teamInfo: TeamInfo, context: TurnContext, next: () => Promise<void>) => Promise<void>
  ): this {
    return this.on('TeamsTeamArchived', async (context, next) => {
      const teamsChannelData = context.activity.validateTeamsChannelData(context.activity.channelData)
      await handler(teamsChannelData.team as TeamInfo, context, next)
    })
  }

  onTeamsTeamDeletedEvent (
    handler: (teamInfo: TeamInfo, context: TurnContext, next: () => Promise<void>) => Promise<void>
  ): this {
    return this.on('TeamsTeamDeleted', async (context, next) => {
      const teamsChannelData = context.activity.validateTeamsChannelData(context.activity.channelData)
      await handler(teamsChannelData.team as TeamInfo, context, next)
    })
  }

  onTeamsTeamHardDeletedEvent (
    handler: (teamInfo: TeamInfo, context: TurnContext, next: () => Promise<void>) => Promise<void>
  ): this {
    return this.on('TeamsTeamHardDeleted', async (context, next) => {
      const teamsChannelData = context.activity.validateTeamsChannelData(context.activity.channelData)
      await handler(teamsChannelData.team as TeamInfo, context, next)
    })
  }

  onTeamsChannelRestoredEvent (
    handler: (
      channelInfo: ChannelInfo,
      teamInfo: TeamInfo,
      context: TurnContext,
      next: () => Promise<void>
    ) => Promise<void>
  ): this {
    return this.on('TeamsChannelRestored', async (context, next) => {
      const teamsChannelData = context.activity.validateTeamsChannelData(context.activity.channelData)
      await handler(teamsChannelData.channel as ChannelInfo, teamsChannelData.team as TeamInfo, context, next)
    })
  }

  onTeamsTeamRenamedEvent (
    handler: (teamInfo: TeamInfo, context: TurnContext, next: () => Promise<void>) => Promise<void>
  ): this {
    return this.on('TeamsTeamRenamed', async (context, next) => {
      const teamsChannelData = context.activity.validateTeamsChannelData(context.activity.channelData)
      await handler(teamsChannelData.team as TeamInfo, context, next)
    })
  }

  onTeamsTeamRestoredEvent (
    handler: (teamInfo: TeamInfo, context: TurnContext, next: () => Promise<void>) => Promise<void>
  ): this {
    return this.on('TeamsTeamRestored', async (context, next) => {
      const teamsChannelData = context.activity.validateTeamsChannelData(context.activity.channelData)
      await handler(teamsChannelData.team as TeamInfo, context, next)
    })
  }

  onTeamsTeamUnarchivedEvent (
    handler: (teamInfo: TeamInfo, context: TurnContext, next: () => Promise<void>) => Promise<void>
  ): this {
    return this.on('TeamsTeamUnarchived', async (context, next) => {
      const teamsChannelData = context.activity.validateTeamsChannelData(context.activity.channelData)
      await handler(teamsChannelData.team as TeamInfo, context, next)
    })
  }

  protected async dispatchEventActivity (context: TurnContext): Promise<void> {
    if (context.activity.channelId === Channels.Msteams) {
      switch (context.activity.name) {
        case 'application/vnd.microsoft.readReceipt':
          return await this.onTeamsReadReceipt(context)
        case 'application/vnd.microsoft.meetingStart':
          return await this.onTeamsMeetingStart(context)
        case 'application/vnd.microsoft.meetingEnd':
          return await this.onTeamsMeetingEnd(context)
        case 'application/vnd.microsoft.meetingParticipantJoin':
          return await this.onTeamsMeetingParticipantsJoin(context)
        case 'application/vnd.microsoft.meetingParticipantLeave':
          return await this.onTeamsMeetingParticipantsLeave(context)
      }
    }

    return await super.dispatchEventActivity(context)
  }

  protected async onTeamsMeetingStart (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsMeetingStart', this.defaultNextEvent(context))
  }

  protected async onTeamsMeetingEnd (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsMeetingEnd', this.defaultNextEvent(context))
  }

  protected async onTeamsReadReceipt (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsReadReceipt', this.defaultNextEvent(context))
  }

  protected async onTeamsMeetingParticipantsJoin (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsMeetingParticipantsJoin', this.defaultNextEvent(context))
  }

  protected async onTeamsMeetingParticipantsLeave (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsMeetingParticipantsLeave', this.defaultNextEvent(context))
  }

  onTeamsMeetingStartEvent (
    handler: (meeting: MeetingStartEventDetails, context: TurnContext, next: () => Promise<void>) => Promise<void>
  ): this {
    return this.on('TeamsMeetingStart', async (context, next) => {
      const meeting = TeamsMeetingStartT.parse(context.activity.value)
      await handler(
        {
          id: meeting.Id,
          joinUrl: meeting.JoinUrl,
          meetingType: meeting.MeetingType,
          startTime: new Date(meeting.StartTime),
          title: meeting.Title
        },
        context,
        next
      )
    })
  }

  onTeamsMeetingEndEvent (
    handler: (meeting: MeetingEndEventDetails, context: TurnContext, next: () => Promise<void>) => Promise<void>
  ): this {
    return this.on('TeamsMeetingEnd', async (context, next) => {
      const meeting = TeamsMeetingEndT.parse(context.activity.value)
      await handler(
        {
          id: meeting.Id,
          joinUrl: meeting.JoinUrl,
          meetingType: meeting.MeetingType,
          endTime: new Date(meeting.EndTime),
          title: meeting.Title
        },
        context,
        next
      )
    })
  }

  onTeamsReadReceiptEvent (
    handler: (receiptInfo: ReadReceiptInfo, context: TurnContext, next: () => Promise<void>) => Promise<void>
  ): this {
    return this.on('TeamsReadReceipt', async (context, next) => {
      const receiptInfo = context.activity.value as { lastReadMessageId: string }
      await handler(new ReadReceiptInfo(receiptInfo.lastReadMessageId), context, next)
    })
  }

  onTeamsMeetingParticipantsJoinEvent (
    handler: (
      meeting: MeetingParticipantsEventDetails,
      context: TurnContext,
      next: () => Promise<void>
    ) => Promise<void>
  ): this {
    return this.on('TeamsMeetingParticipantsJoin', async (context, next) => {
      const meeting = TeamsMeetingStartT.parse(context.activity.value)
      await handler(
        {
          members: (meeting as unknown as { members: TeamsMeetingMember[] }).members
        },
        context,
        next
      )
    })
  }

  onTeamsMeetingParticipantsLeaveEvent (
    handler: (
      meeting: MeetingParticipantsEventDetails,
      context: TurnContext,
      next: () => Promise<void>
    ) => Promise<void>
  ): this {
    return this.on('TeamsMeetingParticipantsLeave', async (context, next) => {
      const meeting = TeamsMeetingEndT.parse(context.activity.value)
      await handler(
        {
          members: (meeting as unknown as { members: TeamsMeetingMember[] }).members
        },
        context,
        next
      )
    })
  }
}
