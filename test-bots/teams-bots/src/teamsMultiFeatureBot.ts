// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import {
  ActionTypes,
  Attachment,
  CardAction,
  CardFactory,
  CardImage,
  HeroCard,
  MessageFactory,
  MessagingExtensionQuery,
  TaskModuleAction,
  ThumbnailCard,
  TurnContext
} from '@microsoft/agents-bot-hosting'
import { TaskModuleIds } from './models/taskModuleIds'
import { TaskModuleUIConstants } from './models/taskModuleUIConstants'
import { UISettings } from './models/uiSettings'
import { TaskModuleResponseFactory } from './models/taskModuleResponseFactory'
import { AdaptiveCardTaskFetchValue } from './models/adaptiveCardTaskFetchValue'
import { CardTaskFetchValue } from './models/cardTaskFetchValue'
import * as AdaptiveCards from 'adaptivecards'
import { AppBasedLinkQuery, MessagingExtensionAttachment, MessagingExtensionResponse, TaskModuleRequest, TaskModuleResponse, TaskModuleTaskInfo, TeamsActivityHandler, TeamsInfo } from '@microsoft/agents-bot-teams'
const adaptiveCardResource = require('../cards/AdaptiveCard.json')
const restaurantCardResource = require('../cards/RestaurantCard.json')

const baseUrl = process.env.BASE_URL?.endsWith('/') ? process.env.BASE_URL : process.env.BASE_URL + '/'
export class TeamsMultiFeatureBot extends TeamsActivityHandler {
  constructor () {
    super()
    this.onMessage(async (context, next) => {
      if (context.activity.text?.indexOf('taskModule')! > 0) {
        const reply = MessageFactory.attachment(TeamsMultiFeatureBot.getTaskModuleHeroCardOptions())
        await context.sendActivity(reply)
      } else if (context.activity.text?.indexOf('teamsinfo')! > 0) {
        const channels = await TeamsInfo.getTeamChannels(context)
        const msg1 = `Meeting Participant: ${JSON.stringify(channels)}}`
        await context.sendActivity(MessageFactory.text(msg1))

        const teamDetails = await TeamsInfo.getTeamDetails(context)
        const msg2 = `Team Details: ${JSON.stringify(teamDetails)}`
        await context.sendActivity(MessageFactory.text(msg2))
      } else {
        await context.sendActivity(MessageFactory.text('type teamsinfo or taskModule'))
      }
      await next()
    })
  }

  async handleTeamsAppBasedLinkQuery (
    context: TurnContext,
    query: AppBasedLinkQuery
  ): Promise<MessagingExtensionResponse> {
    const adaptiveCard = new AdaptiveCards.AdaptiveCard()
    adaptiveCard.version = new AdaptiveCards.Version(1, 3)

    const textBlock = new AdaptiveCards.TextBlock()
    textBlock.text = 'Adaptive Card'
    textBlock.size = AdaptiveCards.TextSize.ExtraLarge

    const image = new AdaptiveCards.Image()
    image.url = 'https://raw.githubusercontent.com/microsoft/botframework-sdk/master/icon.png'

    adaptiveCard.addItem(textBlock)
    adaptiveCard.addItem(image)

    const adaptiveCardJson = adaptiveCard.toJSON()

    const attachments: MessagingExtensionAttachment = {
      content: adaptiveCardJson,
      contentType: CardFactory.contentTypes.heroCard
    }

    const messagingExtensionAttachment: MessagingExtensionAttachment = {
      content: adaptiveCardJson,
      contentType: CardFactory.contentTypes.heroCard,
      preview: attachments
    }

    return Promise.resolve({
      composeExtension: {
        attachmentLayout: 'list',
        type: 'result',
        attachments: [messagingExtensionAttachment]
      }
    })
  }

