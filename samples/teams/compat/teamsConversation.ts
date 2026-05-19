import { ActionTypes, Channels, ConversationParameters } from '@microsoft/agents-activity'
import { CardFactory, CloudAdapter, MessageFactory, TurnContext } from '@microsoft/agents-hosting'
import { SetTeamsApiClientMiddleware, TeamsActivityHandler, TeamsInfo } from '@microsoft/agents-hosting-extensions-teams'
import { startServer } from '@microsoft/agents-hosting-express'
import { ChannelInfo, TeamInfo, TeamsChannelAccount } from '@microsoft/teams.api'
import UserMentionCardTemplate from '../../_resources/UserMentionCardTemplate.json'

type CardValue = {
  count?: number
}

export class TeamsConversationBot extends TeamsActivityHandler {
  constructor () {
    super()

    this.onMessage(async (context, next) => {
      context.activity.removeRecipientMention()
      const text = context.activity?.text?.trim().toLocaleLowerCase() ?? ''

      if (text.includes('mention me')) {
        await this.mentionAdaptiveCardActivity(context)
      } else if (text.includes('mention')) {
        await this.mentionActivity(context)
      } else if (text.includes('update')) {
        await this.cardActivity(context, true)
      } else if (text.includes('delete')) {
        await this.deleteCardActivity(context)
      } else if (text.includes('message')) {
        await this.messageAllMembers(context)
      } else if (text.includes('who')) {
        await this.getSingleMember(context)
      } else {
        await this.cardActivity(context, false)
      }

      await next()
    })

    this.onTeamsMembersAddedEvent(async (membersAdded: TeamsChannelAccount[], teamInfo: TeamInfo, context: TurnContext, next) => {
      if (context.activity.conversation?.conversationType !== 'personal') {
        for (const member of membersAdded) {
          if (member.id !== context.activity.recipient?.id) {
            await context.sendActivity(`Welcome to the team ${member.name ?? ''} !`)
          }
        }
      }

      await next()
    })

    this.onTeamsMembersRemovedEvent(async (membersRemoved: TeamsChannelAccount[], teamInfo: TeamInfo, context: TurnContext, next) => {
      for (const member of membersRemoved) {
        if (member.id !== context.activity.recipient?.id) {
          const card = CardFactory.heroCard('', `${member.id} was removed from ${teamInfo.name}.`)
          await context.sendActivity(MessageFactory.attachment(card))
        }
      }

      await next()
    })

    this.onTeamsChannelCreatedEvent(async (channelInfo: ChannelInfo, teamInfo: TeamInfo, context: TurnContext, next): Promise<void> => {
      const card = CardFactory.heroCard('', `${channelInfo.name} is the Channel created.`)
      await context.sendActivity(MessageFactory.attachment(card))
      await next()
    })

    this.onTeamsChannelRenamedEvent(async (channelInfo: ChannelInfo, teamInfo: TeamInfo, context: TurnContext, next): Promise<void> => {
      const card = CardFactory.heroCard('', `${channelInfo.name} is the new Channel name.`)
      await context.sendActivity(MessageFactory.attachment(card))
      await next()
    })

    this.onTeamsChannelDeletedEvent(async (channelInfo: ChannelInfo, teamInfo: TeamInfo, context: TurnContext, next): Promise<void> => {
      const card = CardFactory.heroCard('', `${channelInfo.name} is the Channel deleted.`)
      await context.sendActivity(MessageFactory.attachment(card))
      await next()
    })

    this.onTeamsTeamRenamedEvent(async (teamInfo: TeamInfo, context: TurnContext, next) => {
      const card = CardFactory.heroCard('', `${teamInfo.name} is the new Team name.`)
      await context.sendActivity(MessageFactory.attachment(card))
      await next()
    })
  }

  private async cardActivity (context: TurnContext, update: boolean) {
    const cardActions = [
      {
        text: 'MessageAllMembers',
        title: 'Message all members',
        type: ActionTypes.MessageBack
      },
      {
        text: 'whoAmI',
        title: 'Who am I?',
        type: ActionTypes.MessageBack
      },
      {
        text: 'mention me',
        title: 'Find me in Adaptive Card',
        type: ActionTypes.MessageBack
      },
      {
        text: 'Delete',
        title: 'Delete card',
        type: ActionTypes.MessageBack
      }
    ]

    if (update) {
      await this.sendUpdateCard(context, cardActions)
    } else {
      await this.sendWelcomeCard(context, cardActions)
    }
  }

