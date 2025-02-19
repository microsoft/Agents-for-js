// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import {
  CloudAdapter,
  ConversationParameters,
  MeetingNotification,
  MessageFactory,
  TeamsActivityHandler,
  TeamsInfo,
  TeamsMember,
  TurnContext
}
  from '@microsoft/agents-bot-hosting'

export class TeamsJsBot extends TeamsActivityHandler {
  constructor () {
    super()
    this.onMessage(async (context) => {
      const text = context.activity.text!.trim()
      if (text.includes('getMeetingParticipant')) {
        const meetingParticipant = await TeamsInfo.getMeetingParticipant(context)
        await context.sendActivity(MessageFactory.text(`Meeting participant ${JSON.stringify(meetingParticipant)}`))
      } else if (text.includes('getMeetingInfo')) {
        const meeting = await TeamsInfo.getMeetingInfo(context)
        await context.sendActivity(MessageFactory.text(`Meeting Info ${JSON.stringify(meeting)}`))
      } else if (text.includes('getTeamDetails')) {
        const channels = await TeamsInfo.getTeamDetails(context)
        await context.sendActivity(MessageFactory.text(`Meeting participant ${JSON.stringify(channels)}`))
      } else if (text.includes('sendMessageToTeamsChannel')) {
        const teamsChannelData = context.activity.validateTeamsChannelData(context.activity.channelData)
        const channelId = teamsChannelData.channel?.id
        if (!channelId) {
          await context.sendActivity(MessageFactory.text('channelId not found'))
          return
        }
        const sentResult = await TeamsInfo.sendMessageToTeamsChannel(context, MessageFactory.text('msg from bot to channel'), channelId!, context.adapter.authConfig.clientId)
        await context.sendActivity(MessageFactory.text(`sebt ${JSON.stringify(sentResult)}`))
      } else if (text.includes('getTeamChannels')) {
        const channels = await TeamsInfo.getTeamChannels(context)
        await context.sendActivity(MessageFactory.text(`list channels: ${JSON.stringify(channels)}`))
      } else if (text.includes('getPagedMembers')) {
        const members = await TeamsInfo.getPagedMembers(context, 2)
        await context.sendActivity(MessageFactory.text(`members ${JSON.stringify(members.members.map(m => m.email!))}`))
      } else if (text.includes('getMember')) {
        const me = await TeamsInfo.getMember(context, context.activity.from!.id!)
        await context.sendActivity(MessageFactory.text(`You mentioned me! ${JSON.stringify(me)}`))
      } else if (text.includes('getPagedTeamMembers')) {
        const members = await TeamsInfo.getPagedTeamMembers(context, undefined, 2)
        await context.sendActivity(MessageFactory.text(`team members ${JSON.stringify(members.members.map(m => m.email!))}`))
      } else if (text.includes('getTeamMember')) {
        const teamsChannelData = context.activity.validateTeamsChannelData(context.activity.channelData)
        const teamId = teamsChannelData.team?.id
        const member = await TeamsInfo.getTeamMember(context, teamId!, context.activity.from!.id!)
        await context.sendActivity(MessageFactory.text(`team member ${JSON.stringify(member)}`))
      } else if (text.includes('sendMeetingNotification')) {
        const notification: MeetingNotification = { type: 'targetedMeetingNotification', value: { recipients: ['rido'], surfaces: [] } }
        const teamsChannelData = context.activity.validateTeamsChannelData(context.activity.channelData)
        const meetingId = teamsChannelData.meeting?.id
        const resp = await TeamsInfo.sendMeetingNotification(context, notification, meetingId)
        await context.sendActivity(MessageFactory.text(`sendMeetingNotification ${JSON.stringify(resp)}`))
      } else if (text.includes('sendMessageToListOfUsers')) {
        const members = await TeamsInfo.getPagedMembers(context, 2)
        const users: TeamsMember[] = []
        members.members.forEach(m => {
          if (m.email) {
            users.push({ id: m.id! })
          }
        })
        await TeamsInfo.sendMessageToListOfUsers(context, MessageFactory.text('msg from bot to list of users'), context.adapter.authConfig.tenantId!, users)
      } else if (text.includes('sendMessageToAllUsersInTenant')) {
        const batchResp = await TeamsInfo.sendMessageToAllUsersInTenant(context, MessageFactory.text('msg from bot to all users'), context.adapter.authConfig.tenantId!)
        console.log(batchResp.operationId)
      } else if (text.includes('sendMessageToAllUsersInTeam')) {
        const teamsChannelData = context.activity.validateTeamsChannelData(context.activity.channelData)
        const teamId = teamsChannelData.team?.id
        const batchResp = await TeamsInfo.sendMessageToAllUsersInTeam(context, MessageFactory.text('msg from bot to all users in team'), context.adapter.authConfig.tenantId!, teamId!)
        console.log(batchResp.operationId)
      } else if (text.includes('sendMessageToListOfChannels')) {
        const members = await TeamsInfo.getPagedMembers(context, 2)
        const users: TeamsMember[] = []
        members.members.forEach(m => {
          if (m.email) {
            users.push({ id: m.id! })
          }
        })
        await TeamsInfo.sendMessageToListOfChannels(context, MessageFactory.text('msg from bot to list of channels'), context.adapter.authConfig.tenantId!, users)
      } else if (text.includes('msg all_members')) {
        await this.messageAllMembers(context)
      } else {
        await context.sendActivities([
          MessageFactory.text('Welcome to teams-js-bot1'),
          MessageFactory.text('options: getMember, getMeetingInfo, getMeetingParticipant, sendMeetingNotification,  sendMessageToAllUsersInTenant, getTeamChannels, getTeamDetails, getPagedTeamMembers, getPagedMembers, sendMessageToTeamsChannel, sendMessageToListOfUsers, sendMessageToAllUsersInTenant, msg all_members')])
      }
    })

    this.onMembersAdded(async (context, next) => {
      const membersAdded = context.activity.membersAdded ?? []
      const welcomeText = 'Hello from teams-js-bot!'
      for (const member of membersAdded) {
        if (member.id !== (context.activity.recipient?.id ?? '')) {
          await context.sendActivity(MessageFactory.text(welcomeText, welcomeText))
        }
      }
      // By calling next() you ensure that the next BotHandler is run.
      await next()
    })
  }

  async messageAllMembers (context: TurnContext) {
    const author = await TeamsInfo.getMember(context, context.activity.from!.id!)
    const membersResult = await TeamsInfo.getPagedMembers(context, 2)
    await Promise.all(membersResult.members.map(async (member) => {
      const message = MessageFactory.text(
        `Hello ${member.givenName} ${member.surname}. I'm a Teams conversation bot. from ${author.email}`
      )

      const convoParams: ConversationParameters = {
        members: [{ id: member.id }],
        isGroup: false,
        bot: context.activity.recipient!,
        tenantId: context.activity.conversation!.tenantId,
        activity: message,
        channelData: context.activity.channelData
      }

      await (context.adapter as CloudAdapter).createConversationAsync(
        context.adapter.authConfig.clientId!,
        context.activity.channelId!,
        context.activity.serviceUrl!,
        'http://api.botframework.com',
        convoParams,
        async (context: TurnContext) => {
          const ref = context.activity.getConversationReference()

          await context.adapter.continueConversation(
            ref,
            async (context) => {
              await context.sendActivity(message)
            })
        })
    }))

    await context.sendActivity(MessageFactory.text('All messages have been sent.'))
  }
}