  async handleTeamsMessagingExtensionQuery (
    context: TurnContext,
    query: MessagingExtensionQuery
  ): Promise<MessagingExtensionResponse> {
    let text = ''

    if (context.activity.value) {
      if (query?.parameters?.at(0)?.name === 'initialRun') {
        return {}
      }

      text = query?.parameters?.at(0)?.value ?? ''
      switch (text) {
        case 'link':
        {
          const card: Partial<HeroCard> = {
            title: 'This is a Link Unfurling Sample',
            subtitle: 'It will unfurl links from *.BotFramework.com',
            text: 'This sample demonstrates how to handle link unfurling in Teams.'
          }
          const attachment: Attachment = {
            content: card,
            contentType: CardFactory.contentTypes.heroCard
          }
          return {
            composeExtension: {
              attachmentLayout: 'list',
              type: 'result',
              attachments: [{
                content: card,
                contentType: CardFactory.contentTypes.heroCard,
                preview: attachment
              }]
            }
          }
        }
        case 'adaptive card': {
          const response: MessagingExtensionResponse = this.getAdaptiveCard()
          return response
        }
      }
    }

    const packages = await this.findPackages(text)

    // We take every row of the results and wrap them in cards wrapped in MessagingExtensionAttachment objects.
    // The Preview is optional, if it includes a Tap, that will trigger the OnTeamsMessagingExtensionSelectItem event back on this bot.
    const attachments: MessagingExtensionAttachment[] = packages.map(({ item1, item2, item3, item4, item5 }) => {
      const cardValue = `{"packageId": "${item1}", "version": "${item2}", "description": "${item3}", "projectUrl": "${item4}", "iconUrl": "${item5}"}`

      const cardAction: CardAction = {
        type: 'invoke',
        value: cardValue,
        title: item1
      }
      const previewCard: Partial<ThumbnailCard> = {
        title: item1,
        tap: cardAction
      }

      if (item5) {
        const cardImage: CardImage = {
          url: item5,
          alt: 'icon'
        }
        previewCard.images = [cardImage]
      }

      const heroCard: Partial<HeroCard> = {
        title: item1
      }

      const attachment: Attachment = {
        content: previewCard,
        contentType: 'application/vnd.microsoft.card.thumbnail'
      }

      const messagingExtensionAttachment: MessagingExtensionAttachment = {
        contentType: CardFactory.contentTypes.heroCard,
        content: heroCard,
        preview: attachment
      }

      return messagingExtensionAttachment
    })

    return {
      composeExtension: {
        attachmentLayout: 'list',
        type: 'result',
        attachments
      }
    }
  }

  async handleTeamsMessagingExtensionSelectItem (_context: TurnContext, _query: any): Promise<MessagingExtensionResponse> {
    const packageId = _query['packageId']
    const version = _query['version']
    const description = _query['description']
    const projectUrl = _query['projectUrl']
    const iconUrl = _query['iconUrl']

    const buttons: CardAction[] = [
      {
        type: ActionTypes.OpenUrl,
        title: 'Nuget Package',
        value: `https://www.nuget.org/packages/${packageId}`
      },
      {
        type: ActionTypes.OpenUrl,
        title: 'Project',
        value: projectUrl
      }
    ]

    const card: Partial<ThumbnailCard> = {
      title: `${packageId}, ${version}`,
      subtitle: description,
      buttons
    }

    if (iconUrl) {
      card.images = [{
        url: iconUrl,
        alt: 'Icon'
      }]
    }

    const attachment: MessagingExtensionAttachment = {
      contentType: 'application/vnd.microsoft.card.thumbnail',
      content: card
    }

    return {
      composeExtension: {
        attachmentLayout: 'list',
        type: 'result',
        attachments: [attachment]
      }
    }
  }