  private async sendUpdateCard (context: TurnContext, cardActions: any) {
    const data = context.activity?.value as CardValue ?? { count: 0 }
    data.count = (data.count ?? 0) + 1

    cardActions.push({
      text: 'UpdateCardAction',
      title: 'Update Card',
      type: ActionTypes.MessageBack,
      value: data
    })

    const card = CardFactory.heroCard(
      'Updated card',
      `Update count: ${data.count}`,
      null,
      cardActions
    )
    const updatedCard = MessageFactory.attachment(card)
    updatedCard.id = context.activity.replyToId

    await context.updateActivity(updatedCard)
  }

  private async sendWelcomeCard (context: TurnContext, cardActions: any) {
    cardActions.push({
      text: 'UpdateCardAction',
      title: 'Update Card',
      type: ActionTypes.MessageBack,
      value: { count: 0 }
    })

    const card = CardFactory.heroCard(
      'Welcome card',
      '',
      null,
      cardActions
    )

    await context.sendActivity(MessageFactory.attachment(card))
  }

  private async getSingleMember (context: TurnContext) {
    let member

    try {
      member = await TeamsInfo.getMember(context, context.activity?.from?.id ?? '')
    } catch (error) {
      if (error instanceof Error && error.message.includes('Member not found')) {
        await context.sendActivity(MessageFactory.text('Member not found.'))
        return
      } else {
        throw error
      }
    }

    const message = MessageFactory.text(`You are: ${member.name}`)
    await context.sendActivity(message)
  }

  private async mentionAdaptiveCardActivity (context: TurnContext) {
    let member

    try {
      member = await TeamsInfo.getMember(context, context.activity?.from?.id ?? '')
    } catch (error) {
      if (error instanceof Error && error.message.includes('Member not found')) {
        await context.sendActivity('Member not found.')
        return
      } else {
        throw error
      }
    }

    let templateJson = JSON.stringify(UserMentionCardTemplate)
    templateJson = templateJson
      /* eslint-disable no-template-curly-in-string */
      .replaceAll('${userName}', member.name ?? '')
      .replaceAll('${userUPN}', member.id ?? '')
      .replaceAll('${userAAD}', member.aadObjectId ?? '')
      /* eslint-enable no-template-curly-in-string */

    const card = CardFactory.adaptiveCard(JSON.parse(templateJson))

    await context.sendActivity(MessageFactory.attachment(card))
  }

  private async mentionActivity (context: TurnContext) {
    const mention = {
      mentioned: context.activity.from,
      text: `<at>${new TextEncoder().encode(context.activity?.from?.name)}</at>`,
      type: 'mention'
    }

    const replyActivity = MessageFactory.text(`Hello ${mention.text}`)
    replyActivity.entities = [mention]

    await context.sendActivity(replyActivity)
  }

  private async deleteCardActivity (context: TurnContext) {
    if (!context.activity.replyToId) {
      await context.sendActivity('This card cannot be deleted because there is no reply target.')
      return
    }

    await context.deleteActivity(context.activity.replyToId)
  }

  private async messageAllMembers (context: TurnContext) {
    const appId = typeof context.identity?.aud === 'string' ? context.identity.aud : undefined
    const tenantId = context.activity.conversation?.tenantId
    const serviceUrl = context.activity.serviceUrl

    if (!appId || !tenantId || !serviceUrl) {
      await context.sendActivity('This command requires an authenticated Teams conversation with tenant and service URL information.')
      return
    }

    const members = await this.getPagedMembers(context)

    members.forEach(async (member: TeamsChannelAccount) => {
      if (member.id === context.activity.recipient?.id) {
        return
      }

      const proactiveMessage = MessageFactory.text(`Hello ${member.name}. I'm a Teams conversation bot.`)
      const conversationParameters = {
        isGroup: false,
        agent: context.activity.recipient,
        members: [{ id: member.id, name: member.name }],
        tenantId
      } as ConversationParameters

      const adapter = context.adapter as CloudAdapter

      await adapter.createConversationAsync(
        appId,
        context.activity.channelId ?? Channels.Msteams,
        serviceUrl,
        'https://api.botframework.com',
        conversationParameters,
        async (context) => {
          const convReference = context.activity.getConversationReference()
          await adapter.continueConversation(
            appId,
            convReference,
            async (proactiveContext) => {
              await proactiveContext.sendActivity(proactiveMessage)
            }
          )
        }
      )
    })

    await context.sendActivity('All messages have been sent.')
  }

  private async getPagedMembers (context: TurnContext): Promise<TeamsChannelAccount[]> {
    let continuationToken
    const members: TeamsChannelAccount[] = []

    do {
      const pagedMembers = await TeamsInfo.getPagedMembers(context, 100, continuationToken)
      continuationToken = pagedMembers.continuationToken
      members.push(...pagedMembers.members)
    } while (continuationToken !== undefined)

    return members
  }
}

startServer(
  new TeamsConversationBot(),
  {
    configureAdapter: (adapter) => {
      adapter.use(new SetTeamsApiClientMiddleware())
    }
  }
)
