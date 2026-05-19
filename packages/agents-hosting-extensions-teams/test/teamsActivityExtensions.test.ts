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
    it('returns the selected channel id from settings', () => {
      const activity = Activity.fromObject({
        type: 'message',
        channelData: { settings: { selectedChannel: { id: 'channel-1' } } }
      })
      assert.strictEqual(teamsGetSelectedChannelId(activity), 'channel-1')
    })

    it('returns undefined when settings is absent', () => {
      const activity = Activity.fromObject({ type: 'message', channelData: {} })
      assert.strictEqual(teamsGetSelectedChannelId(activity), undefined)
    })

    it('returns undefined when channelData is undefined', () => {
      const activity = Activity.fromObject({ type: 'message' })
      assert.strictEqual(teamsGetSelectedChannelId(activity), undefined)
    })
  })

  describe('teamsGetChannelId', () => {
    it('returns the channel id from channelData', () => {
      const activity = Activity.fromObject({
        type: 'message',
        channelData: { channel: { id: 'chan-42' } }
      })
      assert.strictEqual(teamsGetChannelId(activity), 'chan-42')
    })

    it('returns undefined when channel is absent', () => {
      const activity = Activity.fromObject({ type: 'message', channelData: {} })
      assert.strictEqual(teamsGetChannelId(activity), undefined)
    })
  })

  describe('teamsGetMeetingInfo', () => {
    it('returns the meeting info from channelData', () => {
      const activity = Activity.fromObject({
        type: 'message',
        channelData: { meeting: { id: 'meeting-1' } }
      })
      const result = teamsGetMeetingInfo(activity)
      assert.deepStrictEqual(result, { id: 'meeting-1' })
    })

    it('returns undefined when meeting is absent', () => {
      const activity = Activity.fromObject({ type: 'message', channelData: {} })
      assert.strictEqual(teamsGetMeetingInfo(activity), undefined)
    })
  })

  describe('teamsGetTeamInfo', () => {
    it('returns the team info from channelData', () => {
      const activity = Activity.fromObject({
        type: 'message',
        channelData: { team: { id: 'team-1', name: 'Team A' } }
      })
      const result = teamsGetTeamInfo(activity)
      assert.deepStrictEqual(result, { id: 'team-1', name: 'Team A' })
    })

    it('returns undefined when team is absent', () => {
      const activity = Activity.fromObject({ type: 'message', channelData: {} })
      assert.strictEqual(teamsGetTeamInfo(activity), undefined)
    })
  })

  describe('teamsNotifyUser', () => {
    it('sets notification on channelData with alert defaults', () => {
      const activity = Activity.fromObject({ type: 'message', channelData: {} })
      teamsNotifyUser(activity)
      const channelData = activity.channelData as Record<string, unknown>
      assert.deepStrictEqual(channelData.notification, { alert: true, alertInMeeting: false })
    })

    it('sets alertInMeeting when flag is true', () => {
      const activity = Activity.fromObject({ type: 'message', channelData: {} })
      teamsNotifyUser(activity, true)
      const channelData = activity.channelData as Record<string, unknown>
      assert.deepStrictEqual(channelData.notification, { alert: false, alertInMeeting: true })
    })

    it('includes externalResourceUrl when provided', () => {
      const activity = Activity.fromObject({ type: 'message', channelData: {} })
      teamsNotifyUser(activity, false, 'https://example.com/resource')
      const channelData = activity.channelData as Record<string, unknown>
      assert.deepStrictEqual(channelData.notification, {
        alert: true,
        alertInMeeting: false,
        externalResourceUrl: 'https://example.com/resource'
      })
    })

    it('creates channelData if it is null', () => {
      const activity = Activity.fromObject({ type: 'message' })
      activity.channelData = null
      teamsNotifyUser(activity)
      const channelData = activity.channelData as Record<string, unknown>
      assert.deepStrictEqual(channelData.notification, { alert: true, alertInMeeting: false })
    })
  })

  describe('teamsGetTeamOnBehalfOf', () => {
    it('returns onBehalfOf list from channelData', () => {
      const onBehalfOf = [{ itemid: 0, mentionType: 'person', mri: 'mri-1', displayName: 'User' }]
      const activity = Activity.fromObject({
        type: 'message',
        channelData: { onBehalfOf }
      })
      assert.deepStrictEqual(teamsGetTeamOnBehalfOf(activity), onBehalfOf)
    })

    it('returns undefined when onBehalfOf is absent', () => {
      const activity = Activity.fromObject({ type: 'message', channelData: {} })
      assert.strictEqual(teamsGetTeamOnBehalfOf(activity), undefined)
    })
  })

  describe('teamsEnableFeedbackLoop', () => {
    it('sets feedbackLoop channelData and returns true when channelData is null', () => {
      const activity = Activity.fromObject({ type: 'message' })
      activity.channelData = null
      const result = teamsEnableFeedbackLoop(activity)
      assert.strictEqual(result, true)
      assert.deepStrictEqual(activity.channelData, { feedbackLoop: { type: 'default' } })
    })

    it('sets custom feedbackLoop type', () => {
      const activity = Activity.fromObject({ type: 'message' })
      activity.channelData = null
      const result = teamsEnableFeedbackLoop(activity, 'custom')
      assert.strictEqual(result, true)
      assert.deepStrictEqual(activity.channelData, { feedbackLoop: { type: 'custom' } })
    })

    it('returns false when channelData is already set', () => {
      const activity = Activity.fromObject({ type: 'message', channelData: { existing: true } })
      const result = teamsEnableFeedbackLoop(activity)
      assert.strictEqual(result, false)
      assert.deepStrictEqual(activity.channelData, { existing: true })
    })
  })
})
