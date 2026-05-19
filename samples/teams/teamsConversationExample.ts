import { ActionTypes, Channels, Entity, RoleTypes } from '@microsoft/agents-activity'
import { AgentApplication, CardFactory, CreateConversationOptionsBuilder, MemoryStorage, MessageFactory, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { TeamsAgentExtension, teamsGetTeamInfo, TeamsInfo } from '@microsoft/agents-hosting-extensions-teams'
import { startServer } from '@microsoft/agents-hosting-express'
import { ChannelInfo, TeamInfo } from '@microsoft/teams.api'

const app = new AgentApplication<TurnState>({ storage: new MemoryStorage() })

type CardValue = {
  count?: number
}

app.registerExtension<TeamsAgentExtension>(new TeamsAgentExtension(app), (tae) => {
  tae.channels.onMemberAdded(async (context: TurnContext) => {
    if (context.activity.conversation?.conversationType === 'personal') {
      return
    }

    for (const member of context.activity.membersAdded ?? []) {
      if (member.id !== context.activity.recipient?.id) {
        await context.sendActivity(`Welcome to the team ${member.name ?? ''} !`)
      }
    }
  })

  tae.channels.onMemberRemoved(async (context: TurnContext) => {
    for (const member of context.activity.membersRemoved ?? []) {
      if (member.id === context.activity.recipient?.id) {
        // the bot was removed.
        continue
      }

      const team = teamsGetTeamInfo(context.activity)
      const card = CardFactory.heroCard('', `${member.name ?? 'A member'} was removed from ${team?.name}`)
      await context.sendActivity(MessageFactory.attachment(card))
    }
  })

  tae.channels.onCreated(async (context: TurnContext, state: TurnState, channelInfo: ChannelInfo) => {
    const card = CardFactory.heroCard('', `${channelInfo.name} is the Channel created`)
    await context.sendActivity(MessageFactory.attachment(card))
  })

  tae.channels.onRenamed(async (context: TurnContext, state: TurnState, channelInfo: ChannelInfo) => {
    const card = CardFactory.heroCard('', `${channelInfo.name} is the new Channel name`)
    await context.sendActivity(MessageFactory.attachment(card))
  })

  tae.channels.onDeleted(async (context: TurnContext, state: TurnState, channelInfo: ChannelInfo) => {
    const card = CardFactory.heroCard('', `${channelInfo.name} is the Channel deleted`)
    await context.sendActivity(MessageFactory.attachment(card))
  })

  tae.teams.onRenamed(async (context: TurnContext, state: TurnState, teamInfo: TeamInfo) => {
    const card = CardFactory.heroCard('', `${teamInfo.name} is the new Team name`)
    await context.sendActivity(MessageFactory.attachment(card))
  })
})

app
  .onMessage('messageall', async (context: TurnContext) => {
    const appId = typeof context.identity?.aud === 'string' ? context.identity.aud : undefined
    const tenantId = context.activity.conversation?.tenantId
    const serviceUrl = context.activity.serviceUrl

    if (!appId || !tenantId || !serviceUrl) {
      await context.sendActivity('This command requires an authenticated Teams conversation with tenant and service URL information.')
      return
    }

    let continuationToken: string | undefined
    do {
      const currentPage = await TeamsInfo.getPagedMembers(context, 100, continuationToken)
      continuationToken = currentPage.continuationToken ?? undefined

      for (const member of currentPage.members) {
        if (member.id === context.activity.recipient?.id) {
          continue
        }

        const createConversationOptions = CreateConversationOptionsBuilder
          .create(appId, Channels.Msteams, serviceUrl)
          .withUser(member.id, member.name)
          .withTenantId(tenantId)
          .isGroup(false)
          .build()

        await app.proactive.createConversation(context.adapter, createConversationOptions, async (proactiveContext) => {
          await proactiveContext.sendActivity(`Hello ${member.name}. I'm a Teams agent.`)
        })
      }
    } while (continuationToken)

    await context.sendActivity('All messages have been sent.')
  })
  .onMessage('targeted', async (context: TurnContext) => {
    if (!context.activity.conversation?.isGroup) {
      await context.sendActivity('Targeted messages are only supported in group conversations.')
      return
    }

    const currentPage = await TeamsInfo.getPagedMembers(context)
    for (const member of currentPage.members) {
      if (member.id === context.activity.recipient?.id) {
        continue
      }

      const targetedActivity = MessageFactory.text(`${member.name}, this is a **targeted message** - only you can see this.`)
      targetedActivity.channelId = context.activity.channelId ?? Channels.Msteams
      targetedActivity.conversation = { ...context.activity.conversation }
      targetedActivity.recipient = {
        id: member.id,
        name: member.name,
        role: RoleTypes.User,
        tenantId: member.tenantId
      }
      targetedActivity.makeTargetedActivity()

      await context.sendActivity(targetedActivity)
    }
  })
  .onMessage('update', async (context: TurnContext) => {
    if (!context.activity.replyToId) {
      await context.sendActivity('This card cannot be updated because there is no reply target.')
      return
    }

    const nextCount = getCardCount(context.activity.value) + 1
    const updatedCard = MessageFactory.attachment(createConversationCard('I\'ve been updated', `Update count - ${nextCount}`, nextCount))
    updatedCard.id = context.activity.replyToId

    await context.updateActivity(updatedCard)
  })
  .onMessage('whoami', async (context: TurnContext) => {
    if (!context.activity.from?.id) {
      await context.sendActivity('The current Teams member could not be resolved.')
      return
    }

    try {
      const member = await TeamsInfo.getMember(context, context.activity.from.id)
      await context.sendActivity(`You are: ${member.name}.`)
    } catch (error) {
      if (error instanceof Error && error.message.includes('Member not found')) {
        await context.sendActivity('Member not found.')
      } else {
        throw error
      }
    }
  })
  .onMessage('delete', async (context: TurnContext) => {
    if (!context.activity.replyToId) {
      await context.sendActivity('This card cannot be deleted because there is no reply target.')
      return
    }

    await context.deleteActivity(context.activity.replyToId)
  })
  .onMessage(['mentionme', 'atmention'], async (context: TurnContext) => {
    if (!context.activity.from?.id) {
      await context.sendActivity('The current Teams member could not be resolved.')
      return
    }

    try {
      const member = await TeamsInfo.getMember(context, context.activity.from.id)
      const mentionText = `<at>${member.name}</at>`
      const mention: Entity = {
        mentioned: {
          id: member.id,
          name: member.name,
          role: RoleTypes.User,
          aadObjectId: member.aadObjectId,
          tenantId: member.tenantId
        },
        text: mentionText,
        type: 'mention'
      }
      const reply = MessageFactory.text(`Hello ${mentionText}.`)
      reply.entities = [mention]

      await context.sendActivity(reply)
    } catch {
      await context.sendActivity('Unable to mention you in this conversation.')
    }
  })
  .onActivity('message', async (context: TurnContext) => {
    await context.sendActivity(MessageFactory.attachment(createConversationCard('Welcome!', 'Choose a Teams conversation demo action.', 0)))
  })

function createConversationCard (title: string, text: string, count: number) {
  return CardFactory.heroCard(title, text, undefined, [
    {
      type: ActionTypes.MessageBack,
      title: 'Message all members',
      text: 'messageall'
    },
    {
      type: ActionTypes.MessageBack,
      title: 'Who am I?',
      text: 'whoami'
    },
    {
      type: ActionTypes.MessageBack,
      title: 'Mention Me',
      text: 'mentionme'
    },
    {
      type: ActionTypes.MessageBack,
      title: 'Delete Card',
      text: 'delete'
    },
    {
      type: ActionTypes.MessageBack,
      title: 'Send Targeted',
      text: 'targeted'
    },
    {
      type: ActionTypes.MessageBack,
      title: 'Update Card',
      text: 'update',
      value: { count }
    }
  ])
}

function getCardCount (value: unknown): number {
  const cardValue = value as CardValue | undefined
  return typeof cardValue?.count === 'number' ? cardValue.count : 0
}

startServer(app)
