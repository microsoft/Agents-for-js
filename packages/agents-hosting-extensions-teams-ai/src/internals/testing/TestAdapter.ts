/**
 * @module agents-hosting-extensions-teams-ai
 */
/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from 'assert'
import { v4 as uuidv4 } from 'uuid'
import {
  Activity,
  ActivityTypes,
  ConversationReference,
  ChannelAccount,
  Channels,
  RoleTypes
} from '@microsoft/agents-activity'
import { BaseAdapter, TurnContext, ResourceResponse, AttachmentData, AttachmentInfo } from '@microsoft/agents-hosting'

/**
 * Signature for a function that can be used to inspect individual activities returned by a agent
 * that's being tested using the `TestAdapter`.
 *
 * ```TypeScript
 * type TestActivityInspector = (activity: Activity, description: string) => void;
 * ```
 * @param TestActivityInspector.activity The activity being inspected.
 * @param TestActivityInspector.description Text to log in the event of an error.
 */
export type TestActivityInspector = (activity: Activity, description?: string) => void

/**
 * Test adapter used for unit tests. This adapter can be used to simulate sending messages from the
 * user to the agent.
 */
export class TestAdapter extends BaseAdapter {
  private readonly _logic: (context: TurnContext) => Promise<void>
  private readonly _sendTraceActivity
  private _nextId = 0

  /**
     * Creates a new TestAdapter instance.
     * @param {((context: TurnContext) => Promise<void>)} [logic] Optional. The bots logic that's under test.
     * @param {boolean} [sendTraceActivity] Optional. If true, the adapter will send trace activities.
     */
  constructor (logic?: (context: TurnContext) => Promise<void>, sendTraceActivity = false) {
    super()
    this._logic = logic || (() => Promise.resolve())
    this._sendTraceActivity = sendTraceActivity
    this.conversation = TestAdapter.createConversation('Convo1')
  }

  /**
     * @private
     * INTERNAL: used to drive the promise chain forward when running tests.
     * @returns {Promise<void>} A promise representing the async operation.
     */
  get activityBuffer (): Activity[] {
    return this.activeQueue
  }

  /**
     * Gets or sets the locale for the conversation.
     */
  locale = 'en-us'

  /**
     * Gets the queue of responses from the agent.
     */
  readonly activeQueue: Activity[] = []

  /**
     * Gets or sets a reference to the current conversation.
     */
  conversation: ConversationReference

