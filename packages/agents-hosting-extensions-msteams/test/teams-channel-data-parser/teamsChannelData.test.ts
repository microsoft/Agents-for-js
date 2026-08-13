import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import assert from 'assert'
import { describe, it } from 'node:test'
import { parseTeamsChannelData } from '../../src/activity-extensions'
import type { ChannelInfo } from '@microsoft/teams.api'

describe('parseTeamsChannelData test', () => {
  it('should parse an empty object when channelData is undefined', () => {
    const teamsChannelData = parseTeamsChannelData(undefined)
    assert.deepEqual(teamsChannelData, {})
  })

  it('should parse channelData when no properties are defined', () => {
    const teamsChannelDataObject = {}
    const obj = { type: ActivityTypes.Message, channelData: teamsChannelDataObject }
    const a1: Activity = Activity.fromObject(obj)
    const teamsChannelData = parseTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })

  it('should parse channelData when channel is present', () => {
    const channelInfo = {
      id: 'id',
      name: 'name',
      type: 'shared'
    }
    const teamsChannelDataObject = {
      channel: channelInfo
    }
    const obj = { type: ActivityTypes.Message, channelData: teamsChannelDataObject }
    const a1: Activity = Activity.fromObject(obj)
    const teamsChannelData = parseTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })

  it('should parse channelData when eventType is present', () => {
    const teamsChannelDataObject = {
      eventType: 'eventType'
    }
    const obj = { type: ActivityTypes.Message, channelData: teamsChannelDataObject }
    const a1: Activity = Activity.fromObject(obj)
    const teamsChannelData = parseTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })

  it('should parse channelData when team is present', () => {
    const team = {
      id: 'id',
      name: 'name',
      aadGroupId: 'aadGroupId'
    }
    const teamsChannelDataObject = {
      team
    }
    const obj = { type: ActivityTypes.Message, channelData: teamsChannelDataObject }
    const a1: Activity = Activity.fromObject(obj)
    const teamsChannelData = parseTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })

  it('should parse channelData when notification is present', () => {
    const notification = {
      alert: true,
      alertInMeeting: false,
      externalResourceUrl: 'externalResourceUrl'
    }
    const teamsChannelDataObject = {
      notification
    }
    const obj = { type: ActivityTypes.Message, channelData: teamsChannelDataObject }
    const a1: Activity = Activity.fromObject(obj)
    const teamsChannelData = parseTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })

  it('should parse channelData when tenant is present', () => {
    const tenant = {
      id: 'id'
    }
    const teamsChannelDataObject = {
      tenant
    }
    const obj = { type: ActivityTypes.Message, channelData: teamsChannelDataObject }
    const a1: Activity = Activity.fromObject(obj)
    const teamsChannelData = parseTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })

  it('should parse channelData when meeting is present', () => {
    const meeting = {
      id: 'id'
    }
    const teamsChannelDataObject = {
      meeting
    }
    const obj = { type: ActivityTypes.Message, channelData: teamsChannelDataObject }
    const a1: Activity = Activity.fromObject(obj)
    const teamsChannelData = parseTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })

  it('should parse channelData when settings are present', () => {
    const channelInfo: ChannelInfo = {
      id: 'id',
      name: 'name',
      type: 'standard'
    }
    const settings = {
      selectedChannel: channelInfo
    }
    const teamsChannelDataObject = {
      settings
    }
    const obj = { type: ActivityTypes.Message, channelData: teamsChannelDataObject }
    const a1: Activity = Activity.fromObject(obj)
    const teamsChannelData = parseTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })

  it('should parse channelData when settings contain extra properties', () => {
    const channelInfo: ChannelInfo = {
      id: 'id',
      name: 'name',
      type: 'standard'
    }
    const settings = {
      selectedChannel: channelInfo,
      extraProp: 'extraProp'
    }
    const teamsChannelDataObject = {
      settings
    }
    const obj = { type: ActivityTypes.Message, channelData: teamsChannelDataObject }
    const a1: Activity = Activity.fromObject(obj)
    const teamsChannelData = parseTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })

  it('should parse channelData when onBehalfOf is present', () => {
    const onBehalfOf = {
      itemid: 0,
      mentionType: 'person',
      mri: 'mri',
      displayName: 'displayName'
    }
    const teamsChannelDataObject = {
      onBehalfOf: [onBehalfOf]
    }
    const obj = { type: ActivityTypes.Message, channelData: teamsChannelDataObject }
    const a1: Activity = Activity.fromObject(obj)
    const teamsChannelData = parseTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })

  it('should parse channelData when onBehalfOf contains only required properties', () => {
    const onBehalfOf = {
      itemid: 1,
      mentionType: 'mentionType',
      mri: 'mri'
    }
    const teamsChannelDataObject = {
      onBehalfOf: [onBehalfOf]
    }
    const obj = { type: ActivityTypes.Message, channelData: teamsChannelDataObject }
    const a1: Activity = Activity.fromObject(obj)
    const teamsChannelData = parseTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })

  it('should parse channelData when onBehalfOf contains literal values', () => {
    const onBehalfOf = {
      itemid: 0,
      mentionType: 'person',
      mri: 'mri'
    }
    const teamsChannelDataObject = {
      onBehalfOf: [onBehalfOf]
    }
    const obj = { type: ActivityTypes.Message, channelData: teamsChannelDataObject }
    const a1: Activity = Activity.fromObject(obj)
    const teamsChannelData = parseTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })
})
