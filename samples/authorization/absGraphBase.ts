// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { AgentApplication, AgentApplicationOptions, MessageFactory, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { getUserInfo } from '../_shared/userGraphClient.js'

const AUTH_HANDLER_IDS = {
  auth: 'auth',
  sso: 'sso',
  oboAuto: 'obo_auto',
  oboManual: 'obo_manual'
} as const

const ALL_AUTH_HANDLER_IDS = Object.values(AUTH_HANDLER_IDS)

type AuthEventRecord = {
  handlerId: string
  name: 'onSignInSuccess' | 'onSignInFailure'
  detail?: string
}

export class AbsGraphBase extends AgentApplication<TurnState> {
  private readonly _authEvents = new Map<string, AuthEventRecord>()

  constructor (private readonly label: string, options: Partial<AgentApplicationOptions<TurnState>>) {
    super(options)

    this.onConversationUpdate('membersAdded', this._welcome)

    // --- Authorization commands ---

    // #region Root commands (no route) for all handlers
    this.onMessage('--help', this._status)
    this.onMessage('?', this._status)
    this.onMessage('--login', this._loginMany(ALL_AUTH_HANDLER_IDS), ALL_AUTH_HANDLER_IDS)
    this.onMessage('+', this._loginMany(ALL_AUTH_HANDLER_IDS), ALL_AUTH_HANDLER_IDS)
    this.onMessage('--status', this._statusAll)
    this.onMessage('=', this._statusAll)
    this.onMessage('--logout', this._logoutMany(ALL_AUTH_HANDLER_IDS))
    this.onMessage('-', this._logoutMany(ALL_AUTH_HANDLER_IDS))
    // #endregion

    // #region auth
    this.onMessage('--login auth', this._loginAuth, [AUTH_HANDLER_IDS.auth])
    this.onMessage('--logout auth', this._logoutMany([AUTH_HANDLER_IDS.auth]))
    this.onMessage('--status auth', this._statusAuth)
    this.onMessage('--help auth', this._helpFor(AUTH_HANDLER_IDS.auth))
    this.onMessage('+auth', this._loginAuth, [AUTH_HANDLER_IDS.auth])
    this.onMessage('-auth', this._logoutMany([AUTH_HANDLER_IDS.auth]))
    this.onMessage('=auth', this._statusAuth)
    this.onMessage('?auth', this._helpFor(AUTH_HANDLER_IDS.auth))
    // #endregion

    // #region sso
    this.onMessage('--login sso', this._loginSso, [AUTH_HANDLER_IDS.sso])
    this.onMessage('--logout sso', this._logoutMany([AUTH_HANDLER_IDS.sso]))
    this.onMessage('--status sso', this._statusSso)
    this.onMessage('--help sso', this._helpFor(AUTH_HANDLER_IDS.sso))
    this.onMessage('+sso', this._loginSso, [AUTH_HANDLER_IDS.sso])
    this.onMessage('-sso', this._logoutMany([AUTH_HANDLER_IDS.sso]))
    this.onMessage('=sso', this._statusSso)
    this.onMessage('?sso', this._helpFor(AUTH_HANDLER_IDS.sso))
    // #endregion

    // #region obo_auto
    this.onMessage('--login obo_auto', this._loginOboAuto, [AUTH_HANDLER_IDS.oboAuto])
    this.onMessage('--logout obo_auto', this._logoutMany([AUTH_HANDLER_IDS.oboAuto]))
    this.onMessage('--status obo_auto', this._statusOboAuto)
    this.onMessage('--help obo_auto', this._helpFor(AUTH_HANDLER_IDS.oboAuto))
    this.onMessage('+obo_auto', this._loginOboAuto, [AUTH_HANDLER_IDS.oboAuto])
    this.onMessage('-obo_auto', this._logoutMany([AUTH_HANDLER_IDS.oboAuto]))
    this.onMessage('=obo_auto', this._statusOboAuto)
    this.onMessage('?obo_auto', this._helpFor(AUTH_HANDLER_IDS.oboAuto))
    // #endregion

    // #region obo_manual
    this.onMessage('--login obo_manual', this._loginOboManual, [AUTH_HANDLER_IDS.oboManual])
    this.onMessage('--logout obo_manual', this._logoutMany([AUTH_HANDLER_IDS.oboManual]))
    this.onMessage('--status obo_manual', this._statusOboManual)
    this.onMessage('--help obo_manual', this._helpFor(AUTH_HANDLER_IDS.oboManual))
    this.onMessage('+obo_manual', this._loginOboManual, [AUTH_HANDLER_IDS.oboManual])
    this.onMessage('-obo_manual', this._logoutMany([AUTH_HANDLER_IDS.oboManual]))
    this.onMessage('=obo_manual', this._statusOboManual)
    this.onMessage('?obo_manual', this._helpFor(AUTH_HANDLER_IDS.oboManual))
    // #endregion

    // --- Sign-in callbacks ---
    this.authorization.onSignInSuccess(this._signInSuccess)
    this.authorization.onSignInFailure(this._signInFailure)

    // --- Catch-all ---
    this.onActivity('message', this._welcome)
  }

