/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReadReceiptInfo } from './message-read-info/readReceipInfo'
import * as z from 'zod'
import { FileConsentCardResponse } from './file/fileConsentCardResponse'
import { TaskModuleRequest } from './task/taskModuleRequest'
import { TabRequest } from './tab/tabRequest'
import { TabSubmit } from './tab/tabSubmit'
import { TabResponse } from './tab/tabResponse'
import { TaskModuleResponse } from './task/taskModuleResponse'
import { TeamsChannelAccount } from './connector-client/teamsChannelAccount'
import { MeetingStartEventDetails } from './meeting/meetingStartEventDetails'
import { MeetingEndEventDetails } from './meeting/meetingEndEventDetails'
import { MeetingParticipantsEventDetails } from './meeting/meetingParticipantsEventDetails'
import { TeamsMeetingMember } from './meeting/teamsMeetingMember'
import { O365ConnectorCardActionQuery } from './query/o365ConnectorCardActionQuery'
import { AppBasedLinkQuery } from './query/appBasedLinkQuery'
import { SigninStateVerificationQuery } from './query/signinStateVerificationQuery'
import { ConfigResponse } from './agent-config/configResponse'
import { MessagingExtensionAction } from './messaging-extension/messagingExtensionAction'
import { MessagingExtensionResponse } from './messaging-extension/messagingExtensionResponse'
import { MessagingExtensionActionResponse } from './messaging-extension/messagingExtensionActionResponse'
import { ActivityHandler, InvokeResponse, TurnContext } from '@microsoft/agents-hosting'
import { Channels } from '@microsoft/agents-activity'
import { ChannelInfo, TeamInfo } from './channel-data'
import { parseValueMessagingExtensionQuery } from './parsers/activityValueParsers'
import { parseTeamsChannelData } from './parsers/teamsChannelDataParser'
import { MessagingExtensionQuery } from './messaging-extension'
import { TeamsConnectorClient } from './connector-client/teamsConnectorClient'

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
  /**
   * Handles invoke activities.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<InvokeResponse>} The invoke response.
   */
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
              await this.handleTeamsMessagingExtensionQuery(context, parseValueMessagingExtensionQuery(context.activity.value))
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

  /**
   * Handles card action invoke.
   * @param {TurnContext} _context - The context object for the turn.
   * @returns {Promise<InvokeResponse>} The invoke response.
   */
  protected async handleTeamsCardActionInvoke (_context: TurnContext): Promise<InvokeResponse> {
    throw new Error('NotImplemented')
  }

  /**
   * Handles config fetch.
   * @param {TurnContext} _context - The context object for the turn.
   * @param {any} _configData - The config data.
   * @returns {Promise<ConfigResponse>} The config response.
   */
  protected async handleTeamsConfigFetch (_context: TurnContext, _configData: any): Promise<ConfigResponse> {
    throw new Error('NotImplemented')
  }

  /**
   * Handles config submit.
   * @param {TurnContext} _context - The context object for the turn.
   * @param {any} _configData - The config data.
   * @returns {Promise<ConfigResponse>} The config response.
   */
  protected async handleTeamsConfigSubmit (_context: TurnContext, _configData: any): Promise<ConfigResponse> {
    throw new Error('NotImplemented')
  }

  /**
   * Handles file consent.
   * @param {TurnContext} context - The context object for the turn.
   * @param {FileConsentCardResponse} fileConsentCardResponse - The file consent card response.
   * @returns {Promise<void>}
   */
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

  /**
   * Handles file consent accept.
   * @param {TurnContext} _context - The context object for the turn.
   * @param {FileConsentCardResponse} _fileConsentCardResponse - The file consent card response.
   * @returns {Promise<void>}
   */
  protected async handleTeamsFileConsentAccept (
    _context: TurnContext,
    _fileConsentCardResponse: FileConsentCardResponse
  ): Promise<void> {
    throw new Error('NotImplemented')
  }

  /**
   * Handles file consent decline.
   * @param {TurnContext} _context - The context object for the turn.
   * @param {FileConsentCardResponse} _fileConsentCardResponse - The file consent card response.
   * @returns {Promise<void>}
   */
  protected async handleTeamsFileConsentDecline (
    _context: TurnContext,
    _fileConsentCardResponse: FileConsentCardResponse
  ): Promise<void> {
    throw new Error('NotImplemented')
  }

  /**
   * Handles O365 connector card action.
   * @param {TurnContext} _context - The context object for the turn.
   * @param {O365ConnectorCardActionQuery} _query - The O365 connector card action query.
   * @returns {Promise<void>}
   */
  protected async handleTeamsO365ConnectorCardAction (
    _context: TurnContext,
    _query: O365ConnectorCardActionQuery
  ): Promise<void> {
    throw new Error('NotImplemented')
  }

  /**
   * Handles sign-in verify state.
   * @param {TurnContext} _context - The context object for the turn.
   * @param {SigninStateVerificationQuery} _query - The sign-in state verification query.
   * @returns {Promise<void>}
   */
  protected async handleTeamsSigninVerifyState (
    _context: TurnContext,
    _query: SigninStateVerificationQuery
  ): Promise<void> {
    throw new Error('NotImplemented')
  }

  /**
   * Handles sign-in token exchange.
   * @param {TurnContext} _context - The context object for the turn.
   * @param {SigninStateVerificationQuery} _query - The sign-in state verification query.
   * @returns {Promise<void>}
   */
  protected async handleTeamsSigninTokenExchange (
    _context: TurnContext,
    _query: SigninStateVerificationQuery
  ): Promise<void> {
    throw new Error('NotImplemented')
  }

  /**
   * Handles messaging extension card button clicked.
   * @param {TurnContext} _context - The context object for the turn.
   * @param {any} _cardData - The card data.
   * @returns {Promise<void>}
   */
  protected async handleTeamsMessagingExtensionCardButtonClicked (
    _context: TurnContext,
    _cardData: any
  ): Promise<void> {
    throw new Error('NotImplemented')
  }

  /**
   * Handles task module fetch.
   * @param {TurnContext} _context - The context object for the turn.
   * @param {TaskModuleRequest} _taskModuleRequest - The task module request.
   * @returns {Promise<TaskModuleResponse>} The task module response.
   */
  protected async handleTeamsTaskModuleFetch (
    _context: TurnContext,
    _taskModuleRequest: TaskModuleRequest
  ): Promise<TaskModuleResponse> {
    throw new Error('NotImplemented')
  }

  /**
   * Handles task module submit.
   * @param {TurnContext} _context - The context object for the turn.
   * @param {TaskModuleRequest} _taskModuleRequest - The task module request.
   * @returns {Promise<TaskModuleResponse>} The task module response.
   */
  protected async handleTeamsTaskModuleSubmit (
    _context: TurnContext,
    _taskModuleRequest: TaskModuleRequest
  ): Promise<TaskModuleResponse> {
    throw new Error('NotImplemented')
  }

  /**
   * Handles tab fetch.
   * @param {TurnContext} _context - The context object for the turn.
   * @param {TabRequest} _tabRequest - The tab request.
   * @returns {Promise<TabResponse>} The tab response.
   */
  protected async handleTeamsTabFetch (_context: TurnContext, _tabRequest: TabRequest): Promise<TabResponse> {
    throw new Error('NotImplemented')
  }

  /**
   * Handles tab submit.
   * @param {TurnContext} _context - The context object for the turn.
   * @param {TabSubmit} _tabSubmit - The tab submit.
   * @returns {Promise<TabResponse>} The tab response.
   */
  protected async handleTeamsTabSubmit (_context: TurnContext, _tabSubmit: TabSubmit): Promise<TabResponse> {
    throw new Error('NotImplemented')
  }

  /**
   * Handles app-based link query.
   * @param {TurnContext} _context - The context object for the turn.
   * @param {AppBasedLinkQuery} _query - The app-based link query.
   * @returns {Promise<MessagingExtensionResponse>} The messaging extension response.
   */
  protected async handleTeamsAppBasedLinkQuery (
    _context: TurnContext,
    _query: AppBasedLinkQuery
  ): Promise<MessagingExtensionResponse> {
    throw new Error('NotImplemented')
  }

  /**
   * Handles anonymous app-based link query.
   * @param {TurnContext} _context - The context object for the turn.
   * @param {AppBasedLinkQuery} _query - The app-based link query.
   * @returns {Promise<MessagingExtensionResponse>} The messaging extension response.
   */
  protected async handleTeamsAnonymousAppBasedLinkQuery (
    _context: TurnContext,
    _query: AppBasedLinkQuery
  ): Promise<MessagingExtensionResponse> {
    throw new Error('NotImplemented')
  }

  /**
   * Handles messaging extension query.
   * @param {TurnContext} _context - The context object for the turn.
   * @param {MessagingExtensionQuery} _query - The messaging extension query.
   * @returns {Promise<MessagingExtensionResponse>} The messaging extension response.
   */
  protected async handleTeamsMessagingExtensionQuery (
    _context: TurnContext,
    _query: MessagingExtensionQuery
  ): Promise<MessagingExtensionResponse> {
    throw new Error('NotImplemented')
  }

  /**
   * Handles messaging extension select item.
   * @param {TurnContext} _context - The context object for the turn.
   * @param {any} _query - The query.
   * @returns {Promise<MessagingExtensionResponse>} The messaging extension response.
   */
  protected async handleTeamsMessagingExtensionSelectItem (
    _context: TurnContext,
    _query: any
  ): Promise<MessagingExtensionResponse> {
    throw new Error('NotImplemented')
  }

  /**
   * Handles messaging extension submit action dispatch.
   * @param {TurnContext} context - The context object for the turn.
   * @param {MessagingExtensionAction} action - The messaging extension action.
   * @returns {Promise<MessagingExtensionActionResponse>} The messaging extension action response.
   */
  protected async handleTeamsMessagingExtensionSubmitActionDispatch (
    context: TurnContext,
    action: MessagingExtensionAction
  ): Promise<MessagingExtensionActionResponse> {
    if (action.messagePreviewAction) {
      switch (action.messagePreviewAction) {
        case 'edit':
          return await this.handleTeamsMessagingExtensionMessagePreviewEdit(context, action)
        case 'send':
          return await this.handleTeamsMessagingExtensionMessagePreviewSend(context, action)
        default:
          throw new Error('BadRequest')
      }
    } else {
      return await this.handleTeamsMessagingExtensionSubmitAction(context, action)
    }
  }

  /**
   * Handles messaging extension submit action.
   * @param {TurnContext} _context - The context object for the turn.
   * @param {MessagingExtensionAction} _action - The messaging extension action.
   * @returns {Promise<MessagingExtensionActionResponse>} The messaging extension action response.
   */
  protected async handleTeamsMessagingExtensionSubmitAction (
    _context: TurnContext,
    _action: MessagingExtensionAction
  ): Promise<MessagingExtensionActionResponse> {
    throw new Error('NotImplemented')
  }

  /**
   * Handles messaging extension message preview edit.
   * @param {TurnContext} _context - The context object for the turn.
   * @param {MessagingExtensionAction} _action - The messaging extension action.
   * @returns {Promise<MessagingExtensionActionResponse>} The messaging extension action response.
   */
  protected async handleTeamsMessagingExtensionMessagePreviewEdit (
    _context: TurnContext,
    _action: MessagingExtensionAction
  ): Promise<MessagingExtensionActionResponse> {
    throw new Error('NotImplemented')
  }

  /**
   * Handles messaging extension message preview send.
   * @param {TurnContext} _context - The context object for the turn.
   * @param {MessagingExtensionAction} _action - The messaging extension action.
   * @returns {Promise<MessagingExtensionActionResponse>} The messaging extension action response.
   */
  protected async handleTeamsMessagingExtensionMessagePreviewSend (
    _context: TurnContext,
    _action: MessagingExtensionAction
  ): Promise<MessagingExtensionActionResponse> {
    throw new Error('NotImplemented')
  }

  /**
   * Handles messaging extension fetch task.
   * @param {TurnContext} _context - The context object for the turn.
   * @param {MessagingExtensionAction} _action - The messaging extension action.
   * @returns {Promise<MessagingExtensionActionResponse>} The messaging extension action response.
   */
  protected async handleTeamsMessagingExtensionFetchTask (
    _context: TurnContext,
    _action: MessagingExtensionAction
  ): Promise<MessagingExtensionActionResponse> {
    throw new Error('NotImplemented')
  }

  /**
   * Handles messaging extension configuration query setting URL.
   * @param {TurnContext} _context - The context object for the turn.
   * @param {MessagingExtensionQuery} _query - The messaging extension query.
   * @returns {Promise<MessagingExtensionResponse>} The messaging extension response.
   */
  protected async handleTeamsMessagingExtensionConfigurationQuerySettingUrl (
    _context: TurnContext,
    _query: MessagingExtensionQuery
  ): Promise<MessagingExtensionResponse> {
    throw new Error('NotImplemented')
  }

  /**
   * Handles messaging extension configuration setting.
   * @param {TurnContext} _context - The context object for the turn.
   * @param {any} _settings - The settings.
   * @returns {Promise<void>}
   */
  protected async handleTeamsMessagingExtensionConfigurationSetting (_context: TurnContext, _settings: any): Promise<void> {
    throw new Error('NotImplemented')
  }

  /**
   * Dispatches conversation update activity.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<void>}
   */
  protected async dispatchConversationUpdateActivity (context: TurnContext): Promise<void> {
    if (context.activity.channelId === 'msteams') {
      const channelData = parseTeamsChannelData(context.activity.channelData)

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

  /**
   * Dispatches message update activity.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<void>}
   */
  protected async dispatchMessageUpdateActivity (context: TurnContext): Promise<void> {
    if (context.activity.channelId === 'msteams') {
      const channelData = parseTeamsChannelData(context.activity.channelData)

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

  /**
   * Dispatches message delete activity.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<void>}
   */
  protected async dispatchMessageDeleteActivity (context: TurnContext): Promise<void> {
    if (context.activity.channelId === 'msteams') {
      const channelData = parseTeamsChannelData(context.activity.channelData)

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

  /**
   * Handles Teams message undelete.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<void>}
   */
  protected async onTeamsMessageUndelete (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsMessageUndelete', this.defaultNextEvent(context))
  }

  /**
   * Handles Teams message edit.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<void>}
   */
  protected async onTeamsMessageEdit (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsMessageEdit', this.defaultNextEvent(context))
  }

  /**
   * Handles Teams message soft delete.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<void>}
   */
  protected async onTeamsMessageSoftDelete (context: TurnContext): Promise<void> {
    await this.handle(context, 'onTeamsMessageSoftDelete', this.defaultNextEvent(context))
  }

  /**
   * Handles Teams members added.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<void>}
   */
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
          context.activity.membersAdded[i] = await TeamsConnectorClient.getMember(context.activity, channelAccount.id!)
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

  /**
   * Handles Teams members removed.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<void>}
   */
  protected async onTeamsMembersRemoved (context: TurnContext): Promise<void> {
    if ('TeamsMembersRemoved' in this.handlers && this.handlers.TeamsMembersRemoved.length > 0) {
      await this.handle(context, 'TeamsMembersRemoved', this.defaultNextEvent(context))
    } else {
      await this.handle(context, 'MembersRemoved', this.defaultNextEvent(context))
    }
  }

  /**
   * Handles Teams channel created.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<void>}
   */
  protected async onTeamsChannelCreated (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsChannelCreated', this.defaultNextEvent(context))
  }

  /**
   * Handles Teams channel deleted.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<void>}
   */
  protected async onTeamsChannelDeleted (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsChannelDeleted', this.defaultNextEvent(context))
  }

  /**
   * Handles Teams channel renamed.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<void>}
   */
  protected async onTeamsChannelRenamed (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsChannelRenamed', this.defaultNextEvent(context))
  }

  /**
   * Handles Teams team archived.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<void>}
   */
  protected async onTeamsTeamArchived (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsTeamArchived', this.defaultNextEvent(context))
  }

  /**
   * Handles Teams team deleted.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<void>}
   */
  protected async onTeamsTeamDeleted (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsTeamDeleted', this.defaultNextEvent(context))
  }

  /**
   * Handles Teams team hard deleted.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<void>}
   */
  protected async onTeamsTeamHardDeleted (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsTeamHardDeleted', this.defaultNextEvent(context))
  }

  /**
   * Handles Teams channel restored.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<void>}
   */
  protected async onTeamsChannelRestored (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsChannelRestored', this.defaultNextEvent(context))
  }

  /**
   * Handles Teams team renamed.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<void>}
   */
  protected async onTeamsTeamRenamed (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsTeamRenamed', this.defaultNextEvent(context))
  }

  /**
   * Handles Teams team restored.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<void>}
   */
  protected async onTeamsTeamRestored (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsTeamRestored', this.defaultNextEvent(context))
  }

  /**
   * Handles Teams team unarchived.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<void>}
   */
  protected async onTeamsTeamUnarchived (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsTeamUnarchived', this.defaultNextEvent(context))
  }

  /**
   * Registers a handler for Teams message undelete event.
   * @param {function} handler - The handler function.
   * @returns {this}
   */
  onTeamsMessageUndeleteEvent (handler: (context: TurnContext, next: () => Promise<void>) => Promise<void>): this {
    return this.on('TeamsMessageUndelete', async (context, next) => {
      await handler(context, next)
    })
  }

  /**
   * Registers a handler for Teams message edit event.
   * @param {function} handler - The handler function.
   * @returns {this}
   */
  onTeamsMessageEditEvent (handler: (context: TurnContext, next: () => Promise<void>) => Promise<void>): this {
    return this.on('TeamsMessageEdit', async (context, next) => {
      await handler(context, next)
    })
  }

  /**
   * Registers a handler for Teams message soft delete event.
   * @param {function} handler - The handler function.
   * @returns {this}
   */
  onTeamsMessageSoftDeleteEvent (handler: (context: TurnContext, next: () => Promise<void>) => Promise<void>): this {
    return this.on('onTeamsMessageSoftDelete', async (context, next) => {
      await handler(context, next)
    })
  }

  /**
   * Registers a handler for Teams members added event.
   * @param {function} handler - The handler function.
   * @returns {this}
   */
  onTeamsMembersAddedEvent (
    handler: (
      membersAdded: TeamsChannelAccount[],
      teamInfo: TeamInfo,
      context: TurnContext,
      next: () => Promise<void>
    ) => Promise<void>
  ): this {
    return this.on('TeamsMembersAdded', async (context, next) => {
      const teamsChannelData = parseTeamsChannelData(context.activity.channelData)
      await handler(context.activity.membersAdded || [], teamsChannelData.team as TeamInfo, context, next)
    })
  }

  /**
   * Registers a handler for Teams members removed event.
   * @param {function} handler - The handler function.
   * @returns {this}
   */
  onTeamsMembersRemovedEvent (
    handler: (
      membersRemoved: TeamsChannelAccount[],
      teamInfo: TeamInfo,
      context: TurnContext,
      next: () => Promise<void>
    ) => Promise<void>
  ): this {
    return this.on('TeamsMembersRemoved', async (context, next) => {
      const teamsChannelData = parseTeamsChannelData(context.activity.channelData)
      await handler(context.activity.membersRemoved || [], teamsChannelData.team as TeamInfo, context, next)
    })
  }

  /**
   * Registers a handler for Teams channel created event.
   * @param {function} handler - The handler function.
   * @returns {this}
   */
  onTeamsChannelCreatedEvent (
    handler: (
      channelInfo: ChannelInfo,
      teamInfo: TeamInfo,
      context: TurnContext,
      next: () => Promise<void>
    ) => Promise<void>
  ): this {
    return this.on('TeamsChannelCreated', async (context, next) => {
      const teamsChannelData = parseTeamsChannelData(context.activity.channelData)
      await handler(teamsChannelData.channel as ChannelInfo, teamsChannelData.team as TeamInfo, context, next)
    })
  }

  /**
   * Registers a handler for Teams channel deleted event.
   * @param {function} handler - The handler function.
   * @returns {this}
   */
  onTeamsChannelDeletedEvent (
    handler: (
      channelInfo: ChannelInfo,
      teamInfo: TeamInfo,
      context: TurnContext,
      next: () => Promise<void>
    ) => Promise<void>
  ): this {
    return this.on('TeamsChannelDeleted', async (context, next) => {
      const teamsChannelData = parseTeamsChannelData(context.activity.channelData)
      await handler(teamsChannelData.channel as ChannelInfo, teamsChannelData.team as TeamInfo, context, next)
    })
  }

  /**
   * Registers a handler for Teams channel renamed event.
   * @param {function} handler - The handler function.
   * @returns {this}
   */
  onTeamsChannelRenamedEvent (
    handler: (
      channelInfo: ChannelInfo,
      teamInfo: TeamInfo,
      context: TurnContext,
      next: () => Promise<void>
    ) => Promise<void>
  ): this {
    return this.on('TeamsChannelRenamed', async (context, next) => {
      const teamsChannelData = parseTeamsChannelData(context.activity.channelData)
      await handler(teamsChannelData.channel as ChannelInfo, teamsChannelData.team as TeamInfo, context, next)
    })
  }

  /**
   * Registers a handler for Teams team archived event.
   * @param {function} handler - The handler function.
   * @returns {this}
   */
  onTeamsTeamArchivedEvent (
    handler: (teamInfo: TeamInfo, context: TurnContext, next: () => Promise<void>) => Promise<void>
  ): this {
    return this.on('TeamsTeamArchived', async (context, next) => {
      const teamsChannelData = parseTeamsChannelData(context.activity.channelData)
      await handler(teamsChannelData.team as TeamInfo, context, next)
    })
  }

  /**
   * Registers a handler for Teams team deleted event.
   * @param {function} handler - The handler function.
   * @returns {this}
   */
  onTeamsTeamDeletedEvent (
    handler: (teamInfo: TeamInfo, context: TurnContext, next: () => Promise<void>) => Promise<void>
  ): this {
    return this.on('TeamsTeamDeleted', async (context, next) => {
      const teamsChannelData = parseTeamsChannelData(context.activity.channelData)
      await handler(teamsChannelData.team as TeamInfo, context, next)
    })
  }

  /**
   * Registers a handler for Teams team hard deleted event.
   * @param {function} handler - The handler function.
   * @returns {this}
   */
  onTeamsTeamHardDeletedEvent (
    handler: (teamInfo: TeamInfo, context: TurnContext, next: () => Promise<void>) => Promise<void>
  ): this {
    return this.on('TeamsTeamHardDeleted', async (context, next) => {
      const teamsChannelData = parseTeamsChannelData(context.activity.channelData)
      await handler(teamsChannelData.team as TeamInfo, context, next)
    })
  }

  /**
   * Registers a handler for Teams channel restored event.
   * @param {function} handler - The handler function.
   * @returns {this}
   */
  onTeamsChannelRestoredEvent (
    handler: (
      channelInfo: ChannelInfo,
      teamInfo: TeamInfo,
      context: TurnContext,
      next: () => Promise<void>
    ) => Promise<void>
  ): this {
    return this.on('TeamsChannelRestored', async (context, next) => {
      const teamsChannelData = parseTeamsChannelData(context.activity.channelData)
      await handler(teamsChannelData.channel as ChannelInfo, teamsChannelData.team as TeamInfo, context, next)
    })
  }

  /**
   * Registers a handler for Teams team renamed event.
   * @param {function} handler - The handler function.
   * @returns {this}
   */
  onTeamsTeamRenamedEvent (
    handler: (teamInfo: TeamInfo, context: TurnContext, next: () => Promise<void>) => Promise<void>
  ): this {
    return this.on('TeamsTeamRenamed', async (context, next) => {
      const teamsChannelData = parseTeamsChannelData(context.activity.channelData)
      await handler(teamsChannelData.team as TeamInfo, context, next)
    })
  }

  /**
   * Registers a handler for Teams team restored event.
   * @param {function} handler - The handler function.
   * @returns {this}
   */
  onTeamsTeamRestoredEvent (
    handler: (teamInfo: TeamInfo, context: TurnContext, next: () => Promise<void>) => Promise<void>
  ): this {
    return this.on('TeamsTeamRestored', async (context, next) => {
      const teamsChannelData = parseTeamsChannelData(context.activity.channelData)
      await handler(teamsChannelData.team as TeamInfo, context, next)
    })
  }

  /**
   * Registers a handler for Teams team unarchived event.
   * @param {function} handler - The handler function.
   * @returns {this}
   */
  onTeamsTeamUnarchivedEvent (
    handler: (teamInfo: TeamInfo, context: TurnContext, next: () => Promise<void>) => Promise<void>
  ): this {
    return this.on('TeamsTeamUnarchived', async (context, next) => {
      const teamsChannelData = parseTeamsChannelData(context.activity.channelData)
      await handler(teamsChannelData.team as TeamInfo, context, next)
    })
  }

  /**
   * Dispatches event activity.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<void>}
   */
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

  /**
   * Handles Teams meeting start.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<void>}
   */
  protected async onTeamsMeetingStart (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsMeetingStart', this.defaultNextEvent(context))
  }

  /**
   * Handles Teams meeting end.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<void>}
   */
  protected async onTeamsMeetingEnd (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsMeetingEnd', this.defaultNextEvent(context))
  }

  /**
   * Handles Teams read receipt.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<void>}
   */
  protected async onTeamsReadReceipt (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsReadReceipt', this.defaultNextEvent(context))
  }

  /**
   * Handles Teams meeting participants join.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<void>}
   */
  protected async onTeamsMeetingParticipantsJoin (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsMeetingParticipantsJoin', this.defaultNextEvent(context))
  }

  /**
   * Handles Teams meeting participants leave.
   * @param {TurnContext} context - The context object for the turn.
   * @returns {Promise<void>}
   */
  protected async onTeamsMeetingParticipantsLeave (context: TurnContext): Promise<void> {
    await this.handle(context, 'TeamsMeetingParticipantsLeave', this.defaultNextEvent(context))
  }

  /**
   * Registers a handler for Teams meeting start event.
   * @param {function} handler - The handler function.
   * @returns {this}
   */
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

  /**
   * Registers a handler for Teams meeting end event.
   * @param {function} handler - The handler function.
   * @returns {this}
   */
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

  /**
   * Registers a handler for Teams read receipt event.
   * @param {function} handler - The handler function.
   * @returns {this}
   */
  onTeamsReadReceiptEvent (
    handler: (receiptInfo: ReadReceiptInfo, context: TurnContext, next: () => Promise<void>) => Promise<void>
  ): this {
    return this.on('TeamsReadReceipt', async (context, next) => {
      const receiptInfo = context.activity.value as { lastReadMessageId: string }
      await handler(new ReadReceiptInfo(receiptInfo.lastReadMessageId), context, next)
    })
  }

  /**
   * Registers a handler for Teams meeting participants join event.
   * @param {function} handler - The handler function.
   * @returns {this}
   */
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

  /**
   * Registers a handler for Teams meeting participants leave event.
   * @param {function} handler - The handler function.
   * @returns {this}
   */
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
