/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
  ActionTypes,
  Activity,
  ActivityTypes,
  CardFactory,
  Channels,
  InputHints,
  MessageFactory,
  OAuthCard,
  StatusCodes,
  TokenExchangeInvokeRequest,
  TurnContext
} from '@microsoft/agents-hosting'
import * as UserTokenAccess from './userTokenAccess'
import { Dialog } from '../dialog'
import { DialogContext } from '../dialogContext'
import { PromptOptions, PromptRecognizerResult, PromptValidator } from './prompt'
import { DialogTurnResult } from '../dialogTurnResult'

/**
 * Response body returned for a token exchange invoke activity.
 */
class TokenExchangeInvokeResponse {
  id: string
  connectionName: string
  failureDetail: string

  constructor (id: string, connectionName: string, failureDetail: string) {
    this.id = id
    this.connectionName = connectionName
    this.failureDetail = failureDetail
  }
}

/**
 * Settings used to configure an `OAuthPrompt` instance.
 */
export interface OAuthPromptSettings {
  connectionName: string;
  title: string;
  text?: string;
  timeout?: number;
  endOnInvalidMessage?: boolean;
  showSignInLink?: boolean;
}

/**
 * Creates a new prompt that asks the user to sign in using the Bot Frameworks Single Sign On (SSO)
 * service.
 *
 * @remarks
 * The prompt will attempt to retrieve the users current token and if the user isn't signed in, it
 * will send them an `OAuthCard` containing a button they can press to signin. Depending on the
 * channel, the user will be sent through one of two possible signin flows:
 *
 * - The automatic signin flow where once the user signs in and the SSO service will forward the bot
 * the users access token using either an `event` or `invoke` activity.
 * - The "magic code" flow where where once the user signs in they will be prompted by the SSO
 * service to send the bot a six digit code confirming their identity. This code will be sent as a
 * standard `message` activity.
 *
 * Both flows are automatically supported by the `OAuthPrompt` and the only thing you need to be
 * careful of is that you don't block the `event` and `invoke` activities that the prompt might
 * be waiting on.
 *
 * > [!NOTE]
 * > You should avoid persisting the access token with your agents other state. The Bot Frameworks
 * > SSO service will securely store the token on your behalf. If you store it in your agents state
 * > it could expire or be revoked in between turns.
 * >
 * > When calling the prompt from within a waterfall step you should use the token within the step
 * > following the prompt and then let the token go out of scope at the end of your function.
 *
 * #### Prompt Usage
 *
 * When used with your agents `DialogSet` you can simply add a new instance of the prompt as a named
 * dialog using `DialogSet.add()`. You can then start the prompt from a waterfall step using either
 * `DialogContext.beginDialog()` or `DialogContext.prompt()`. The user will be prompted to signin as
 * needed and their access token will be passed as an argument to the callers next waterfall step:
 *
 */
export class OAuthPrompt extends Dialog {
  private readonly PersistedCaller: string = 'botbuilder-dialogs.caller'
  private static readonly verifyStateOperationName: string = 'signin/verifyState'
  private static readonly tokenExchangeOperationName: string = 'signin/tokenExchange'
  private static readonly tokenResponseEventName: string = 'tokens/response'
  private static readonly sharePointTokenExchange: string = 'cardExtension/token'
  /**
     * Creates a new OAuthPrompt instance.
     *
     * @param dialogId Unique ID of the dialog within its parent `DialogSet` or `ComponentDialog`.
     * @param settings Settings used to configure the prompt.
     * @param validator (Optional) validator that will be called each time the user responds to the prompt.
     */
  constructor (
    dialogId: string,
    private settings: OAuthPromptSettings,
    private validator?: PromptValidator<any>
  ) {
    super(dialogId)
  }