  /**
     * Create a ConversationReference.
     * @param {string} name name of the conversation (also id).
     * @param {string} user name of the user (also id) default: User1.
     * @param {string} agent name of the agent (also id) default: Agent.
     * @returns {ConversationReference} The [ConversationReference](xref:botframework-schema.ConversationReference).
     */
  static createConversation (name: string, user = 'User1', agent = 'Agent'): ConversationReference {
    const conversationReference: ConversationReference = {
      channelId: Channels.Test,
      serviceUrl: 'https://test.com',
      conversation: { isGroup: false, id: name, name },
      user: { id: user.toLowerCase(), name: user } as ChannelAccount,
      agent: { id: agent.toLowerCase(), name: agent } as ChannelAccount,
      locale: 'en-us'
    }
    return conversationReference
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

  /**
     * Dequeues and returns the next agent response from the activeQueue.
     * @returns The next activity in the queue; or undefined, if the queue is empty.
     */
  getNextReply (): Activity | undefined {
    if (this.activeQueue.length > 0) {
      return this.activeQueue.shift()
    }
    return undefined
  }

  /**
     * Creates a message activity from text and the current conversational context.
     * @param text The message text.
     * @returns An appropriate message activity.
     */
  makeActivity (text?: string): Activity {
    const activity = Activity.fromObject({
      type: ActivityTypes.Message,
      locale: this.locale,
      from: this.conversation.user,
      recipient: this.conversation.agent,
      conversation: this.conversation.conversation,
      serviceUrl: this.conversation.serviceUrl,
      id: (this._nextId++).toString(),
      text
    })
    return activity
  }

  /**
     * Processes a message activity from a user.
     * @param userSays The text of the user's message.
     * @param callback The agent logic to invoke.
     * @returns {Promise<any>} A promise representing the async operation.
     */
  sendTextToBot (userSays: string, callback: (context: TurnContext) => Promise<any>): Promise<any> {
    return this.processActivity(this.makeActivity(userSays), callback)
  }

  /**
     * Receives an activity and runs it through the middleware pipeline.
     * @param activity The activity to process.
     * @param callback The agent logic to invoke.
     * @returns {Promise<any>} A promise representing the async operation.
     */
  async processActivity (
    activity: string | Activity,
    callback?: (context: TurnContext) => Promise<any>
  ): Promise<any> {
    const request: Activity =
            typeof activity === 'string'
              ? Activity.fromObject({ type: ActivityTypes.Message, text: activity })
              : activity
    request.type = request.type || ActivityTypes.Message
    request.channelId = request.channelId || this.conversation.channelId

    if (!request.from || request.from.id === 'unknown' || request.from.role === RoleTypes.Agent) {
      request.from = this.conversation.user
    }

    request.recipient = request.recipient || (this.conversation.agent as ChannelAccount)
    request.conversation = request.conversation || this.conversation.conversation
    request.serviceUrl = request.serviceUrl || this.conversation.serviceUrl
    request.id = request.id || (this._nextId++).toString()
    request.timestamp = request.timestamp || new Date()

    const context = this.createContext(request)
    if (callback) {
      return await this.runMiddleware(context, callback)
    } else if (this._logic) {
      return await this.runMiddleware(context, this._logic)
    }
  }

  /**
     * @private
     * Sends activities to the conversation.
     * @param {TurnContext} context Context object for the current turn of conversation with the user.
     * @param {Activity[]} activities Set of activities sent by logic under test.
     * @returns promise representing async operation
     */
  async sendActivities (context: TurnContext, activities: Activity[]): Promise<ResourceResponse[]> {
    if (!context) {
      throw new Error('TurnContext cannot be null.')
    }

    if (!activities) {
      throw new Error('Activities cannot be null.')
    }

    if (activities.length === 0) {
      throw new Error('Expecting one or more activities, but the array was empty.')
    }

    const responses: ResourceResponse[] = []

    for (let i = 0; i < activities.length; i++) {
      const activity = activities[i]

      if (!activity.id) {
        activity.id = uuidv4()
      }

      if (!activity.timestamp) {
        activity.timestamp = new Date()
      }

      if (activity.type === 'delay') {
        const delayMs = parseInt(activity.value as string)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      } else if (activity.type === ActivityTypes.Trace) {
        if (this._sendTraceActivity) {
          this.activeQueue.push(activity)
        }
      } else {
        this.activeQueue.push(activity)
      }

      responses.push({ id: activity.id } as ResourceResponse)
    }

    return responses
  }

  /**
     * @private
     * Replaces an existing activity in the activeQueue.
     * @param context Context object for the current turn of conversation with the user.
     * @param activity Activity being updated.
     * @returns promise representing async operation
     */
  updateActivity (context: TurnContext, activity: Activity): Promise<ResourceResponse | void> {
    if (activity.id) {
      const idx = this.activeQueue.findIndex((a) => a.id === activity.id)
      if (idx !== -1) {
        this.activeQueue.splice(idx, 1, activity)
      }
      return Promise.resolve({ id: activity.id })
    }

    return Promise.resolve()
  }

  /**
     * @private
     * Deletes an existing activity in the activeQueue.
     * @param context Context object for the current turn of conversation with the user.
     * @param reference `ConversationReference` for activity being deleted.
     * @returns promise representing async operation
     */
  deleteActivity (context: TurnContext, reference: Partial<ConversationReference>): Promise<void> {
    if (reference.activityId) {
      const idx = this.activeQueue.findIndex((a) => a.id === reference.activityId)
      if (idx !== -1) {
        this.activeQueue.splice(idx, 1)
      }
    }

    return Promise.resolve()
  }

  /**
     * @private
     * INTERNAL: called by a `TestFlow` instance to simulate a user sending a message to the agent.
     * This will cause the adapters middleware pipe to be run and it's logic to be called.
     * @param activity Text or activity from user. The current conversation reference [template](#template) will be merged the passed in activity to properly address the activity. Fields specified in the activity override fields in the template.
     * @returns {Promise<void>} A promise representing the async operation.
     */
  receiveActivity (activity: string | Activity): Promise<void> {
    return this.processActivity(activity)
  }

  /**
     * The `TestAdapter` doesn't implement `continueConversation()` and will return an error if it's
     * called.
     * @param _reference A reference to the conversation to continue.
     * @param _logic The asynchronous method to call after the adapter middleware runs.
     * @returns {Promise<void>} A promise representing the async operation.
     */
  continueConversation (
    _reference: Partial<ConversationReference>,
    _logic: (revocableContext: TurnContext) => Promise<void>
  ): Promise<void> {
    return Promise.reject(new Error('not implemented'))
  }

  /**
     * Creates a turn context.
     * @param request An incoming request body.
     * @returns The created [TurnContext](xref:botbuilder-core.TurnContext).
     * @remarks
     * Override this in a derived class to modify how the adapter creates a turn context.
     */
  protected createContext (request: Activity): TurnContext {
    return new TurnContext(this, request)
  }

  /**
     * Sends something to the agent. This returns a new `TestFlow` instance which can be used to add
     * additional steps for inspecting the bots reply and then sending additional activities.
     * @remarks
     * This example shows how to send a message and then verify that the response was as expected:
     *
     * ```JavaScript
     * adapter.send('hi')
     *        .assertReply('Hello World')
     *        .then(() => done());
     * ```
     * @param userSays Text or activity simulating user input.
     * @returns a new [TestFlow](xref:botbuilder-core.TestFlow) instance which can be used to add additional steps
     * for inspecting the bots reply and then sending additional activities.
     */
  send (userSays: string | Activity): TestFlow {
    return new TestFlow(this.processActivity(userSays), this)
  }

  /**
     * Send something to the agent and expects the agent to return with a given reply.
     * @remarks
     * This is simply a wrapper around calls to `send()` and `assertReply()`. This is such a
     * common pattern that a helper is provided.
     *
     * ```JavaScript
     * adapter.test('hi', 'Hello World')
     *        .then(() => done());
     * ```
     * @param userSays Text or activity simulating user input.
     * @param expected Expected text or activity of the reply sent by the agent.
     * @param description (Optional) Description of the test case. If not provided one will be generated.
     * @param _timeout (Optional) number of milliseconds to wait for a response from agent. Defaults to a value of `3000`.
     * @returns A new [TestFlow](xref:botbuilder-core.TestFlow) object that appends this exchange to the modeled exchange.
     */
  test (
    userSays: string | Activity,
    expected: string | Activity | ((activity: Activity, description?: string) => void),
    description?: string,
    _timeout?: number
  ): TestFlow {
    return this.send(userSays).assertReply(expected, description)
  }

  /**
     * Test a list of activities.
     * @remarks
     * Each activity with the "agent" role will be processed with assertReply() and every other
     * activity will be processed as a user message with send().
     * @param activities Array of activities.
     * @param description (Optional) Description of the test case. If not provided one will be generated.
     * @param timeout (Optional) number of milliseconds to wait for a response from agent. Defaults to a value of `3000`.
     * @returns A new [TestFlow](xref:botbuilder-core.TestFlow) object that appends this exchange to the modeled exchange.
     */
  testActivities (activities: Activity[], description?: string, timeout?: number): TestFlow {
    if (!activities) {
      throw new Error('Missing array of activities')
    }

    const activityInspector: any =
            (expected: Activity): TestActivityInspector =>
              (actual: Activity, description2?: string): any =>
                validateTranscriptActivity(actual, expected, description2 || 'No description provided')

    // Chain all activities in a TestFlow, check if its a user message (send) or a agent reply (assert)
    return activities.reduce(
      (flow: TestFlow, activity: Activity) => {
        // tslint:disable-next-line:prefer-template
        const assertDescription = `reply ${description ? ' from ' + description : ''}`

        return this.isReply(activity)
          ? flow.assertReply(activityInspector(activity, description), assertDescription, timeout)
          : flow.send(activity)
      },
      new TestFlow(Promise.resolve(), this)
    )
  }

  /**
     * Indicates if the activity is a reply from the agent (role == 'agent')
     * @remarks
     * Checks to see if the from property and if from.role exists on the Activity before
     * checking to see who the activity is from. Otherwise returns false by default.
     * @param activity Activity to check.
     * @returns True if the activity is a reply from the agent, otherwise, false.
     */
  private isReply (activity: Activity): boolean {
    if (activity.from && activity.from.role) {
      return !!activity.from.role && activity.from.role.toLocaleLowerCase() === 'agent'
    } else {
      return false
    }
  }
}

/**
 * Support class for `TestAdapter` that allows for the simple construction of a sequence of tests.
 * @remarks
 * Calling `adapter.send()` or `adapter.test()` will create a new test flow which you can chain
 * together additional tests using a fluent syntax.
 */
export class TestFlow {
  /**
     * @private
     * INTERNAL: creates a new TestFlow instance.
     * @param previous Promise chain for the current test sequence.
     * @param adapter Adapter under tested.
     * @param callback The agent turn processing logic to test.
     */
  constructor (
    public previous: Promise<void>,
    private adapter: TestAdapter,
    private callback?: (turnContext: TurnContext) => Promise<unknown>
  ) {}