  async handleTeamsTaskModuleFetch (_context: TurnContext, _taskModuleRequest: TaskModuleRequest): Promise<TaskModuleResponse> {
    const asJobject = _taskModuleRequest.data

    const value = asJobject.data

    let taskInfo: TaskModuleTaskInfo = {}

    switch (value) {
      case TaskModuleIds.AdaptiveCard: {
        taskInfo = this.setTaskInfo(TaskModuleUIConstants.AdaptiveCard)
        taskInfo.card = this.createAdaptiveCardAttachment()

        break
      }

      case TaskModuleIds.YouTube: {
        taskInfo = this.setTaskInfo(TaskModuleUIConstants.YouTube)
        taskInfo.url = taskInfo.fallbackUrl = baseUrl + TaskModuleIds.YouTube

        break
      }

      case TaskModuleIds.CustomForm: {
        taskInfo = this.setTaskInfo(TaskModuleUIConstants.CustomForm)
        taskInfo.url = taskInfo.fallbackUrl = baseUrl + TaskModuleIds.CustomForm

        break
      }
    }

    return TaskModuleResponseFactory.toTaskModuleResponse(taskInfo)
  }

  async handleTeamsTaskModuleSubmit (_context: TurnContext, _taskModuleRequest: TaskModuleRequest): Promise<TaskModuleResponse> {
    const reply = MessageFactory.text('OnTeamsTaskModuleSubmitAsync Value: ' + JSON.stringify(_taskModuleRequest.data))
    await _context.sendActivity(reply)

    return TaskModuleResponseFactory.createMessageResponse('Thanks!')
  }

  async onTeamsMessageEdit (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('You edited a message')
    await context.sendActivity(reply)
  }

  async onTeamsMessageUndelete (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('You undeleted a message')
    await context.sendActivity(reply)
  }

  async onTeamsMessageSoftDelete (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('You deleted a message')
    await context.sendActivity(reply)
  }

  async onTeamsMembersAdded (context: TurnContext): Promise<void> {
    const newMember = JSON.stringify(context.activity.membersAdded)
    const reply = MessageFactory.text('Hi there! You are a new member' + newMember)
    await context.sendActivity(reply)
  }

  async onTeamsMembersRemoved (context: TurnContext): Promise<void> {
    const removedMember = JSON.stringify(context.activity.membersRemoved)
    const reply = MessageFactory.text('Hi there! A team member was removed' + removedMember)
    await context.sendActivity(reply)
  }

  async onTeamsTeamRenamed (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('Hi, the team was renamed')
    await context.sendActivity(reply)
  }

  async onTeamsTeamArchived (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('Hi, the team was archived')
    console.log('Hi, the team was archived')
    await context.sendActivity(reply)
  }

  async onTeamsTeamDeleted (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('Hi, the team was deleted')
    console.log('Hi, the team was deleted')
    await context.sendActivity(reply)
  }

  async onTeamsTeamHardDeleted (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('Hi, the team was hard deleted')
    console.log('Hi, the team was hard deleted')
    await context.sendActivity(reply)
  }

  async onTeamsTeamRestored (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('Hi, the team has been restored')
    console.log('Hi, the team has been restored')
    await context.sendActivity(reply)
  }

  async onTeamsTeamUnarchived (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('Hi, the team has been unarchived')
    console.log('Hi, the team has been unarchived')
    await context.sendActivity(reply)
  }

  async onTeamsChannelCreated (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('Hi, the channel has been created')
    await context.sendActivity(reply)
  }

  async onTeamsChannelDeleted (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('Hi, the channel has been deleted')
    await context.sendActivity(reply)
  }

  async onTeamsChannelRenamed (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('Hi, the channel has been renamed')
    await context.sendActivity(reply)
  }

  async onTeamsChannelRestored (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('Hi, the channel has been restored')
    console.log('Hi, the channel has been restored')
    await context.sendActivity(reply)
  }