  /**
     * Called when a prompt dialog is pushed onto the dialog stack and is being activated.
     *
     * @param dialogContext The [DialogContext](xref:botbuilder-dialogs.DialogContext) for the current
     * turn of the conversation.
     * @param options Optional. [PromptOptions](xref:botbuilder-dialogs.PromptOptions),
     * additional information to pass to the prompt being started.
     * @returns A `Promise` representing the asynchronous operation.
     * @remarks
     * If the task is successful, the result indicates whether the prompt is still
     * active after the turn has been processed by the prompt.
     */
  async beginDialog (dialogContext: DialogContext, options?: PromptOptions): Promise<DialogTurnResult> {
    // Ensure prompts have input hint set
    const o: Partial<PromptOptions> = { ...options }
    if (o.prompt && typeof o.prompt === 'object' && typeof o.prompt.inputHint !== 'string') {
      o.prompt.inputHint = InputHints.AcceptingInput
    }
    if (o.retryPrompt && typeof o.retryPrompt === 'object' && typeof o.retryPrompt.inputHint !== 'string') {
      o.retryPrompt.inputHint = InputHints.AcceptingInput
    }

    // Initialize prompt state
    const timeout = typeof this.settings.timeout === 'number' ? this.settings.timeout : 900000
    const state = dialogContext.activeDialog.state as OAuthPromptState
    state.state = {}
    state.options = o
    state.expires = new Date().getTime() + timeout

    // Attempt to get the users token
    const output = await UserTokenAccess.getUserToken(dialogContext.context, this.settings, undefined)
    if (output) {
      // Return token
      return await dialogContext.endDialog(output)
    }

    // Prompt user to login
    await OAuthPrompt.sendOAuthCard(this.settings, dialogContext.context, state.options.prompt)
    return Dialog.EndOfTurn
  }

  /**
     * Called when a prompt dialog is the active dialog and the user replied with a new activity.
     *
     * @param dc The [DialogContext](xref:botbuilder-dialogs.DialogContext) for the current turn
     * of the conversation.
     * @returns A `Promise` representing the asynchronous operation.
     * @remarks
     * If the task is successful, the result indicates whether the dialog is still
     * active after the turn has been processed by the dialog.
     * The prompt generally continues to receive the user's replies until it accepts the
     * user's reply as valid input for the prompt.
     */
  async continueDialog (dc: DialogContext): Promise<DialogTurnResult> {
    // Check for timeout
    const state: OAuthPromptState = dc.activeDialog.state as OAuthPromptState
    const isMessage: boolean = dc.context.activity.type === ActivityTypes.Message
    const isTimeoutActivityType: boolean =
            isMessage ||
            OAuthPrompt.isTokenResponseEvent(dc.context) ||
            OAuthPrompt.isTeamsVerificationInvoke(dc.context) ||
            OAuthPrompt.isTokenExchangeRequestInvoke(dc.context)

    // If the incoming Activity is a message, or an Activity Type normally handled by OAuthPrompt,
    // check to see if this OAuthPrompt Expiration has elapsed, and end the dialog if so.
    const hasTimedOut: boolean = isTimeoutActivityType && new Date().getTime() > state.expires
    if (hasTimedOut) {
      return await dc.endDialog(undefined)
    } else {
      // Recognize token
      const recognized: PromptRecognizerResult<any> = await this.recognizeToken(dc)

      if (state.state['attemptCount'] === undefined) {
        state.state['attemptCount'] = 0
      }

      // Validate the return value
      let isValid = false
      if (this.validator) {
        isValid = await this.validator({
          context: dc.context,
          recognized,
          state: state.state,
          options: state.options,
          attemptCount: ++state.state['attemptCount'],
        })
      } else if (recognized.succeeded) {
        isValid = true
      }

      // Return recognized value or re-prompt
      if (isValid) {
        return await dc.endDialog(recognized.value)
      }

      if (isMessage && this.settings.endOnInvalidMessage) {
        return await dc.endDialog(undefined)
      }

      // Send retry prompt
      if (!dc.context.responded && isMessage && state.options.retryPrompt) {
        await dc.context.sendActivity(state.options.retryPrompt)
      }

      return Dialog.EndOfTurn
    }
  }

  /**
     * Attempts to retrieve the stored token for the current user.
     *
     * @param context Context reference the user that's being looked up.
     * @param code (Optional) login code received from the user.
     * @returns The token response.
     */
  async getUserToken (context: TurnContext, code?: string): Promise<any | undefined> {
    return UserTokenAccess.getUserToken(context, this.settings, code)
  }

  /**
     * Signs the user out of the service.
     *
     * @remarks
     * This example shows creating an instance of the prompt and then signing out the user.
     *
     * ```JavaScript
     * const prompt = new OAuthPrompt({
     *    connectionName: 'GitConnection',
     *    title: 'Login To GitHub'
     * });
     * await prompt.signOutUser(context);
     * ```
     * @param context Context referencing the user that's being signed out.
     * @returns A promise representing the asynchronous operation.
     */
  async signOutUser (context: TurnContext): Promise<void> {
    return UserTokenAccess.signOutUser(context, this.settings)
  }

