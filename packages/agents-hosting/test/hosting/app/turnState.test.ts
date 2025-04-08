import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { TurnState } from './../../../src/app'
import { TurnStateProperty } from './../../../src/app/turnStateProperty'
import { BaseAdapter } from '../../../src/baseAdapter'
import { Activity, ConversationReference } from '@microsoft/agents-activity'
import { TurnContext, ResourceResponse, AttachmentData, AttachmentInfo } from '../../../src'
// import { createTestTurnContextAndState } from './internals/testing/TestUtilities'
// import { TestAdapter } from 'botbuilder'

class TestAdapter extends BaseAdapter {
  sendActivities (context: TurnContext, activities: Activity[]): Promise<ResourceResponse[]> {
    throw new Error('Method not implemented.')
  }

  updateActivity (context: TurnContext, activity: Activity): Promise<ResourceResponse | void> {
    throw new Error('Method not implemented.')
  }

  deleteActivity (context: TurnContext, reference: Partial<ConversationReference>): Promise<void> {
    throw new Error('Method not implemented.')
  }

  continueConversation (reference: Partial<ConversationReference>, logic: (revocableContext: TurnContext) => Promise<void>): Promise<void> {
    throw new Error('Method not implemented.')
  }

  uploadAttachment (conversationId: string, attachmentData: AttachmentData): Promise<ResourceResponse> {
    throw new Error('Method not implemented.')
  }

  getAttachmentInfo (attachmentId: string): Promise<AttachmentInfo> {
    throw new Error('Method not implemented.')
  }

  getAttachment (attachmentId: string, viewId: string): Promise<NodeJS.ReadableStream> {
    throw new Error('Method not implemented.')
  }
}

const createTestTurnContextAndState = (adapter: TestAdapter, activity: Partial<Activity>): [TurnContext, TurnState] => {
  const context = new TurnContext(adapter, activity as Activity)
  const state = new TurnState()
  return [context, state]
}

describe('TurnStateProperty', () => {
  it('should throw an error when TurnState is missing state scope named scope', () => {
    const state = new TurnState()
    const scopeName = 'scope'
    const propertyName = 'propertyName'
    const createTurnStateProperty = () => {
      const res = new TurnStateProperty(state, scopeName, propertyName)
      return res
    }
    assert.throws(createTurnStateProperty, 'TurnStateProperty: TurnState missing state scope named "scope".')
  })

  it('should set the turn state property', async () => {
    const adapter = new TestAdapter()
    const [context, state] = await createTestTurnContextAndState(adapter, {
      type: 'message',
      from: {
        id: 'test',
        name: 'test'
      }
    })
    const propertyName = 'tempStateProperty'
    const turnStateProperty = new TurnStateProperty(state, 'temp', propertyName)

    await turnStateProperty.set(context, 'someValue')
    const value = await turnStateProperty.get(context)
    assert.equal(value, 'someValue')
  })

  it('should delete the turn state property', async () => {
    const adapter = new TestAdapter()
    const [context, state] = await createTestTurnContextAndState(adapter, {
      type: 'message',
      from: {
        id: 'test',
        name: 'test'
      }
    })
    const propertyName = 'tempStateProperty'
    const turnStateProperty = new TurnStateProperty(state, 'temp', propertyName)

    await turnStateProperty.set(context, 'someValue')
    await turnStateProperty.delete()
    const value = await turnStateProperty.get(context)
    assert.notEqual(value, 'someValue')
  })
})
