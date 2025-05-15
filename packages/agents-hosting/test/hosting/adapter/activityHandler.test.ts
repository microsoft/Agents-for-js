/* eslint-disable @typescript-eslint/no-unused-vars */
import { strict as assert } from 'assert'
import { afterEach, describe, it } from 'node:test'
import { ActivityHandler, TurnContext } from '../../../src'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { BaseAdapter } from '../../../src/baseAdapter'

// @ts-expect-error
class SimpleAdapter extends BaseAdapter {}

describe('ActivityHandler', function () {
  const adapter = new SimpleAdapter()

  /**
   *
   * @param activity
   * @param handler
   */
  async function processActivity (activity: Activity, handler: ActivityHandler) {
    if (!activity) {
      throw new Error('Missing activity')
    }

    if (!handler) {
      throw new Error('Missing bot')
    }

    const context = new TurnContext(adapter, activity)
    await handler.run(context)
  }

  it('should fire onMessage for any message activities', async function () {
    const handler = new ActivityHandler()

    let onMessageCalled = false
    handler.onMessage(async (context, next) => {
      onMessageCalled = true
      await next()
    })

    await processActivity(new Activity(ActivityTypes.Message), handler)
    assert(onMessageCalled)
  })

  it('calling next allows following events to firing', async function () {
    const handler = new ActivityHandler()

    let onFirstMessageCalled = false
    handler.onMessage(async (context, next) => {
      onFirstMessageCalled = true
      await next()
    })

    let onSecondMessageCalled = false
    handler.onMessage(async (context, next) => {
      onSecondMessageCalled = true
      await next()
    })

    await processActivity(new Activity(ActivityTypes.Message), handler)
    assert(onFirstMessageCalled)
    assert(onSecondMessageCalled)
  })

  it('omitting call to next prevents following events from firing', async function () {
    const handler = new ActivityHandler()

    let onFirstMessageCalled = false
    handler.onMessage(async (context, next) => {
      onFirstMessageCalled = true
    })

    let onSecondMessageCalled = false
    handler.onMessage(async (context, next) => {
      onSecondMessageCalled = true
      await next()
    })

    await processActivity(new Activity(ActivityTypes.Message), handler)
    assert(onFirstMessageCalled)
    assert(!onSecondMessageCalled)
  })

  it('binding 2 methods to the same event both fire', async function () {
    const handler = new ActivityHandler()
    let count = 0

    let onMessageCalled = false
    handler.onMessage(async (_context, next) => {
      onMessageCalled = true
      count++
      await next()
    })

    let onMessageCalledAgain = false
    handler.onMessage(async (_context, next) => {
      onMessageCalledAgain = true
      count++
      await next()
    })

    await processActivity(new Activity(ActivityTypes.Message), handler)
    assert(onMessageCalled)
    assert(onMessageCalledAgain)
    assert(count === 2, 'all events did fire')
  })

  it('should fire onMessageUpdate', async function () {
    const handler = new ActivityHandler()

    let onMessageUpdate = false
    handler.onMessageUpdate(async (context, next) => {
      onMessageUpdate = true
      await next()
    })

    await processActivity(new Activity(ActivityTypes.MessageUpdate), handler)
    assert(onMessageUpdate)
  })

  it('should fire onMessageDelete', async function () {
    const handler = new ActivityHandler()

    let onMessageDelete = false
    handler.onMessageDelete(async (context, next) => {
      onMessageDelete = true
      await next()
    })

    await processActivity(new Activity(ActivityTypes.MessageDelete), handler)
    assert(onMessageDelete)
  })

  it('should fire onConversationUpdate', async function () {
    const handler = new ActivityHandler()

    let onConversationUpdateCalled = false
    handler.onConversationUpdate(async (context, next) => {
      onConversationUpdateCalled = true
      await next()
    })

    await processActivity(new Activity(ActivityTypes.ConversationUpdate), handler)
    assert(onConversationUpdateCalled)
  })

  it('should fire onMembersAdded', async function () {
    const handler = new ActivityHandler()

    let onMembersAddedCalled = false
    handler.onMembersAdded(async (context, next) => {
      onMembersAddedCalled = true
      await next()
    })

    await processActivity(Activity.fromObject({ type: ActivityTypes.ConversationUpdate, membersAdded: [{ id: '1' }] }), handler)
    assert(onMembersAddedCalled)
  })

  it('should fire onMembersRemoved', async function () {
    const handler = new ActivityHandler()

    let onMembersRemovedCalled = false
    handler.onMembersRemoved(async (context, next) => {
      onMembersRemovedCalled = true
      await next()
    })

    await processActivity(Activity.fromObject({ type: ActivityTypes.ConversationUpdate, membersRemoved: [{ id: '1' }] }), handler)
    assert(onMembersRemovedCalled)
  })

  it('should fire onMessageReaction', async function () {
    const handler = new ActivityHandler()

    let onMessageReactionCalled = false
    handler.onMessageReaction(async (context, next) => {
      onMessageReactionCalled = true
      await next()
    })

    await processActivity(new Activity(ActivityTypes.MessageReaction), handler)
    assert(onMessageReactionCalled)
  })
  it('should fire onInstallationUpdateAdd', async function () {
    const handler = new ActivityHandler()

    let onInstallationUpdateAddCalled = false
    handler.onInstallationUpdateAdd(async (context, next) => {
      onInstallationUpdateAddCalled = true
      await next()
    })

    await processActivity(Activity.fromObject({ type: ActivityTypes.InstallationUpdate, action: 'add' }), handler)
    assert(onInstallationUpdateAddCalled)
  })

  it('should fire onInstallationUpdateAddUpgrade', async function () {
    const handler = new ActivityHandler()

    let onInstallationUpdateAddCalled = false
    handler.onInstallationUpdateAdd(async (context, next) => {
      onInstallationUpdateAddCalled = true
      await next()
    })

    await processActivity(Activity.fromObject({ type: ActivityTypes.InstallationUpdate, action: 'add-upgrade' }), handler)
    assert(onInstallationUpdateAddCalled)
  })

  it('should fire onInstallationUpdateRemove', async function () {
    const handler = new ActivityHandler()

    let onInstallationUpdateRemoveCalled = false
    handler.onInstallationUpdateRemove(async (context, next) => {
      onInstallationUpdateRemoveCalled = true
      await next()
    })

    await processActivity(Activity.fromObject({ type: ActivityTypes.InstallationUpdate, action: 'remove' }), handler)
    assert(onInstallationUpdateRemoveCalled)
  })

  it('should fire onInstallationUpdateRemoveUpgrade', async function () {
    const handler = new ActivityHandler()

    let onInstallationUpdateRemoveCalled = false
    handler.onInstallationUpdateRemove(async (context, next) => {
      onInstallationUpdateRemoveCalled = true
      await next()
    })

    await processActivity(Activity.fromObject({ type: ActivityTypes.InstallationUpdate, action: 'remove-upgrade' }), handler)
    assert(onInstallationUpdateRemoveCalled)
  })

  it('should fire onEndOfConversation', async function () {
    const handler = new ActivityHandler()

    let onEndConversationCalled = false
    handler.onEndOfConversation(async (context, next) => {
      onEndConversationCalled = true
      await next()
    })

    await processActivity(new Activity(ActivityTypes.EndOfConversation), handler)
    assert(onEndConversationCalled)
  })

  it('should fire onTyping', async function () {
    const handler = new ActivityHandler()

    let onTypingCalled = false
    handler.onTyping(async (context, next) => {
      onTypingCalled = true
      await next()
    })

    await processActivity(new Activity(ActivityTypes.Typing), handler)
    assert(onTypingCalled)
  })

  it('should fire onUnrecognizedActivityType', async function () {
    const handler = new ActivityHandler()

    let onUnrecognizedActivityTypeCalled = false
    handler.onUnrecognizedActivityType(async (context, next) => {
      onUnrecognizedActivityTypeCalled = true
      await next()
    })

    await processActivity(new Activity('foo'), handler)
    assert(onUnrecognizedActivityTypeCalled)
  })

  describe('should by default', function () {
    let onMessageCalled = false
    let onMessageUpdateCalled = false
    let onMessageDeleteCalled = false
    let onConversationUpdateCalled = false
    let onMembersAddedCalled = false
    let onMembersRemovedCalled = false
    let onMessageReactionCalled = false
    let onReactionsAddedCalled = false
    let onReactionsRemovedCalled = false

    afterEach(function () {
      onMessageCalled = false
      onMessageUpdateCalled = false
      onMessageDeleteCalled = false
      onConversationUpdateCalled = false
      onMembersAddedCalled = false
      onMembersRemovedCalled = false
      onMessageReactionCalled = false
      onReactionsAddedCalled = false
      onReactionsRemovedCalled = false
    })

    /**
     *
     * @param context
     * @param next
     */
    function assertContextAndNext (context: TurnContext, next: () => Promise<void>) {
      assert(context, 'context not found')
      assert(next, 'next not found')
    }

    /**
     *
     * @param flag
     * @param {...any} args
     */
    function assertFalseFlag (flag: boolean, ...args: string[]) {
      assert(!flag, `${args[0]}Called should not be true before the ${args.join(', ')} handlers are called.`)
    }

    /**
     *
     * @param flag
     * @param {...any} args
     */
    function assertTrueFlag (flag: boolean, ...args: string[]) {
      assert(flag, `${args[0]}Called should be true after the ${args[0]} handlers are called.`)
    }

    it('call "MessageUpdate" then dispatch the its respective subtypes', async function () {
      let dispatchMessageUpdateActivityCalled = false
      class MessageUpdateActivityHandler extends ActivityHandler {
        async dispatchMessageUpdateActivity (context: TurnContext) {
          assert(context, 'context not found')
          assertTrueFlag(onMessageUpdateCalled, 'onMessageUpdate')
          assertFalseFlag(
            dispatchMessageUpdateActivityCalled,
            'dispatchMessageUpdateActivity',
            'onMessageUpdate'
          )
          dispatchMessageUpdateActivityCalled = true
          return await Promise.resolve()
        }
      }

      const bot = new MessageUpdateActivityHandler()

      bot.onMessageUpdate(async (context, next) => {
        assertContextAndNext(context, next)
        assertFalseFlag(onMessageUpdateCalled, 'onMessageUpdate', 'onTurn')
        onMessageUpdateCalled = true
        await next()
      })

      await processActivity(new Activity(ActivityTypes.MessageUpdate), bot)
      assertTrueFlag(onMessageUpdateCalled, 'onMessageUpdate')
      assertTrueFlag(dispatchMessageUpdateActivityCalled, 'dispatchMessageUpdateActivity')
    })

    it('call "MessageDelete" then dispatch the its respective subtypes', async function () {
      let dispatchMessageDeleteActivityCalled = false
      class MessageDeleteActivityHandler extends ActivityHandler {
        async dispatchMessageDeleteActivity (context: TurnContext) {
          assert(context, 'context not found')
          assertTrueFlag(onMessageDeleteCalled, 'onMessageDelete')
          assertFalseFlag(
            dispatchMessageDeleteActivityCalled,
            'dispatchMessageDeleteActivity',
            'onMessageDelete'
          )
          dispatchMessageDeleteActivityCalled = true
          return await Promise.resolve()
        }
      }

      const handler = new MessageDeleteActivityHandler()

      handler.onMessageDelete(async (context, next) => {
        assertContextAndNext(context, next)
        assertFalseFlag(onMessageDeleteCalled, 'onMessageDelete', 'onTurn')
        onMessageDeleteCalled = true
        await next()
      })

      await processActivity(new Activity(ActivityTypes.MessageDelete), handler)
      assertTrueFlag(onMessageDeleteCalled, 'onMessageDelete')
      assertTrueFlag(dispatchMessageDeleteActivityCalled, 'dispatchMessageDeleteActivity')
    })

    it('call "MessageReaction" then dispatch by Activity Type "MessageReaction"', async function () {
      const handler = new ActivityHandler()

      handler.onMessageReaction(async (context, next) => {
        assertContextAndNext(context, next)
        assertFalseFlag(onMessageReactionCalled, 'onMessageReaction')
        onMessageReactionCalled = true
        await next()
      })

      await processActivity(Activity.fromObject({ type: ActivityTypes.MessageReaction, reactionsRemoved: [{ type: 'like' }] }), handler)
      assertTrueFlag(onMessageReactionCalled, 'onMessageReaction')
    })

    it('call "MessageReaction" then dispatch by Activity Type "MessageReaction"-subtype "ReactionsAdded"', async function () {
      const handler = new ActivityHandler()
      handler.onTurn(async (context, next) => {
        assertContextAndNext(context, next)
        assertFalseFlag(onMessageReactionCalled, 'onMessageReaction')
        assertFalseFlag(onReactionsRemovedCalled, 'onReactionsRemoved', 'onMessageReaction')
        await next()
      })

      handler.onMessageReaction(async (context, next) => {
        assertContextAndNext(context, next)
        assertFalseFlag(onMessageReactionCalled, 'onMessageReaction')
        onMessageReactionCalled = true
        assertFalseFlag(onReactionsRemovedCalled, 'onReactionsRemoved', 'onMessageReaction')
        await next()
      })

      handler.onReactionsAdded(async (context, next) => {
        assertContextAndNext(context, next)
        assertTrueFlag(onMessageReactionCalled, 'onMessageReaction')
        assertFalseFlag(onReactionsAddedCalled, 'onReactionsAdded', 'onMessageReaction')
        onReactionsAddedCalled = true
        await next()
      })

      await processActivity(Activity.fromObject({ type: ActivityTypes.MessageReaction, reactionsAdded: [{ type: 'like' }] }), handler)
      assertTrueFlag(onMessageReactionCalled, 'onMessageReaction')
      assertTrueFlag(onReactionsAddedCalled, 'onReactionsAdded', 'onMessageReaction')
    })

    it('call "MessageReaction" then dispatch by Activity Type "MessageReaction"-subtype "ReactionsRemoved"', async function () {
      const handler = new ActivityHandler()
      handler.onTurn(async (context, next) => {
        assertContextAndNext(context, next)
        assertFalseFlag(onMessageReactionCalled, 'onMessageReaction')
        assertFalseFlag(onReactionsRemovedCalled, 'onReactionsRemoved', 'onMessageReaction')
        await next()
      })

      handler.onMessageReaction(async (context, next) => {
        assertContextAndNext(context, next)
        assertFalseFlag(onMessageReactionCalled, 'onMessageReaction')
        onMessageReactionCalled = true
        assertFalseFlag(onReactionsRemovedCalled, 'onReactionsRemoved', 'onMessageReaction')
        await next()
      })

      handler.onReactionsRemoved(async (context, next) => {
        assertContextAndNext(context, next)
        assertTrueFlag(onMessageReactionCalled, 'onMessageReaction')
        assertFalseFlag(onReactionsRemovedCalled, 'onReactionsRemoved', 'onMessageReaction')
        onReactionsRemovedCalled = true
        await next()
      })

      await processActivity(Activity.fromObject({ type: ActivityTypes.MessageReaction, reactionsRemoved: [{ type: 'like' }] }), handler)
      assertTrueFlag(onMessageReactionCalled, 'onMessageReaction')
      assertTrueFlag(onReactionsRemovedCalled, 'onReactionsRemoved')
    })
  })
})