  /**
     * Send something to the agent and expects the agent to return with a given reply. This is simply a
     * wrapper around calls to `send()` and `assertReply()`. This is such a common pattern that a
     * helper is provided.
     * @param userSays Text or activity simulating user input.
     * @param expected Expected text or activity of the reply sent by the agent.
     * @param description (Optional) Description of the test case. If not provided one will be generated.
     * @param timeout (Optional) number of milliseconds to wait for a response from agent. Defaults to a value of `3000`.
     * @returns A new [TestFlow](xref:botbuilder-core.TestFlow) object that appends this exchange to the modeled exchange.
     */
  test (
    userSays: string | Activity,
    expected: string | Activity | ((activity: Activity, description?: string) => void),
    description?: string,
    timeout?: number
  ): TestFlow {
    return this.send(userSays).assertReply(expected, description || `test("${userSays}", "${expected}")`, timeout)
  }

  /**
     * Sends something to the agent.
     * @param userSays Text or activity simulating user input.
     * @returns A new [TestFlow](xref:botbuilder-core.TestFlow) object that appends this exchange to the modeled exchange.
     */
  send (userSays: string | Activity): TestFlow {
    return new TestFlow(
      this.previous.then(() => this.adapter.processActivity(userSays, this.callback)),
      this.adapter,
      this.callback
    )
  }

