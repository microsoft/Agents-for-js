// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import {
  ActionTypes,
  ActivityTypes,
  Attachment,
  CardAction,
  CardFactory,
  CardImage,
  HeroCard,
  MemoryStorage,
  MessageFactory,
  TaskModuleAction,
  ThumbnailCard,
  TurnContext,
  TurnState
} from '@microsoft/agents-hosting'
import { TeamsApplication, TeamsInfo, TaskModuleTaskInfo, MessagingExtensionAttachment, MessagingExtensionResult } from '@microsoft/agents-hosting-teams'
import { TaskModuleUIConstants } from './models/taskModuleUIConstants'
import { CardTaskFetchValue } from './models/cardTaskFetchValue'
import { UISettings } from './models/uiSettings'
import { TaskModuleIds } from './models/taskModuleIds'
const restaurantCardResource = require('../cards/RestaurantCard.json')
const adaptiveCardResource = require('../cards/AdaptiveCard.json')

const baseUrl = process.env.BASE_URL?.endsWith('/') ? process.env.BASE_URL : process.env.BASE_URL + '/'

type ApplicationTurnState = TurnState
const storage = new MemoryStorage()
export const app = new TeamsApplication<ApplicationTurnState>({
  removeRecipientMention: false,
  storage,
  taskModules: { taskDataFilter: 'data' }
})

app.messageEventUpdate('editMessage', async (context: TurnContext, state: ApplicationTurnState) => {
  const reply = MessageFactory.text('You edited a message')
  await context.sendActivity(reply)
})

app.messageEventUpdate('softDeleteMessage', async (context: TurnContext, state: ApplicationTurnState) => {
  const reply = MessageFactory.text('You deleted a message')
  await context.sendActivity(reply)
})

app.messageEventUpdate('undeleteMessage', async (context: TurnContext, state: ApplicationTurnState) => {
  const reply = MessageFactory.text('You undeleted a message')
  await context.sendActivity(reply)
})

app.conversationUpdate('membersAdded', async (context: TurnContext, state: ApplicationTurnState) => {
  const newMember = JSON.stringify(context.activity.membersAdded)
  const reply = MessageFactory.text('Hi there! You are a new member' + newMember)
  await context.sendActivity(reply)
})

app.conversationUpdate('membersRemoved', async (context: TurnContext, state: ApplicationTurnState) => {
  const removedMember = JSON.stringify(context.activity.membersRemoved)
  const reply = MessageFactory.text('Hi there! A team member was removed' + removedMember)
  await context.sendActivity(reply)
})

app.conversationUpdate('teamRenamed', async (context: TurnContext, state: ApplicationTurnState) => {
  const reply = MessageFactory.text('Hi, the team was renamed')
  await context.sendActivity(reply)
})

app.conversationUpdate('teamArchived', async (context: TurnContext, state: ApplicationTurnState) => {
  const reply = MessageFactory.text('Hi, the team was archived')
  console.log('Hi, the team was archived')
  await context.sendActivity(reply)
})

app.conversationUpdate('teamDeleted', async (context: TurnContext, state: ApplicationTurnState) => {
  const reply = MessageFactory.text('Hi, the team was deleted')
  console.log('Hi, the team was deleted')
  await context.sendActivity(reply)
})

app.conversationUpdate('teamHardDeleted', async (context: TurnContext, state: ApplicationTurnState) => {
  const reply = MessageFactory.text('Hi, the team was hard deleted')
  console.log('Hi, the team was hard deleted')
  await context.sendActivity(reply)
})

app.conversationUpdate('teamRestored', async (context: TurnContext, state: ApplicationTurnState) => {
  const reply = MessageFactory.text('Hi, the team has been restored')
  console.log('Hi, the team has been restored')
  await context.sendActivity(reply)
})

app.conversationUpdate('teamUnarchived', async (context: TurnContext, state: ApplicationTurnState) => {
  const reply = MessageFactory.text('Hi, the team has been unarchived')
  console.log('Hi, the team has been unarchived')
  await context.sendActivity(reply)
})

app.conversationUpdate('channelCreated', async (context: TurnContext, state: ApplicationTurnState) => {
  const reply = MessageFactory.text('Hi, the channel has been created')
  await context.sendActivity(reply)
})

app.conversationUpdate('channelDeleted', async (context: TurnContext, state: ApplicationTurnState) => {
  const reply = MessageFactory.text('Hi, the channel has been deleted')
  await context.sendActivity(reply)
})

app.conversationUpdate('channelRenamed', async (context: TurnContext, state: ApplicationTurnState) => {
  const reply = MessageFactory.text('Hi, the channel has been renamed')
  await context.sendActivity(reply)
})

app.conversationUpdate('channelRestored', async (context: TurnContext, state: ApplicationTurnState) => {
  const reply = MessageFactory.text('Hi, the channel has been restored')
  console.log('Hi, the channel has been restored')
  await context.sendActivity(reply)
})