  async findPackages (text: string): Promise<[{ item1: string, item2: string, item3: string, item4: string, item5: string }]> {
    const response = await fetch(`https://azuresearch-usnc.nuget.org/query?q=id:${text}&prerelease=true`)
    const status = response.status

    if (status !== 200) {
      return [{ item1: '', item2: '', item3: '', item4: '', item5: '' }]
    } else {
      const jsonValues: any = await response.json()
      const items = jsonValues['data']
      return items.map((item: any) => {
        return { item1: item['id'], item2: item['version'], item3: item['description'], item4: item['projectUrl'], item5: item['iconUrl'] }
      })
    }
  }

  getAdaptiveCard (): MessagingExtensionResponse {
    const previewCard: Partial<ThumbnailCard> = {
      title: 'Adaptive Card',
      text: 'Please select to get Adaptive card'
    }
    const attachment: Attachment = {
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: restaurantCardResource
    }

    const previewAttachment: Attachment = {
      content: previewCard,
      contentType: 'application/vnd.microsoft.card.thumbnail'
    }

    const messagingExtensionAttachment: MessagingExtensionAttachment = {
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: attachment.content,
      preview: previewAttachment
    }

    const messagingExtensionAttachmentList = [messagingExtensionAttachment]
    return {
      composeExtension: {
        attachmentLayout: 'list',
        type: 'result',
        attachments: messagingExtensionAttachmentList
      }
    }
  }

  static getTaskModuleHeroCardOptions (): Attachment {
    const taskModuleActions: any = []
    const taskModules = [
      TaskModuleUIConstants.AdaptiveCard,
      TaskModuleUIConstants.CustomForm,
      TaskModuleUIConstants.YouTube
    ]

    taskModules.map((taskModule) => {
      const stringFetchValue = new CardTaskFetchValue<string>()
      stringFetchValue.data = taskModule.id

      const taskModuleAction = new TaskModuleAction(taskModule.buttonTitle as string, stringFetchValue)

      taskModuleActions.push(taskModuleAction)
      return taskModuleAction
    })

    const heroCard: Partial<HeroCard> = {
      title: 'Dialogs (referred to as task modules in TeamsJS v1.x) Invocation from Hero Card',
      buttons: taskModuleActions
    }

    const attachment: Attachment = {
      content: heroCard,
      contentType: CardFactory.contentTypes.heroCard
    }

    return attachment
  }

  static getTaskModuleAdaptiveCardOptions (): Attachment {
    const adaptiveCard = new AdaptiveCards.AdaptiveCard()
    adaptiveCard.version = new AdaptiveCards.Version(1, 2)

    const textBlock = new AdaptiveCards.TextBlock()
    textBlock.text = 'Dialogs (referred as task modules in TeamsJS v1.x) Invocation from Adaptive Card'
    textBlock.size = AdaptiveCards.TextSize.Large
    textBlock.weight = AdaptiveCards.TextWeight.Bolder

    adaptiveCard.addItem(textBlock)

    const taskModules = [
      TaskModuleUIConstants.AdaptiveCard,
      TaskModuleUIConstants.CustomForm,
      TaskModuleUIConstants.YouTube
    ]

    taskModules.map((taskModule) => {
      const action = new AdaptiveCards.SubmitAction()
      action.title = taskModule.buttonTitle ?? ''
      const cardTaskFetchValue = new AdaptiveCardTaskFetchValue<string>()
      cardTaskFetchValue.data = taskModule.id
      action.data = cardTaskFetchValue
      adaptiveCard.addAction(action)
      return action
    })

    return {
      contentType: CardFactory.contentTypes.adaptiveCard,
      content: adaptiveCard
    }
  }

  createAdaptiveCardAttachment (): Attachment | undefined {
    const adaptiveCardAttachment: Attachment = {
      contentType: CardFactory.contentTypes.adaptiveCard,
      content: adaptiveCardResource
    }

    return adaptiveCardAttachment
  }

  setTaskInfo (uiConstants: UISettings): TaskModuleTaskInfo {
    const taskInfo: TaskModuleTaskInfo = {
      height: uiConstants.height,
      width: uiConstants.width,
      title: uiConstants.title
    }

    return taskInfo
  }
}
