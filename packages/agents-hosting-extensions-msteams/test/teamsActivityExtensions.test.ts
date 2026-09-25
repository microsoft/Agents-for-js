import assert from 'node:assert'
import { describe, it } from 'node:test'
import { Activity } from '@microsoft/agents-activity'
import {
  teamsGetSelectedChannelId,
  teamsGetChannelId,
  teamsGetMeetingInfo,
  teamsGetTeamInfo,
  teamsNotifyUser,
  teamsGetTeamOnBehalfOf,
  teamsEnableFeedbackLoop
} from '../src/teamsActivityExtensions'

describe('teamsActivityExtensions', () => {
  describe('teamsGetSelectedChannelId', () => {
    it('should return the selected channel ID when settings contain one', () => {
      const activity = Activity.fromObject({
        type: 'message',
        channelData: { settings: { selectedChannel: { id: 'channel-1' } } }
      })
      assert.strictEqual(teamsGetSelectedChannelId(activity), 'channel-1')
    })

    it('should return undefined when settings are absent', () => {
      const activity = Activity.fromObject({ type: 'message', channelData: {} })
      assert.strictEqual(teamsGetSelectedChannelId(activity), undefined)
    })

    it('should return undefined when channelData is undefined', () => {
      const activity = Activity.fromObject({ type: 'message' })
      assert.strictEqual(teamsGetSelectedChannelId(activity), undefined)
    })
  })

  describe('teamsGetChannelId', () => {
    it('should return the channel ID when channelData contains one', () => {
      const activity = Activity.fromObject({
        type: 'message',
        channelData: { channel: { id: 'chan-42' } }
      })
      assert.strictEqual(teamsGetChannelId(activity), 'chan-42')
    })

    it('should return undefined when channel is absent', () => {
      const activity = Activity.fromObject({ type: 'message', channelData: {} })
      assert.strictEqual(teamsGetChannelId(activity), undefined)
    })
  })

  describe('teamsGetMeetingInfo', () => {
    it('should return meeting information when channelData contains it', () => {
      const activity = Activity.fromObject({
        type: 'message',
        channelData: { meeting: { id: 'meeting-1' } }
      })
      const result = teamsGetMeetingInfo(activity)
      assert.deepStrictEqual(result, { id: 'meeting-1' })
    })

    it('should return undefined when meeting is absent', () => {
      const activity = Activity.fromObject({ type: 'message', channelData: {} })
      assert.strictEqual(teamsGetMeetingInfo(activity), undefined)
    })
  })

  describe('teamsGetTeamInfo', () => {
    it('should return team information when channelData contains it', () => {
      const activity = Activity.fromObject({
        type: 'message',
        channelData: { team: { id: 'team-1', name: 'Team A' } }
      })
      const result = teamsGetTeamInfo(activity)
      assert.deepStrictEqual(result, { id: 'team-1', name: 'Team A' })
    })

    it('should return undefined when team is absent', () => {
      const activity = Activity.fromObject({ type: 'message', channelData: {} })
      assert.strictEqual(teamsGetTeamInfo(activity), undefined)
    })
  })

  describe('teamsNotifyUser', () => {
    it('should set notification on channelData with alert defaults', () => {
      const activity = Activity.fromObject({ type: 'message', channelData: {} })
      teamsNotifyUser(activity)
      const channelData = activity.channelData as Record<string, unknown>
      assert.deepStrictEqual(channelData.notification, { alert: true, alertInMeeting: false })
    })

    it('should set alertInMeeting when the flag is true', () => {
      const activity = Activity.fromObject({ type: 'message', channelData: {} })
      teamsNotifyUser(activity, true)
      const channelData = activity.channelData as Record<string, unknown>
      assert.deepStrictEqual(channelData.notification, { alert: false, alertInMeeting: true })
    })

    it('should include externalResourceUrl when it is provided', () => {
      const activity = Activity.fromObject({ type: 'message', channelData: {} })
      teamsNotifyUser(activity, false, 'https://example.com/resource')
      const channelData = activity.channelData as Record<string, unknown>
      assert.deepStrictEqual(channelData.notification, {
        alert: true,
        alertInMeeting: false,
        externalResourceUrl: 'https://example.com/resource'
      })
    })

    it('should create channelData when it is null', () => {
      const activity = Activity.fromObject({ type: 'message' })
      activity.channelData = null
      teamsNotifyUser(activity)
      const channelData = activity.channelData as Record<string, unknown>
      assert.deepStrictEqual(channelData.notification, { alert: true, alertInMeeting: false })
    })
  })

  describe('teamsGetTeamOnBehalfOf', () => {
    it('should return the onBehalfOf list when channelData contains it', () => {
      const onBehalfOf = [{ itemid: 0, mentionType: 'person', mri: 'mri-1', displayName: 'User' }]
      const activity = Activity.fromObject({
        type: 'message',
        channelData: { onBehalfOf }
      })
      assert.deepStrictEqual(teamsGetTeamOnBehalfOf(activity), onBehalfOf)
    })

    it('should return undefined when onBehalfOf is absent', () => {
      const activity = Activity.fromObject({ type: 'message', channelData: {} })
      assert.strictEqual(teamsGetTeamOnBehalfOf(activity), undefined)
    })
  })

  describe('teamsEnableFeedbackLoop', () => {
    it('should set feedbackLoop channelData and return true when channelData is null', () => {
      const activity = Activity.fromObject({ type: 'message' })
      activity.channelData = null
      const result = teamsEnableFeedbackLoop(activity)
      assert.strictEqual(result, true)
      assert.deepStrictEqual(activity.channelData, { feedbackLoop: { type: 'default' } })
    })

    it('should set a custom feedbackLoop type', () => {
      const activity = Activity.fromObject({ type: 'message' })
      activity.channelData = null
      const result = teamsEnableFeedbackLoop(activity, 'custom')
      assert.strictEqual(result, true)
      assert.deepStrictEqual(activity.channelData, { feedbackLoop: { type: 'custom' } })
    })

    it('should return false when channelData is already set', () => {
      const activity = Activity.fromObject({ type: 'message', channelData: { existing: true } })
      const result = teamsEnableFeedbackLoop(activity)
      assert.strictEqual(result, false)
      assert.deepStrictEqual(activity.channelData, { existing: true })
    })
  })
})