  /**
     * Sends an OAuth card.
     *
     * @param {OAuthPromptSettings} settings OAuth settings.
     * @param {TurnContext} turnContext Turn context.
     * @param {string | Activity} prompt Message activity.
     */
  static async sendOAuthCard (
    settings: OAuthPromptSettings,
    turnContext: TurnContext,
    prompt?: string | Activity
  ): Promise<void> {
    // Initialize outgoing message
    const msg: Activity =
            typeof prompt === 'object'
              ? prompt
              : MessageFactory.text(prompt, undefined, InputHints.AcceptingInput)

    if (!Array.isArray(msg.attachments)) {
      msg.attachments = []
    }

    // Append appropriate card if missing
    if (!msg.attachments.some((a) => a.contentType === CardFactory.contentTypes.oauthCard)) {
      const cardActionType = ActionTypes.Signin
      const signInResource = await UserTokenAccess.getSignInResource(turnContext, settings)

      // Append oauth card
      const card = CardFactory.oauthCard(settings.connectionName, settings.title, settings.text, signInResource);

      // Set the appropriate ActionType for the button.
      (card.content as OAuthCard).buttons[0].type = cardActionType
      msg.attachments.push(card)
    }

    // Add the login timeout specified in OAuthPromptSettings to TurnState so it can be referenced if polling is needed
    if (!turnContext.turnState.get('loginTimeout') && settings.timeout) {
      turnContext.turnState.set('loginTimeout', settings.timeout)
    }

    // Set input hint
    if (!msg.inputHint) {
      msg.inputHint = InputHints.AcceptingInput
    }

    // Send prompt
    await turnContext.sendActivity(msg)
  }

  /**
     * Shared implementation of the RecognizeTokenAsync function. This is intended for internal use, to consolidate
     * the implementation of the OAuthPrompt and OAuthInput. Application logic should use those dialog classes.
     *
     * @param dialogContext The [DialogContext](xref:botbuilder-dialogs.DialogContext) for the current turn of the conversation.
     * @returns A Promise that resolves to the result
     */
  async recognizeToken (dialogContext: DialogContext): Promise<PromptRecognizerResult<any>> {
    const context = dialogContext.context
    let token: any

    if (OAuthPrompt.isTokenResponseEvent(context)) {
      token = context.activity.value

      // Fix-up the DialogContext's state context if this was received from a skill host caller.
      const state: CallerInfo = dialogContext.activeDialog.state[this.PersistedCaller]
      if (state) {
        // Set the ServiceUrl to the skill host's Url
        context.activity.serviceUrl = state.callerServiceUrl

        const connectorClient = await UserTokenAccess.createConnectorClient(
          context,
          context.activity.serviceUrl,
          state.scope
        )

        context.turnState.set(context.adapter.ConnectorClientKey, connectorClient)
      }
    } else if (OAuthPrompt.isTeamsVerificationInvoke(context)) {
      const value = context.activity.value as { state: string }
      const magicCode = value.state

      try {
        token = await UserTokenAccess.getUserToken(context, this.settings, magicCode)

        if (token) {
          await context.sendActivity(Activity.fromObject({ type: 'invokeResponse', value: { status: StatusCodes.OK } }))
        } else {
          await context.sendActivity(Activity.fromObject({ type: 'invokeResponse', value: { status: 404 } }))
        }
      } catch (_err) {
        await context.sendActivity(Activity.fromObject({ type: 'invokeResponse', value: { status: 500 } }))
      }
    } else if (OAuthPrompt.isTokenExchangeRequestInvoke(context)) {
      // Received activity is not a token exchange request
      if (!(context.activity.value && OAuthPrompt.isTokenExchangeRequest(context.activity.value))) {
        await context.sendActivity(
          this.getTokenExchangeInvokeResponse(
            StatusCodes.BAD_REQUEST,
            'The bot received an InvokeActivity that is missing a TokenExchangeInvokeRequest value. This is required to be sent with the InvokeActivity.'
          )
        )
      } else if (context.activity.value.connectionName !== this.settings.connectionName) {
        // Connection name on activity does not match that of setting
        await context.sendActivity(
          this.getTokenExchangeInvokeResponse(
            StatusCodes.BAD_REQUEST,
            'The bot received an InvokeActivity with a TokenExchangeInvokeRequest containing a ConnectionName that does not match the ConnectionName' +
                            'expected by the agent active OAuthPrompt. Ensure these names match when sending the InvokeActivityInvalid ConnectionName in the TokenExchangeInvokeRequest'
          )
        )
      } else {
        let tokenExchangeResponse: any
        try {
          tokenExchangeResponse = await UserTokenAccess.exchangeToken(context, this.settings, {
            token: context.activity.value.token,
          })
        } catch (_err) {
          // Ignore errors.
          // If the token exchange failed for any reason, the tokenExchangeResponse stays undefined
          // and we send back a failure invoke response to the caller.
        }

        if (!tokenExchangeResponse || !tokenExchangeResponse.token) {
          await context.sendActivity(
            this.getTokenExchangeInvokeResponse(
              StatusCodes.PRECONDITION_FAILED,
              'The bot is unable to exchange token. Proceed with regular login.'
            )
          )
        } else {
          await context.sendActivity(
            this.getTokenExchangeInvokeResponse(StatusCodes.OK, null, context.activity.value.id)
          )
          token = {
            channelId: tokenExchangeResponse.channelId,
            connectionName: tokenExchangeResponse.connectionName,
            token: tokenExchangeResponse.token,
            expiration: null,
          }
        }
      }
    } else if (context.activity.type === ActivityTypes.Message) {
      const [, magicCode] = /(\d{6})/.exec(context.activity.text) ?? []
      if (magicCode) {
        token = await UserTokenAccess.getUserToken(context, this.settings, magicCode)
      }
    }

    return token !== undefined ? { succeeded: true, value: token } : { succeeded: false }
  }