  /**
     * Generates an assertion if the bots response doesn't match the expected text/activity.
     * @param expected Expected text or activity from the agent. Can be a callback to inspect the response using custom logic.
     * @param description (Optional) Description of the test case. If not provided one will be generated.
     * @param timeout (Optional) number of milliseconds to wait for a response from agent. Defaults to a value of `3000`.
     * @returns A new [TestFlow](xref:botbuilder-core.TestFlow) object that appends this exchange to the modeled exchange.
     */
  assertReply (expected: string | Activity | TestActivityInspector, description?: string, timeout?: number): TestFlow {
    function defaultInspector (reply: Activity, description2?: string): void {
      if (typeof expected === 'object') {
        validateActivity(reply, expected)
      } else {
        assert.equal(reply.type, ActivityTypes.Message, `${description2} type === '${reply.type}'. `)
        assert.equal(reply.text, expected, `${description2} text === "${reply.text}"`)
      }
    }

    if (!description) {
      description = ''
    }
    const inspector: TestActivityInspector = typeof expected === 'function' ? expected : defaultInspector

    return new TestFlow(
      this.previous.then(() => {
        // tslint:disable-next-line:promise-must-complete
        return new Promise<void>((resolve: any, reject: any): void => {
          if (!timeout) {
            timeout = 3000
          }
          const start: number = new Date().getTime()
          const adapter: TestAdapter = this.adapter

          /**
                     *
                     */
          function waitForActivity (): void {
            const current: number = new Date().getTime()
            if (current - start > <number>timeout) {
              // Operation timed out
              let expecting: string
              switch (typeof expected) {
                case 'object':
                  expecting = `"${(expected as Activity).text}`
                  break
                case 'function':
                  expecting = expected.toString()
                  break
                case 'string':
                default:
                  expecting = `"${expected.toString()}"`
                  break
              }
              reject(
                new Error(
                                    `TestAdapter.assertReply(${expecting}): ${description} Timed out after ${
                                        current - start
                                    }ms.`
                )
              )
            } else if (adapter.activeQueue.length > 0) {
              // Activity received
              const reply: Activity = adapter.activeQueue.shift() as Activity
              try {
                inspector(reply, description as string)
              } catch (err) {
                reject(err)
              }
              resolve()
            } else {
              setTimeout(waitForActivity, 5)
            }
          }
          waitForActivity()
        })
      }),
      this.adapter,
      this.callback
    )
  }

  /**
     * Generates an assertion that the turn processing logic did not generate a reply from the agent, as expected.
     * @param description (Optional) Description of the test case. If not provided one will be generated.
     * @param timeout (Optional) number of milliseconds to wait for a response from agent. Defaults to a value of `3000`.
     * @returns A new [TestFlow](xref:botbuilder-core.TestFlow) object that appends this exchange to the modeled exchange.
     */
  assertNoReply (description?: string, timeout?: number): TestFlow {
    return new TestFlow(
      this.previous.then(() => {
        // tslint:disable-next-line:promise-must-complete
        return new Promise<void>((resolve: any): void => {
          if (!timeout) {
            timeout = 3000
          }
          const start: number = new Date().getTime()
          const adapter: TestAdapter = this.adapter

          /**
                     *
                     */
          function waitForActivity (): void {
            const current: number = new Date().getTime()
            if (current - start > <number>timeout) {
              // Operation timed out and received no reply
              resolve()
            } else if (adapter.activeQueue.length > 0) {
              // Activity received
              const reply: Activity = adapter.activeQueue.shift() as Activity
              assert.strictEqual(
                reply,
                undefined,
                                `${JSON.stringify(reply)} is responded when waiting for no reply: '${description}'`
              )
              resolve()
            } else {
              setTimeout(waitForActivity, 5)
            }
          }
          waitForActivity()
        })
      }),
      this.adapter,
      this.callback
    )
  }

