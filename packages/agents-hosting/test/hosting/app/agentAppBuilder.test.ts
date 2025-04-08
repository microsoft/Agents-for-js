import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { MemoryStorage } from '../../../src'

import { AgentApplicationBuilder } from './../../../src/app'
// import { AdaptiveCardsOptions } from './AdaptiveCards'
// import { AIOptions } from './AI'
// import { TestPlanner } from './internals/testing/TestPlanner'
// import { TaskModulesOptions } from './TaskModules'
// import { TeamsAdapter } from './TeamsAdapter'
// import { TurnState } from './TurnState'

// const nullAuthConfig : AuthConfiguration = {
//   tenantId: '',
//   clientId: '',
//   issuers: [],
// }

describe('ApplicationBuilder', () => {
  // const botAppId = 'testBot'
  // const adapter = new CloudAdapter(nullAuthConfig)
  // const adaptiveCards: AdaptiveCardsOptions = { actionSubmitFilter: 'cardFilter', actionExecuteResponseType: 1 }
  // const ai: AIOptions<TurnState> = { planner: new TestPlanner() }
  const longRunningMessages = true
  // const removeRecipientMention = false
  const startTypingTimer = false
  const storage = new MemoryStorage()
  // const taskModules: TaskModulesOptions = { taskDataFilter: 'taskFilter' }
  const authenticationSettings = {
    enableSSO: true,
    ssoConnectionName: 'testConnectionName'
  }

  it('should create an Application with default options', () => {
    const app = new AgentApplicationBuilder().build()
    assert.notEqual(app.options, undefined)
    assert.equal(app.options.adapter, undefined)
    assert.equal(app.options.storage, undefined)
    // assert.equal(app.options.ai, undefined)
    assert.equal(app.options.authentication, undefined)
    // assert.equal(app.options.adaptiveCards, undefined)
    // assert.equal(app.options.taskModules, undefined)
    // assert.equal(app.options.removeRecipientMention, true)
    assert.equal(app.options.startTypingTimer, true)
    assert.equal(app.options.longRunningMessages, false)
  })

  it('should create an Application with custom options', () => {
    const app = new AgentApplicationBuilder()
      // .setRemoveRecipientMention(removeRecipientMention)
      .withStorage(storage)
      // .withAIOptions(ai)
      // .withLongRunningMessages(adapter, botAppId)
      // .withAdaptiveCardOptions(adaptiveCards)
      .withAuthentication(authenticationSettings)
      // .withTaskModuleOptions(taskModules)
      .setStartTypingTimer(startTypingTimer)
      .build()
    assert.notEqual(app.options, undefined)
    // assert.equal(app.options.adapter, adapter)
    assert.equal(app.options.storage, storage)
    // assert.equal(app.options.ai, ai)
    // assert.equal(app.options.adaptiveCards, adaptiveCards)
    assert.equal(app.options.authentication, authenticationSettings)
    // assert.equal(app.options.taskModules, taskModules)
    // assert.equal(app.options.removeRecipientMention, removeRecipientMention)
    assert.equal(app.options.startTypingTimer, startTypingTimer)
    assert.equal(app.options.longRunningMessages, longRunningMessages)
  })

//   it('should throw an exception if botId is an empty string for longRunningMessages', () => {
//     assert.throws(() => {
//       new AgentApplicationBuilder().withLongRunningMessages(adapter, '').build()
//     })
//   })
})