  private _markdownActivity (text: string) {
    const activity = MessageFactory.text(text)
    activity.textFormat = 'markdown'
    return activity
  }

  private _command (short: string, long: string) {
    const space = '&emsp;'
    return `${space}${short}, --${long}`
  }

  private _detailLine (label: string, value: string) {
    const space = '&emsp;'
    return `${space}${label}: ${value}  `
  }

  private _getAuthEventKey (context: TurnContext, handlerId: string): string {
    return `${context.activity.conversation?.id ?? 'unknown-conversation'}:${context.activity.from?.id ?? 'unknown-user'}:${handlerId}`
  }

  private _recordAuthEvent (context: TurnContext, event: AuthEventRecord) {
    const key = this._getAuthEventKey(context, event.handlerId)
    this._authEvents.set(key, event)
  }

  private _takeAuthEvent (context: TurnContext, handlerId: string): AuthEventRecord | undefined {
    const key = this._getAuthEventKey(context, handlerId)
    const event = this._authEvents.get(key)

    if (event) {
      this._authEvents.delete(key)
    }

    return event
  }

  private _isSignedInResult (userInfo: string): boolean {
    return /signed in/i.test(userInfo)
  }

  private _getLoginEventMap = async (
    context: TurnContext,
    statuses: Array<{ handlerId: string, userInfo: string }>
  ): Promise<Record<string, string>> => {
    const eventMap: Record<string, string> = {}

    for (const status of statuses) {
      const handlerId = status.handlerId
      const event = this._takeAuthEvent(context, handlerId)
      if (event) {
        eventMap[handlerId] = `${event.name}${event.detail ? ` (${event.detail})` : ''}`
        continue
      }

      if (this._isSignedInResult(status.userInfo)) {
        eventMap[handlerId] = 'skipped (already signed in)'
      } else {
        eventMap[handlerId] = 'none'
      }
    }

    return eventMap
  }

  private _sendLoginResult = async (context: TurnContext, handlerIds: string[], statuses: Array<{ handlerId: string, userInfo: string }>): Promise<void> => {
    const filteredStatuses = statuses.filter((status) => handlerIds.includes(status.handlerId))
    const eventMap = await this._getLoginEventMap(context, filteredStatuses)

    await context.sendActivity(this._markdownActivity(`
${filteredStatuses.map((status) => `**${status.handlerId.toUpperCase()}**  \n${this._detailLine('status', status.userInfo)}\n${this._detailLine('event', eventMap[status.handlerId] ?? 'none')}`).join('\n<br>\n')}`))
  }

  private _sendLogoutResult = async (context: TurnContext, results: Array<{ handlerId: string, status: string }>): Promise<void> => {
    if (results.length === 1) {
      await context.sendActivity(this._markdownActivity(`
**LOGOUT**  
${this._detailLine('status', results[0].status)}`))
      return
    }

    await context.sendActivity(this._markdownActivity(`
${results.map((result) => `**${result.handlerId.toUpperCase()}**  \n${this._detailLine('status', result.status)}`).join('\n<br>\n')}`))
  }

