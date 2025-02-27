import { Activity, ActivityTypes } from '@microsoft/agents-bot-hosting'
import assert from 'assert'
import { describe, it } from 'node:test'
import { validateTeamsChannelData } from '../../src/validators/teamsChannelDataValidator'
import { ChannelInfo } from '../channel-data'

describe('TeamsChannelData Zod Validation', () => {
  it('Validate with no properties defined', () => {
    const teamsChannelDataObject = {}
    const obj = { type: ActivityTypes.Message, channelData: teamsChannelDataObject }
    const a1: Activity = Activity.fromObject(obj)
    const teamsChannelData = validateTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })

  it('Validate with channel', () => {
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
    const teamsChannelData = validateTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })

  it('Validate with eventType', () => {
    const teamsChannelDataObject = {
      eventType: 'eventType'
    }
    const obj = { type: ActivityTypes.Message, channelData: teamsChannelDataObject }
    const a1: Activity = Activity.fromObject(obj)
    const teamsChannelData = validateTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })

  it('Validate with team', () => {
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
    const teamsChannelData = validateTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })

  it('Validate with notification', () => {
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
    const teamsChannelData = validateTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })

  it('Validate with tenant', () => {
    const tenant = {
      id: 'id'
    }
    const teamsChannelDataObject = {
      tenant
    }
    const obj = { type: ActivityTypes.Message, channelData: teamsChannelDataObject }
    const a1: Activity = Activity.fromObject(obj)
    const teamsChannelData = validateTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })

  it('Validate with meeting', () => {
    const meeting = {
      id: 'id'
    }
    const teamsChannelDataObject = {
      meeting
    }
    const obj = { type: ActivityTypes.Message, channelData: teamsChannelDataObject }
    const a1: Activity = Activity.fromObject(obj)
    const teamsChannelData = validateTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })

  it('Validate with settings', () => {
    const channelInfo: ChannelInfo = {
      id: 'id',
      name: 'name',
      type: 'type'
    }
    const settings = {
      selectedChannel: channelInfo
    }
    const teamsChannelDataObject = {
      settings
    }
    const obj = { type: ActivityTypes.Message, channelData: teamsChannelDataObject }
    const a1: Activity = Activity.fromObject(obj)
    const teamsChannelData = validateTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })

  it('Validate with settings with extra props', () => {
    const channelInfo: ChannelInfo = {
      id: 'id',
      name: 'name',
      type: 'type'
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
    const teamsChannelData = validateTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })

  it('Validate with onBehalfOf', () => {
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
    const teamsChannelData = validateTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })

  it('Validate with onBehalfOf with only required props', () => {
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
    const teamsChannelData = validateTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })

  it('Validate with onBehalfOf with literal values', () => {
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
    const teamsChannelData = validateTeamsChannelData(a1.channelData)
    assert.strictEqual(a1.type, 'message')
    assert.deepEqual(a1.channelData, teamsChannelData)
  })
})
