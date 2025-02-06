/* eslint-disable @typescript-eslint/no-unused-vars */
import { strict as assert } from 'assert'
import { afterEach, describe, it } from 'node:test'
import { ActivityHandler, TurnContext } from '../../../src'
import { Activity, ActivityTypes } from '@microsoft/agents-activity-schema'
import { BotAdapter } from '../../../src/botAdapter'

// @ts-expect-error
class SimpleAdapter extends BotAdapter {}

describe('ActivityHandler', function () {
  const adapter = new SimpleAdapter()

  async function processActivity (activity: Activity, bot: ActivityHandler) {
    if (!activity) {
      throw new Error('Missing activity')
    }

    if (!bot) {
      throw new Error('Missing bot')
    }

    const context = new TurnContext(adapter, activity)
    await bot.run(context)
  }

  it('should fire onMessage for any message activities', async function () {
    const bot = new ActivityHandler()

    let onMessageCalled = false
    bot.onMessage(async (context, next) => {
      onMessageCalled = true
      await next()
    })

    await processActivity(new Activity(ActivityTypes.Message), bot)
    assert(onMessageCalled)
  })

  it('calling next allows following events to firing', async function () {
    const bot = new ActivityHandler()

    let onFirstMessageCalled = false
    bot.onMessage(async (context, next) => {
      onFirstMessageCalled = true
      await next()
    })

    let onSecondMessageCalled = false
    bot.onMessage(async (context, next) => {
      onSecondMessageCalled = true
      await next()
    })

    await processActivity(new Activity(ActivityTypes.Message), bot)
    assert(onFirstMessageCalled)
    assert(onSecondMessageCalled)
  })

  it('omitting call to next prevents following events from firing', async function () {
    const bot = new ActivityHandler()

    let onFirstMessageCalled = false
    bot.onMessage(async (context, next) => {
      onFirstMessageCalled = true
    })

    let onSecondMessageCalled = false
    bot.onMessage(async (context, next) => {
      onSecondMessageCalled = true
      await next()
    })

    await processActivity(new Activity(ActivityTypes.Message), bot)
    assert(onFirstMessageCalled)
    assert(!onSecondMessageCalled)
  })

  it('binding 2 methods to the same event both fire', async function () {
    const bot = new ActivityHandler()
    let count = 0

    let onMessageCalled = false
    bot.onMessage(async (_context, next) => {
      onMessageCalled = true
      count++
      await next()
    })

    let onMessageCalledAgain = false
    bot.onMessage(async (_context, next) => {
      onMessageCalledAgain = true
      count++
      await next()
    })

    await processActivity(new Activity(ActivityTypes.Message), bot)
    assert(onMessageCalled)
    assert(onMessageCalledAgain)
    assert(count === 2, 'all events did fire')
  })

  it('should fire onMessageUpdate', async function () {
    const bot = new ActivityHandler()

    let onMessageUpdate = false
    bot.onMessageUpdate(async (context, next) => {
      onMessageUpdate = true
      await next()
    })

    await processActivity(new Activity(ActivityTypes.MessageUpdate), bot)
    assert(onMessageUpdate)
  })

  it('should fire onMessageDelete', async function () {
    const bot = new ActivityHandler()

    let onMessageDelete = false
    bot.onMessageDelete(async (context, next) => {
      onMessageDelete = true
      await next()
    })

    await processActivity(new Activity(ActivityTypes.MessageDelete), bot)
    assert(onMessageDelete)
  })

  it('should fire onConversationUpdate', async function () {
    const bot = new ActivityHandler()

    let onConversationUpdateCalled = false
    bot.onConversationUpdate(async (context, next) => {
      onConversationUpdateCalled = true
      await next()
    })

    await processActivity(new Activity(ActivityTypes.ConversationUpdate), bot)
    assert(onConversationUpdateCalled)
  })

  it('should fire onMembersAdded', async function () {
    const bot = new ActivityHandler()

    let onMembersAddedCalled = false
    bot.onMembersAdded(async (context, next) => {
      onMembersAddedCalled = true
      await next()
    })

    await processActivity(Activity.fromObject({ type: ActivityTypes.ConversationUpdate, membersAdded: [{ id: '1' }] }), bot)
    assert(onMembersAddedCalled)
  })

  it('should fire onMembersRemoved', async function () {
    const bot = new ActivityHandler()

    let onMembersRemovedCalled = false
    bot.onMembersRemoved(async (context, next) => {
      onMembersRemovedCalled = true
      await next()
    })

    await processActivity(Activity.fromObject({ type: ActivityTypes.ConversationUpdate, membersRemoved: [{ id: '1' }] }), bot)
    assert(onMembersRemovedCalled)
  })

  it('should fire onMessageReaction', async function () {
    const bot = new ActivityHandler()

    let onMessageReactionCalled = false
    bot.onMessageReaction(async (context, next) => {
      onMessageReactionCalled = true
      await next()
    })

    await processActivity(new Activity(ActivityTypes.MessageReaction), bot)
    assert(onMessageReactionCalled)
  })
  it('should fire onInstallationUpdateAdd', async function () {
    const bot = new ActivityHandler()

    let onInstallationUpdateAddCalled = false
    bot.onInstallationUpdateAdd(async (context, next) => {
      onInstallationUpdateAddCalled = true
      await next()
    })

    await processActivity(Activity.fromObject({ type: ActivityTypes.InstallationUpdate, action: 'add' }), bot)
    assert(onInstallationUpdateAddCalled)
  })

  it('should fire onInstallationUpdateAddUpgrade', async function () {
    const bot = new ActivityHandler()

    let onInstallationUpdateAddCalled = false
    bot.onInstallationUpdateAdd(async (context, next) => {
      onInstallationUpdateAddCalled = true
      await next()
    })

    await processActivity(Activity.fromObject({ type: ActivityTypes.InstallationUpdate, action: 'add-upgrade' }), bot)
    assert(onInstallationUpdateAddCalled)
  })

  it('should fire onInstallationUpdateRemove', async function () {
    const bot = new ActivityHandler()

    let onInstallationUpdateRemoveCalled = false
    bot.onInstallationUpdateRemove(async (context, next) => {
      onInstallationUpdateRemoveCalled = true
      await next()
    })

    await processActivity(Activity.fromObject({ type: ActivityTypes.InstallationUpdate, action: 'remove' }), bot)
    assert(onInstallationUpdateRemoveCalled)
  })

  it('should fire onInstallationUpdateRemoveUpgrade', async function () {
    const bot = new ActivityHandler()

    let onInstallationUpdateRemoveCalled = false
    bot.onInstallationUpdateRemove(async (context, next) => {
      onInstallationUpdateRemoveCalled = true
      await next()
    })

    await processActivity(Activity.fromObject({ type: ActivityTypes.InstallationUpdate, action: 'remove-upgrade' }), bot)
    assert(onInstallationUpdateRemoveCalled)
  })

  it('should fire onEndOfConversation', async function () {
    const bot = new ActivityHandler()

    let onEndConversationCalled = false
    bot.onEndOfConversation(async (context, next) => {
      onEndConversationCalled = true
      await next()
    })

    await processActivity(new Activity(ActivityTypes.EndOfConversation), bot)
    assert(onEndConversationCalled)
  })

  it('should fire onTyping', async function () {
    const bot = new ActivityHandler()

    let onTypingCalled = false
    bot.onTyping(async (context, next) => {
      onTypingCalled = true
      await next()
    })

    await processActivity(new Activity(ActivityTypes.Typing), bot)
    assert(onTypingCalled)
  })

  it('should fire onUnrecognizedActivityType', async function () {
    const bot = new ActivityHandler()

    let onUnrecognizedActivityTypeCalled = false
    bot.onUnrecognizedActivityType(async (context, next) => {
      onUnrecognizedActivityTypeCalled = true
      await next()
    })

    await processActivity(new Activity('foo'), bot)
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

    function assertContextAndNext (context: TurnContext, next: () => Promise<void>) {
      assert(context, 'context not found')
      assert(next, 'next not found')
    }

    function assertFalseFlag (flag: boolean, ...args: string[]) {
      assert(!flag, `${args[0]}Called should not be true before the ${args.join(', ')} handlers are called.`)
    }

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

      const bot = new MessageDeleteActivityHandler()

      bot.onMessageDelete(async (context, next) => {
        assertContextAndNext(context, next)
        assertFalseFlag(onMessageDeleteCalled, 'onMessageDelete', 'onTurn')
        onMessageDeleteCalled = true
        await next()
      })

      await processActivity(new Activity(ActivityTypes.MessageDelete), bot)
      assertTrueFlag(onMessageDeleteCalled, 'onMessageDelete')
      assertTrueFlag(dispatchMessageDeleteActivityCalled, 'dispatchMessageDeleteActivity')
    })

    it('call "MessageReaction" then dispatch by Activity Type "MessageReaction"', async function () {
      const bot = new ActivityHandler()

      bot.onMessageReaction(async (context, next) => {
        assertContextAndNext(context, next)
        assertFalseFlag(onMessageReactionCalled, 'onMessageReaction')
        onMessageReactionCalled = true
        await next()
      })

      await processActivity(Activity.fromObject({ type: ActivityTypes.MessageReaction, reactionsRemoved: [{ type: 'like' }] }), bot)
      assertTrueFlag(onMessageReactionCalled, 'onMessageReaction')
    })

    it('call "MessageReaction" then dispatch by Activity Type "MessageReaction"-subtype "ReactionsAdded"', async function () {
      const bot = new ActivityHandler()
      bot.onTurn(async (context, next) => {
        assertContextAndNext(context, next)
        assertFalseFlag(onMessageReactionCalled, 'onMessageReaction')
        assertFalseFlag(onReactionsRemovedCalled, 'onReactionsRemoved', 'onMessageReaction')
        await next()
      })

      bot.onMessageReaction(async (context, next) => {
        assertContextAndNext(context, next)
        assertFalseFlag(onMessageReactionCalled, 'onMessageReaction')
        onMessageReactionCalled = true
        assertFalseFlag(onReactionsRemovedCalled, 'onReactionsRemoved', 'onMessageReaction')
        await next()
      })

      bot.onReactionsAdded(async (context, next) => {
        assertContextAndNext(context, next)
        assertTrueFlag(onMessageReactionCalled, 'onMessageReaction')
        assertFalseFlag(onReactionsAddedCalled, 'onReactionsAdded', 'onMessageReaction')
        onReactionsAddedCalled = true
        await next()
      })

      await processActivity(Activity.fromObject({ type: ActivityTypes.MessageReaction, reactionsAdded: [{ type: 'like' }] }), bot)
      assertTrueFlag(onMessageReactionCalled, 'onMessageReaction')
      assertTrueFlag(onReactionsAddedCalled, 'onReactionsAdded', 'onMessageReaction')
    })

    it('call "MessageReaction" then dispatch by Activity Type "MessageReaction"-subtype "ReactionsRemoved"', async function () {
      const bot = new ActivityHandler()
      bot.onTurn(async (context, next) => {
        assertContextAndNext(context, next)
        assertFalseFlag(onMessageReactionCalled, 'onMessageReaction')
        assertFalseFlag(onReactionsRemovedCalled, 'onReactionsRemoved', 'onMessageReaction')
        await next()
      })

      bot.onMessageReaction(async (context, next) => {
        assertContextAndNext(context, next)
        assertFalseFlag(onMessageReactionCalled, 'onMessageReaction')
        onMessageReactionCalled = true
        assertFalseFlag(onReactionsRemovedCalled, 'onReactionsRemoved', 'onMessageReaction')
        await next()
      })

      bot.onReactionsRemoved(async (context, next) => {
        assertContextAndNext(context, next)
        assertTrueFlag(onMessageReactionCalled, 'onMessageReaction')
        assertFalseFlag(onReactionsRemovedCalled, 'onReactionsRemoved', 'onMessageReaction')
        onReactionsRemovedCalled = true
        await next()
      })

      await processActivity(Activity.fromObject({ type: ActivityTypes.MessageReaction, reactionsRemoved: [{ type: 'like' }] }), bot)
      assertTrueFlag(onMessageReactionCalled, 'onMessageReaction')
      assertTrueFlag(onReactionsRemovedCalled, 'onReactionsRemoved')
    })
  })
})