  private _sendSignInFailureResult = async (context: TurnContext, handlerId: string, error?: string): Promise<void> => {
    await context.sendActivity(this._markdownActivity(`
**LOGIN**  
${this._detailLine('status', 'sign-in failed')}
${this._detailLine('event', `onSignInFailure${error ? ` (${error})` : ''}`)}
${this._detailLine('handler', handlerId)}`))
  }

  private _welcome = async (context: TurnContext, _state: TurnState): Promise<void> => {
    await context.sendActivity(this._markdownActivity(`
${this.label}  
<br>
Send one of the following commands to get started:
- Send a message (e.g. 'hi') to see this intro again.
- Send ? or --help to see all available commands.
- Send + or --login to start the sign-in flow for all handlers.
- Send - or --logout to sign out of all handlers.
- Send = or --status to check current sign-in status for all handlers.
- Send +handler, -handler, =handler, or ?handler (e.g. +auth) to target a specific handler with the same commands.
`))
  }

  private _status = async (context: TurnContext, _state: TurnState): Promise<void> => {
    // double space at the end of a line behaves as a line break, and <br> allows for spacing between lines.
    await context.sendActivity(this._markdownActivity(`
${this.label}  
<br>
**COMMANDS:** _executes multiple providers_  
${this._command('+', 'login')}  
${this._command('-', 'logout')}  
${this._command('=', 'status')}  
${this._command('?', 'help')}  
<br>
**AUTH:** _magic code_  
${this._command('+auth', 'login auth')}  
${this._command('-auth', 'logout auth')}  
${this._command('=auth', 'status auth')}  
${this._command('?auth', 'help auth')}  
<br>
**SSO:** _exchanges token with Teams SSO_  
${this._command('+sso', 'login sso')}  
${this._command('-sso', 'logout sso')}  
${this._command('=sso', 'status sso')}  
${this._command('?sso', 'help sso')}  
<br>
**OBO_AUTO:** _exchanges OBO token automatically_  
${this._command('+obo_auto', 'login obo_auto')}  
${this._command('-obo_auto', 'logout obo_auto')}  
${this._command('=obo_auto', 'status obo_auto')}  
${this._command('?obo_auto', 'help obo_auto')}  
<br>
**OBO_MANUAL:** _exchanges OBO token manually_  
${this._command('+obo_manual', 'login obo_manual')}  
${this._command('-obo_manual', 'logout obo_manual')}  
${this._command('=obo_manual', 'status obo_manual')}  
${this._command('?obo_manual', 'help obo_manual')}  
`))
  }

  private _helpFor = (routeName: string) => async (context: TurnContext, _state: TurnState): Promise<void> => {
    // double space at the end of a line behaves as a line break, and <br> allows for spacing between lines.
    const space = '&emsp;'

    await context.sendActivity(this._markdownActivity(`
**HANDLER**  
${space}${routeName}  
<br>
**COMMANDS**  
  ${this._command(`+${routeName}`, `login ${routeName}`)}  
  ${this._command(`-${routeName}`, `logout ${routeName}`)}  
  ${this._command(`=${routeName}`, `status ${routeName}`)}  
  ${this._command(`?${routeName}`, `help ${routeName}`)}  
  `))
  }

  private _signInSuccess = async (context: TurnContext, _state: TurnState, handlerId?: string): Promise<void> => {
    this._recordAuthEvent(context, { handlerId: handlerId ?? 'unknown', name: 'onSignInSuccess' })
  }

  private _signInFailure = async (context: TurnContext, _state: TurnState, handlerId?: string, error?: string): Promise<void> => {
    const resolvedHandlerId = handlerId ?? 'unknown'
    await this._sendSignInFailureResult(context, resolvedHandlerId, error)
  }