  /**
     * Generates an assertion if the bots response is not one of the candidate strings.
     * @param candidates List of candidate responses.
     * @param description (Optional) Description of the test case. If not provided one will be generated.
     * @param timeout (Optional) number of milliseconds to wait for a response from agent. Defaults to a value of `3000`.
     * @returns A new [TestFlow](xref:botbuilder-core.TestFlow) object that appends this exchange to the modeled exchange.
     */
  assertReplyOneOf (candidates: string[], description?: string, timeout?: number): TestFlow {
    return this.assertReply(
      (activity: Activity, description2?: string) => {
        for (const candidate of candidates) {
          if (activity.text === candidate) {
            return
          }
        }
        assert.fail(
                    `TestAdapter.assertReplyOneOf(): ${description2 || ''} FAILED, Expected one of :${JSON.stringify(
                        candidates
                    )}`
        )
      },
      description,
      timeout
    )
  }

  /**
     * Inserts a delay before continuing.
     * @param ms ms to wait.
     * @returns A new [TestFlow](xref:botbuilder-core.TestFlow) object that appends this exchange to the modeled exchange.
     */
  delay (ms: number): TestFlow {
    return new TestFlow(
      this.previous.then(() => {
        return new Promise<void>((resolve: any, _reject: any): void => {
          setTimeout(resolve, ms)
        })
      }),
      this.adapter,
      this.callback
    )
  }

  /**
     * Adds a `then()` step to the tests promise chain.
     * @param onFulfilled Code to run if the test is currently passing.
     * @param onRejected Code to run if the test has thrown an error.
     * @returns A new [TestFlow](xref:botbuilder-core.TestFlow) object that appends this exchange to the modeled exchange.
     */
  then (onFulfilled?: () => void, onRejected?: (err: any) => void): TestFlow {
    return new TestFlow(this.previous.then(onFulfilled, onRejected), this.adapter, this.callback)
  }

  /**
     * Adds a finally clause. Note that you can't keep chaining afterwards.
     * @param onFinally Code to run after the test chain.
     * @returns {Promise<void>} A promise representing the async operation.
     */
  finally (onFinally: () => void): Promise<void> {
    return Promise.resolve(this.previous.finally(onFinally))
  }

  /**
     * Adds a `catch()` clause to the tests promise chain.
     * @param onRejected Code to run if the test has thrown an error.
     * @returns A new [TestFlow](xref:botbuilder-core.TestFlow) object that appends this exchange to the modeled exchange.
     */
  catch (onRejected?: (reason: any) => void): TestFlow {
    return new TestFlow(this.previous.catch(onRejected), this.adapter, this.callback)
  }

  /**
     * Start the test sequence, returning a promise to await.
     * @returns {Promise<void>} A promise representing the async operation.
     */
  startTest (): Promise<void> {
    return this.previous
  }
}

/**
 * @private
 * @param activity an activity object to validate
 * @param expected expected object to validate against
 */
function validateActivity (activity: Activity, expected: Activity): void {
  // tslint:disable-next-line:forin
  Object.keys(expected).forEach((prop: any) => {
    assert.equal((<any>activity)[prop], (<any>expected)[prop])
  })
}

/**
 * @private
 * Does a shallow comparison of:
 * - type
 * - text
 * - speak
 * - suggestedActions
 * @param activity The activity object to validate.
 * @param expected The expected object to validate against.
 * @param description A description of the validation being performed.
 */
function validateTranscriptActivity (activity: Activity, expected: Activity, description: string): void {
  assert.equal(activity.type, expected.type, `failed "type" assert on ${description}`)
  assert.equal(activity.text, expected.text, `failed "text" assert on ${description}`)
  assert.equal(activity.speak, expected.speak, `failed "speak" assert on ${description}`)
  assert.deepEqual(
    activity.suggestedActions,
    expected.suggestedActions,
        `failed "suggestedActions" assert on ${description}`
  )
}
