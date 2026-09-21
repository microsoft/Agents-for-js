// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import type { Activity } from '@microsoft/agents-activity'
import {
  Client,
  type AppBasedLinkQuery,
  type ChannelData,
  type ChannelInfo,
  type ConfigResponse,
  type FileConsentCardResponse,
  type MeetingDetails,
  type MessagingExtensionAction,
  type MessagingExtensionActionResponse,
  type MessagingExtensionQuery,
  type MessagingExtensionResponse,
  type O365ConnectorCardActionQuery,
  type OnBehalfOf,
  type TaskModuleRequest,
  type TaskModuleResponse,
  type TeamInfo,
  type TeamsChannelAccount
} from '@microsoft/teams.api'
import { parseTeamsChannelData } from '../../src/activity-extensions/teamsChannelData'
import { teamsGetChannelId, teamsGetMeetingInfo, teamsGetTeamInfo, teamsGetTeamOnBehalfOf } from '../../src/teamsActivityExtensions'
import { teamsGetDataAs } from '../../src/teamsModelExtensions'

declare const activity: Activity
declare const appBasedLinkQuery: AppBasedLinkQuery
declare const channelData: ChannelData
declare const channelInfo: ChannelInfo
declare const configResponse: ConfigResponse
declare const fileConsentResponse: FileConsentCardResponse
declare const meetingDetails: MeetingDetails
declare const messageExtensionAction: MessagingExtensionAction
declare const messageExtensionActionResponse: MessagingExtensionActionResponse
declare const messageExtensionQuery: MessagingExtensionQuery
declare const messageExtensionResponse: MessagingExtensionResponse
declare const o365ConnectorCardActionQuery: O365ConnectorCardActionQuery
declare const onBehalfOf: OnBehalfOf
declare const taskModuleRequest: TaskModuleRequest
declare const taskModuleResponse: TaskModuleResponse
declare const teamInfo: TeamInfo
declare const teamsChannelAccount: TeamsChannelAccount

function consume (..._values: unknown[]): void {}

// Client construction and the public member consumed by TeamsTurnContext.
const client: Client = new Client('https://service.example.com', {
  headers: { Authorization: 'Bearer token' }
})
const serviceUrl: string = client.serviceUrl

// Parsed models and the properties validated or read by this package.
const parsedChannelData: ChannelData = parseTeamsChannelData({})
consume(
  channelData.channel,
  channelData.eventType,
  channelData.meeting,
  channelData.team,
  parsedChannelData.channel,
  parsedChannelData.eventType,
  parsedChannelData.meeting,
  parsedChannelData.team,
  appBasedLinkQuery.state,
  appBasedLinkQuery.url,
  messageExtensionAction.botActivityPreview,
  messageExtensionAction.data,
  messageExtensionQuery.commandId,
  messageExtensionQuery.parameters,
  messageExtensionQuery.parameters?.[0]?.name,
  messageExtensionQuery.parameters?.[0]?.value,
  messageExtensionQuery.queryOptions,
  messageExtensionQuery.queryOptions?.count,
  messageExtensionQuery.queryOptions?.skip,
  messageExtensionQuery.state,
  taskModuleRequest.data
)

// Public helpers preserve the Teams API types and generic payload contract.
const channelId: string | undefined = teamsGetChannelId(activity)
const meetingInfo: ChannelData['meeting'] | undefined = teamsGetMeetingInfo(activity)
const returnedTeamInfo: ChannelData['team'] | undefined = teamsGetTeamInfo(activity)
const onBehalfOfEntries: OnBehalfOf[] | undefined = teamsGetTeamOnBehalfOf(activity)
const data: { id: string } | undefined = teamsGetDataAs<{ id: string }>(taskModuleRequest)

// Keep all response and event models in the contract even where this package
// forwards them without reading individual properties.
consume(
  channelInfo,
  configResponse,
  fileConsentResponse,
  meetingDetails,
  messageExtensionActionResponse,
  messageExtensionResponse,
  o365ConnectorCardActionQuery,
  onBehalfOf,
  taskModuleResponse,
  teamInfo,
  teamsChannelAccount,
  serviceUrl,
  channelId,
  meetingInfo,
  returnedTeamInfo,
  onBehalfOfEntries,
  data
)