  private _statusAll = async (context: TurnContext, _state: TurnState): Promise<void> => {
    const statuses = await Promise.all([
      this._getStatusEntry(AUTH_HANDLER_IDS.auth, this._getAuthUserInfo(context)),
      this._getStatusEntry(AUTH_HANDLER_IDS.sso, this._getSsoUserInfo(context)),
      this._getStatusEntry(AUTH_HANDLER_IDS.oboAuto, this._getOboAutoUserInfo(context)),
      this._getStatusEntry(AUTH_HANDLER_IDS.oboManual, this._getOboManualUserInfo(context)),
    ])

    await context.sendActivity(this._markdownActivity(`
${statuses.map((status) => `**${status.handlerId.toUpperCase()}**  \n${this._detailLine('status', status.userInfo)}`).join('\n<br>\n')}`))
  }

  private _statusOboAuto = async (context: TurnContext, _state: TurnState): Promise<void> => {
    await this._sendSingleStatus(context, AUTH_HANDLER_IDS.oboAuto, this._getOboAutoUserInfo(context))
  }

  private _statusOboManual = async (context: TurnContext, _state: TurnState): Promise<void> => {
    await this._sendSingleStatus(context, AUTH_HANDLER_IDS.oboManual, this._getOboManualUserInfo(context))
  }

  private _statusAuth = async (context: TurnContext, _state: TurnState): Promise<void> => {
    await this._sendSingleStatus(context, AUTH_HANDLER_IDS.auth, this._getAuthUserInfo(context))
  }

  private _statusSso = async (context: TurnContext, _state: TurnState): Promise<void> => {
    await this._sendSingleStatus(context, AUTH_HANDLER_IDS.sso, this._getSsoUserInfo(context))
  }

  private _getHandlerConfigLines (handlerId: string): string[] {
    const manager = (this.authorization as any).manager
    const handler = manager?.handlers?.find((entry: any) => entry.id === handlerId)

    if (!handler) {
      return [this._detailLine('config', 'unavailable')]
    }

    const optionEntries = Object.entries(handler.options ?? {})
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => this._detailLine(key, this._formatConfigValue(value)))