  /**
     * @private
     */
  private getTokenExchangeInvokeResponse (status: number, failureDetail: string, id?: string): Activity {
    const invokeResponse: Activity = Activity.fromObject({
      type: 'invokeResponse',
      value: { status, body: new TokenExchangeInvokeResponse(id, this.settings.connectionName, failureDetail) },
    })
    return invokeResponse as Activity
  }

  /**
     * @private
     */
  private static isFromStreamingConnection (activity: Activity): boolean {
    return activity && activity.serviceUrl && !activity.serviceUrl.toLowerCase().startsWith('http')
  }

  /**
     * @private
     */
  private static isTokenResponseEvent (context: TurnContext): boolean {
    const activity: Activity = context.activity

    return activity.type === ActivityTypes.Event && activity.name === this.tokenResponseEventName
  }

  /**
     * @private
     */
  private static isTeamsVerificationInvoke (context: TurnContext): boolean {
    const activity: Activity = context.activity

    return activity.type === ActivityTypes.Invoke && activity.name === this.verifyStateOperationName
  }

  /**
     * @private
     */
  private static isOAuthCardSupported (context: TurnContext): boolean {
    // Azure Bot Service OAuth cards are not supported in the community adapters. Since community adapters
    // have a 'name' in them, we cast the adapter to 'any' to check for the name.
    const adapter: any = context.adapter
    if (adapter.name) {
      switch (adapter.name) {
        case 'Facebook Adapter':
        case 'Google Hangouts Adapter':
        case 'Slack Adapter':
        case 'Twilio SMS Adapter':
        case 'Web Adapter':
        case 'Webex Adapter':
        case 'Botkit CMS':
          return false
        default:
      }
    }
    return this.channelSupportsOAuthCard(context.activity.channelId)
  }

  /**
     * @private
     */
  private static isTokenExchangeRequestInvoke (context: TurnContext): boolean {
    const activity: Activity = context.activity

    return activity.type === ActivityTypes.Invoke && activity.name === this.tokenExchangeOperationName
  }

  /**
     * @private
     */
  private static isTokenExchangeRequest (obj: unknown): obj is TokenExchangeInvokeRequest {
    if (Object.prototype.hasOwnProperty.call(obj, 'token')) {
      return true
    }
    return false
  }

  /**
     * @private
     */
  private static channelSupportsOAuthCard (channelId: string): boolean {
    switch (channelId) {
      case Channels.Skype:
        return false
      default:
    }

    return true
  }

  /**
     * @private
     */
  private static channelRequiresSignInLink (channelId: string): boolean {
    switch (channelId) {
      case Channels.Msteams:
        return true
      default:
    }

    return false
  }
}

/**
 * @private
 */
interface OAuthPromptState {
  state: any;
  options: PromptOptions;
  expires: number; // Timestamp of when the prompt will timeout.
}

/**
 * @private
 */
interface CallerInfo {
  callerServiceUrl: string;
  scope: string;
}
