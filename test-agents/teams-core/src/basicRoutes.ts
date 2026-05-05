import {
  AgentApplication,
  TurnContext,
  TurnState
} from '@microsoft/agents-hosting'

import {
  parseTeamsChannelData,
  TeamsAgentExtension,
  TeamsInfo,
} from '@microsoft/agents-hosting-extensions-teams'

import {
  createHeroCardActivity,
} from './cards'

export function registerBasicRoutes (app: AgentApplication<TurnState>, tae: TeamsAgentExtension) {
  console.log('Teams extension registered')

  app.onMessageReactionAdded(async (context: TurnContext, state: TurnState) => {
    const reactionsAdded = context.activity.reactionsAdded
    if (reactionsAdded && reactionsAdded.length > 0) {
      const reactionType = reactionsAdded[0].type
      console.log('Generic message reaction added:', reactionType)
      await context.sendActivity(`Thanks for adding a ${reactionType} reaction (non-Teams channel).`)
    }
  })

  app.onMessageReactionRemoved(async (context: TurnContext, state: TurnState) => {
    const reactionsRemoved = context.activity.reactionsRemoved
    if (reactionsRemoved && reactionsRemoved.length > 0) {
      const reactionType = reactionsRemoved[0].type
      console.log('Generic message reaction removed:', reactionType)
      await context.sendActivity(`You removed your ${reactionType} reaction (non-Teams channel).`)
    }
  })

  // Chat events -> test in  a team

  tae.onMessageEdit(async (context: TurnContext, state: TurnState) => {
    console.log('Message edited:', context.activity.text)
    await context.sendActivity('I noticed you edited your message.')
  })

  tae.onMessageDelete(async (context: TurnContext, state: TurnState) => {
    console.log('Message deleted')
    await context.sendActivity('I noticed you deleted a message.')
  })

  tae.onMessageUndelete(async (context: TurnContext, state: TurnState) => {
    console.log('Message undeleted')
    await context.sendActivity('I noticed you undeleted a message.')
  })

  // Team events

  tae.onTeamsMembersAdded(async (context: TurnContext, state: TurnState) => {
    console.log('Teams members added')
    for (const member of context.activity.membersAdded || []) {
      if (member.id !== context.activity.recipient?.id && context.activity.conversation?.conversationType !== 'personal') {
        await context.sendActivity(`Welcome to the team ${member.name}.`)
      }
    }
  })

  tae.onTeamsMembersRemoved(async (context: TurnContext, state: TurnState) => {
    console.log('Teams members removed')
    for (const member of context.activity.membersRemoved || []) {
      if (member.id === context.activity.recipient?.id) {
        // The bot was removed.
        // You should clear any cached data you have for this team.
        console.log('The bot has been removed from the team.')
      } else {
        const teamDetails = await TeamsInfo.getTeamDetails(context)
        const activity = createHeroCardActivity(`${member.name} was removed from ${teamDetails.name}`)
        await context.sendActivity(activity)
      }
    }
  })

  tae.onTeamsTeamRenamed(async (context: TurnContext, state: TurnState) => {
    console.log('Team renamed')

    const teamInfo = parseTeamsChannelData(context.activity.channelData).team
    const teamName = teamInfo?.name || 'Unknown Team'

    const activity = createHeroCardActivity(`${teamName} is the new Team name`)
    await context.sendActivity(activity)
  })

  tae.onTeamsTeamDeleted(async (context: TurnContext, state: TurnState) => {
    console.log('Team deleted')
    await context.sendActivity('The team has been deleted.')
  })

  tae.onTeamsTeamArchived(async (context: TurnContext, state: TurnState) => {
    console.log('Team archived')
    await context.sendActivity('The team has been archived.')
  })

  tae.onTeamsTeamHardDeleted(async (context: TurnContext, state: TurnState) => {
    console.log('Team hard deleted')
    await context.sendActivity('The team has been permanently deleted.')
  })

  tae.onTeamsTeamRestored(async (context: TurnContext, state: TurnState) => {
    console.log('Team restored')
    await context.sendActivity('The team has been restored.')
  })

  tae.onTeamsTeamUnarchived(async (context: TurnContext, state: TurnState) => {
    console.log('Team unarchived')
    await context.sendActivity('The team has been unarchived.')
  })

  // Channel events

  tae.onTeamsChannelCreated(async (context: TurnContext, state: TurnState) => {
    console.log('Channel created')

    const teamsChannelData = parseTeamsChannelData(context.activity.channelData)

    const activity = createHeroCardActivity(`${teamsChannelData.channel?.name} is the Channel created`)
    await context.sendActivity(activity)
  })

  tae.onTeamsChannelRenamed(async (context: TurnContext, state: TurnState) => {
    console.log('Channel renamed')

    const teamsChannelData = parseTeamsChannelData(context.activity.channelData)

    const activity = createHeroCardActivity(`${teamsChannelData.channel?.name} is the new Channel name`)
    await context.sendActivity(activity)
  })

  tae.onTeamsChannelDeleted(async (context: TurnContext, state: TurnState) => {
    console.log('Channel deleted')

    const teamsChannelData = parseTeamsChannelData(context.activity.channelData)

    const activity = createHeroCardActivity(`${teamsChannelData.channel?.name} is the Channel deleted`)
    await context.sendActivity(activity)
  })

  tae.meeting
    .onMeetingStart(async (context: TurnContext, state: TurnState) => {
      console.log('Meeting started:', context.activity.value)
      await context.sendActivity('Welcome to the meeting! I\'m your meeting assistant.')
    })
    .onMeetingEnd(async (context: TurnContext, state: TurnState) => {
      console.log('Meeting ended:', context.activity.value)
      await context.sendActivity('The meeting has ended. Thanks for participating!')
    })
    .onParticipantsJoin(async (context: TurnContext, state: TurnState) => {
      const participantInfo = context.activity.value
      console.log('Participants joined:', participantInfo)
      await context.sendActivity('Welcome to the meeting!')
    })
    .onParticipantsLeave(async (context: TurnContext, state: TurnState) => {
      const participantInfo = context.activity.value
      console.log('Participants left:', participantInfo)
      await context.sendActivity('Goodbye! Thanks for joining the meeting.')
    })

  // Currently, we are unable to utilize these route hooks
  // .onReaction(async (context: TurnContext, state: TurnState) => {
  //   const reactionInfo = context.activity.value
  //   console.log('Reaction received:', reactionInfo)
  // })
  // .onPollResponse(async (context: TurnContext, state: TurnState) => {
  //   const pollData = context.activity.value
  //   console.log('Poll response received:', pollData)
  // })
  // .onScreenShareStart(async (context: TurnContext, state: TurnState) => {
  //   console.log('Screen sharing started')
  //   await context.sendActivity('Screen sharing has started.')
  // })
  // .onRecordingStarted(async (context: TurnContext, state: TurnState) => {
  //   console.log('Recording started')
  //   await context.sendActivity('Recording has started.')
  // })
  // .onRecordingStopped(async (context: TurnContext, state: TurnState) => {
  //   console.log('Recording stopped')
  //   await context.sendActivity('Recording has stopped.')
  // })
}