app.messageExtensions.selectItem(async (context: TurnContext, state: ApplicationTurnState, _query: any) => {
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
    attachmentLayout: 'list',
    type: 'result',
    attachments: [attachment]
  }
})

app.messageExtensions.query('searchQuery', async (context: TurnContext, state: ApplicationTurnState, query: any) => {
  let text = ''

  if (context.activity.value) {
    if (query?.parameters.initialRun === 'true') {
      return {}
    }

    text = query?.parameters?.searchQuery ?? ''
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
          attachmentLayout: 'list',
          type: 'result',
          attachments: [{
            content: card,
            contentType: CardFactory.contentTypes.heroCard,
            preview: attachment
          }]
        }
      }
      case 'adaptive card': {
        const response: MessagingExtensionResult = getAdaptiveCard()
        return response
      }
    }
  }

  const packages = await findPackages(text)

  // We take every row of the results and wrap them in cards wrapped in MessagingExtensionAttachment objects.
  // The Preview is optional, if it includes a Tap, that will trigger the OnTeamsMessagingExtensionSelectItem event back on this agent.
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
    attachmentLayout: 'list',
    type: 'result',
    attachments
  }
})

app.messageExtensions.submitAction('createCard', async (context: TurnContext, state: ApplicationTurnState, data: any) => {
  const heroCard = CardFactory.heroCard(data.title, data.text)
  const attachment = { contentType: heroCard.contentType, content: heroCard.content, preview: heroCard }

  return {
    type: 'result',
    attachmentLayout: 'list',
    attachments: [attachment]
  }
})

app.message('/teamsinfo', async (context: TurnContext, state: ApplicationTurnState) => {
  const channels = await TeamsInfo.getTeamChannels(context)
  const msg1 = `Meeting Participant: ${JSON.stringify(channels)}}`
  await context.sendActivity(MessageFactory.text(msg1))

  const teamDetails = await TeamsInfo.getTeamDetails(context)
  const msg2 = `Team Details: ${JSON.stringify(teamDetails)}`
  await context.sendActivity(MessageFactory.text(msg2))
})

app.message('/taskModule', async (context: TurnContext, state: ApplicationTurnState) => {
  const reply = MessageFactory.attachment(getTaskModuleHeroCardOptions())
  await context.sendActivity(reply)
})

app.taskModules.fetch(['AdaptiveCard', 'YouTube', 'CustomForm'], async (context: TurnContext, state: ApplicationTurnState, data: any) => {
  let taskInfo: TaskModuleTaskInfo = {}

  switch (data.data) {
    case TaskModuleIds.AdaptiveCard: {
      taskInfo = setTaskInfo(TaskModuleUIConstants.AdaptiveCard)
      taskInfo.card = createAdaptiveCardAttachment()
      break
    }

    case TaskModuleIds.YouTube: {
      taskInfo = setTaskInfo(TaskModuleUIConstants.YouTube)
      taskInfo.url = taskInfo.fallbackUrl = baseUrl + TaskModuleIds.YouTube
      break
    }

    case TaskModuleIds.CustomForm: {
      taskInfo = setTaskInfo(TaskModuleUIConstants.CustomForm)
      taskInfo.url = taskInfo.fallbackUrl = baseUrl + TaskModuleIds.CustomForm
      break
    }
  }

  return taskInfo
})

app.taskModules.submit(async (context: TurnContext) => true, async (context: TurnContext, state: ApplicationTurnState, data: any) => {
  const reply = MessageFactory.text('taskModules.submit Value: ' + JSON.stringify(data.usertext))
  await context.sendActivity(reply)
  return 'Thanks!'
})

app.activity(ActivityTypes.Message, async (context: TurnContext, state: ApplicationTurnState) => {
  await context.sendActivity(MessageFactory.text('Type "/teamsinfo" or "/taskModule"'))
})

async function findPackages (text: string): Promise<[{ item1: string, item2: string, item3: string, item4: string, item5: string }]> {
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

function getAdaptiveCard (): MessagingExtensionResult {
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
    attachmentLayout: 'list',
    type: 'result',
    attachments: messagingExtensionAttachmentList
  }
}

function getTaskModuleHeroCardOptions (): Attachment {
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

function createAdaptiveCardAttachment (): Attachment | undefined {
  const adaptiveCardAttachment: Attachment = {
    contentType: CardFactory.contentTypes.adaptiveCard,
    content: adaptiveCardResource
  }

  return adaptiveCardAttachment
}

function setTaskInfo (uiConstants: UISettings): TaskModuleTaskInfo {
  const taskInfo: TaskModuleTaskInfo = {
    height: uiConstants.height,
    width: uiConstants.width,
    title: uiConstants.title
  }

  return taskInfo
}
