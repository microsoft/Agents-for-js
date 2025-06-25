import { TurnContext, CloudAdapter, InputFile } from '@microsoft/agents-hosting'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { TestAdapter } from './TestAdapter'
import { AITurnState } from '../../types'

/**
 * Creates, for testing, an invoke activity with the given name, value and data.
 * Compatible with @microsoft/agents-hosting's TestAdapter.
 * @param {string} name - The name of the invoke activity.
 * @param {any} value - The value of the invoke activity.
 * @param {any} channelData - The bot's channel data of the invoke activity.
 * @returns {Activity} - The created invoke activity.
 */
export function createTestInvoke (name: string, value: any, channelData: any = {}): Activity {
  const activity = Activity.fromObject({
    type: ActivityTypes.Invoke,
    name,
    channelData,
    value,
    // Not sure why, but the TestAdapter returns nothing unless this prop is set
    deliveryMode: 'expectReplies'
  })

  return activity
}

/**
 * Creates a conversation update activity for testing.
 * Compatible with @microsoft/agents-hosting's TestAdapter.
 * @param {any} channelData An object containing channel data
 * @returns {Activity} A conversation update activity
 */
export function createTestConversationUpdate (channelData: any = {}): Activity {
  const activity = Activity.fromObject({
    type: ActivityTypes.ConversationUpdate,
    channelData
  })
  return activity
}

/**
 * Returns turn context and state for testing.
 * @remarks Compatible with @microsoft/agents-hosting's TestAdapter and TeamsAdapter. Use _ on import if either value is not needed. For example, `const [context, _] = createTestTurnContextAndState(...)`.
 * @param {TeamsAdapter | TestAdapter} adapter - The adapter to use for the turn context
 * @param {Activity} activity - The activity to use for the turn context
 * @returns {[TurnContext, AITurnState]} - The created turn context and state.
 */
export const createTestTurnContextAndState = async (
  adapter: CloudAdapter | TestAdapter,
  activity: Activity
): Promise<[TurnContext, AITurnState]> => {
  const context = new TurnContext(
    adapter,
    Activity.fromObject({
      channelId: 'msteams',
      recipient: { id: 'bot', name: 'Bot' },
      from: { id: 'user', name: 'User' },
      conversation: {
        id: 'convo',
        isGroup: false,
        conversationType: 'personal',
        name: 'convo'
      },
      ...activity
    })
  )

  const state = new AITurnState()
  await state.load(context)
  state.temp = {
    input: context.activity.text!,
    inputFiles: context.activity.attachments as InputFile[],
    lastOutput: '',
    actionOutputs: {}
  }

  return [context, state]
}
