import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import assert from 'assert'
import { describe, it } from 'node:test'
import { parseTeamsChannelData } from '../../src/activity-extensions/teamsChannelDataParser'
import { ChannelInfo } from '../activity-extensions/channelInfo'
import { ChannelTypes } from '../activity-extensions/channelTypes'

describe('parseTeamsChannelData test', () => {
  it('Parse with no properties defined', () => {
    const teamsChannelDataObject = {}
    const obj = { type: ActivityTypes.Message, channelData: teamsChannelDataObject }
    const a1: Activity = Activity.fromObject(obj)
    const teamsChannelData = parseTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })

  it('Parse with channel', () => {
    const channelInfo = {
      id: 'id',
      name: 'name',
      type: 'type'
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

  it('Parse with eventType', () => {
    const teamsChannelDataObject = {
      eventType: 'eventType'
    }
    const obj = { type: ActivityTypes.Message, channelData: teamsChannelDataObject }
    const a1: Activity = Activity.fromObject(obj)
    const teamsChannelData = parseTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })

  it('Parse with team', () => {
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

  it('Parse with notification', () => {
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

  it('Parse with tenant', () => {
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

  it('Parse with meeting', () => {
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

  it('Parse with settings', () => {
    const channelInfo: ChannelInfo = {
      id: 'id',
      name: 'name',
      type: ChannelTypes.Standard
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

  it('Parse with settings with extra props', () => {
    const channelInfo: ChannelInfo = {
      id: 'id',
      name: 'name',
      type: ChannelTypes.Standard
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

  it('Parse with onBehalfOf', () => {
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

  it('Parse with onBehalfOf with only required props', () => {
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

  it('Parse with onBehalfOf with literal values', () => {
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