    return [
      this._detailLine('type', this._formatConfigValue(handler.type)),
      ...optionEntries,
    ]
  }

  private _formatConfigValue (value: unknown): string {
    if (value === undefined) {
      return 'undefined'
    }

    if (Array.isArray(value)) {
      return value.join(', ')
    }

    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value)
    }

    return String(value)
  }

  private _sendSingleStatus = async (context: TurnContext, handlerId: string, userInfoPromise: Promise<string>): Promise<void> => {
    const status = await this._getStatusEntry(handlerId, userInfoPromise)
    const configLines = this._getHandlerConfigLines(handlerId)

    await context.sendActivity(this._markdownActivity(`
**STATUS**  
${this._detailLine('result', status.userInfo)}
<br>
**CONFIG**  
${configLines.join('\n')}`))
  }

  private _logoutMany = (handlerIds: string[]) => async (context: TurnContext, state: TurnState): Promise<void> => {
    const results: Array<{ handlerId: string, status: string }> = []

    for (const handlerId of handlerIds) {
      const token = await this.authorization.getToken(context, handlerId)
      if (token?.token) {
        await this.authorization.signOut(context, state, handlerId)
        results.push({ handlerId, status: 'signed out' })
      } else {
        results.push({ handlerId, status: 'skipped (already signed out)' })
      }
    }

    await this._sendLogoutResult(context, results)
  }

  private _loginMany = (handlerIds: string[]) => async (context: TurnContext, _state: TurnState): Promise<void> => {
    const allStatuses = await Promise.all([
      this._getStatusEntry(AUTH_HANDLER_IDS.auth, this._getAuthUserInfo(context)),
      this._getStatusEntry(AUTH_HANDLER_IDS.sso, this._getSsoUserInfo(context)),
      this._getStatusEntry(AUTH_HANDLER_IDS.oboAuto, this._getOboAutoUserInfo(context)),
      this._getStatusEntry(AUTH_HANDLER_IDS.oboManual, this._getOboManualUserInfo(context)),
    ])
    const statuses = allStatuses.filter((status) => handlerIds.includes(status.handlerId))

    await this._sendLoginResult(context, handlerIds, statuses)
  }

  private _loginOboAuto = async (context: TurnContext, _state: TurnState): Promise<void> => {
    await this._sendSingleLoginStatus(context, AUTH_HANDLER_IDS.oboAuto, this._getOboAutoUserInfo(context))
  }

  private _loginOboManual = async (context: TurnContext, _state: TurnState): Promise<void> => {
    await this._sendSingleLoginStatus(context, AUTH_HANDLER_IDS.oboManual, this._getOboManualUserInfo(context))
  }

  private _loginAuth = async (context: TurnContext, _state: TurnState): Promise<void> => {
    await this._sendSingleLoginStatus(context, AUTH_HANDLER_IDS.auth, this._getAuthUserInfo(context))
  }

  private _loginSso = async (context: TurnContext, _state: TurnState): Promise<void> => {
    await this._sendSingleLoginStatus(context, AUTH_HANDLER_IDS.sso, this._getSsoUserInfo(context))
  }

  private _sendSingleLoginStatus = async (context: TurnContext, handlerId: string, userInfoPromise: Promise<string>): Promise<void> => {
    const status = await this._getStatusEntry(handlerId, userInfoPromise)
    const eventMap = await this._getLoginEventMap(context, [status])

    await context.sendActivity(this._markdownActivity(`
**LOGIN**  
${this._detailLine('status', status.userInfo)}
${this._detailLine('event', eventMap[handlerId] ?? 'none')}`))
  }

  private _getStatusEntry = async (handlerId: string, userInfoPromise: Promise<string>): Promise<{ handlerId: string, userInfo: string }> => {
    return { handlerId, userInfo: await userInfoPromise }
  }

  private _getOboAutoUserInfo = async (context: TurnContext): Promise<string> => {
    const token = await this.authorization.getToken(context, AUTH_HANDLER_IDS.oboAuto)
    return await this._getGraphUserStatus(AUTH_HANDLER_IDS.oboAuto, token?.token, 'not signed in')
  }

  private _getOboManualUserInfo = async (context: TurnContext): Promise<string> => {
    const signInToken = await this.authorization.getToken(context, AUTH_HANDLER_IDS.oboManual)
    if (!signInToken?.token) {
      return 'not signed in'
    }

    const exchangedToken = await this.authorization.exchangeToken(context, AUTH_HANDLER_IDS.oboManual, { scopes: ['https://graph.microsoft.com/.default'] })
    return await this._getGraphUserStatus(AUTH_HANDLER_IDS.oboManual, exchangedToken?.token, 'exchange failed')
  }

  private _getAuthUserInfo = async (context: TurnContext): Promise<string> => {
    const token = await this.authorization.getToken(context, AUTH_HANDLER_IDS.auth)
    return await this._getGraphUserStatus(AUTH_HANDLER_IDS.auth, token?.token, 'not signed in')
  }

  private _getSsoUserInfo = async (context: TurnContext): Promise<string> => {
    const signInToken = await this.authorization.getToken(context, AUTH_HANDLER_IDS.sso)
    if (!signInToken?.token) {
      return 'not signed in'
    }

    const exchangedToken = await this.authorization.exchangeToken(context, AUTH_HANDLER_IDS.sso)
    return await this._getGraphUserStatus(AUTH_HANDLER_IDS.sso, exchangedToken?.token, 'exchange failed')
  }

  private _getGraphUserStatus = async (handlerId: string, token: string | undefined, missingTokenStatus: string): Promise<string> => {
    if (!token) {
      return missingTokenStatus
    }

    try {
      const userInfo = await getUserInfo(token)
      const displayName = userInfo?.$root?.displayName as string | undefined
      return displayName ? `signed in as _${displayName}_` : 'signed in, but no display name was returned'
    } catch (error) {
      return `${handlerId} is signed in, but user info is unavailable`
    }
  }
}
