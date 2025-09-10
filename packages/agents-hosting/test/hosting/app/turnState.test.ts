import { strict as assert } from 'assert'
import { describe, it, beforeEach } from 'node:test'
import { TurnState } from './../../../src/app/turnState'

// import { createTestTurnContextAndState } from './internals/testing/TestUtilities'
import { Activity } from '@microsoft/agents-activity'
import { TestAdapter } from '../testStubs'
import { TurnContext } from '../../../src/turnContext'

describe('TurnState', () => {
  let adapter: TestAdapter
  let activity: Activity
  let turnState: TurnState
  let context: TurnContext
  beforeEach(async () => {
    activity = Activity.fromObject({
      type: 'message',
      from: {
        id: 'test',
        name: 'test'
      },
      conversation: {
        id: 'test'
      },
      channelId: 'test',
      recipient: {
        id: 'test'
      }
    })
    adapter = new TestAdapter()
    turnState = new TurnState()
    context = new TurnContext(adapter, activity)
    await turnState.load(context)
  })

  describe('conversation', () => {
    // it("should throw an error if TurnState hasn't been loaded", () => {
    //   assert.throws(() => turnState.conversation, new Error("TurnState hasn't been loaded. Call load() first."))
    // })

    it('should get and set the conversation state', async () => {
      const conversationState = { prop: 'value' }

      await turnState.load(context)

      // Set the conversation state
      turnState.conversation = conversationState
      // Get the conversation state
      const retrievedConversationState = turnState.conversation

      // Assert that the retrieved conversation state is the same as the original conversation state
      assert.equal(retrievedConversationState, conversationState)
    })
  })

  // it("should throw an error if TurnState hasn't been loaded", () => {
  //   assert.throws(() => turnState.temp, new Error("TurnState hasn't been loaded. Call load() first."))
  // })

  it('should get and set the user state', async () => {
    const context = new TurnContext(adapter, activity)
    // Mock the user state
    turnState.load(context)
    const userState = { prop: 'value' }
    // Set the user state
    turnState.user = userState

    // Get the user state
    const retrievedUserState = turnState.user

    // Assert that the retrieved user state is the same as the original user state
    assert.equal(retrievedUserState, userState)
  })

  it('should store data in temp state if scope is not provided', async () => {
    const context = new TurnContext(adapter, activity)

    turnState.load(context)

    turnState.setValue('stateKey', 'test-value')

    // Get the temp state
    const retrievedTempState = turnState.getValue('stateKey')

    // Assert that the retrieved temp state is the same as the original temp state
    assert.deepEqual(retrievedTempState, 'test-value')
  })

  it('should delete the conversation state', async () => {
    const context = new TurnContext(adapter, activity)
    // Mock the user state
    turnState.load(context)
    // Mock the conversation state
    const conversationState = { prop: 'value' }

    // Set the conversation state
    turnState.conversation = conversationState

    // Delete the conversation state
    turnState.deleteConversationState()

    // Get the conversation state
    const retrievedConversationState = turnState.conversation

    // Assert that the conversation state is undefined
    assert.deepEqual(retrievedConversationState, {})
  })

  it('should delete the user state', async () => {
    const context = new TurnContext(adapter, activity)

    turnState.load(context)
    // Mock the user state
    const userState = { prop: 'value' }

    // Set the user state
    turnState.user = userState

    // Delete the user state
    turnState.deleteUserState()

    // Get the user state
    const retrievedUserState = turnState.user

    // Assert that the user state is undefined
    assert.deepEqual(retrievedUserState, {})
  })
})
