// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, CardFactory, MemoryStorage, MessageFactory, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { getUserInfo } from '../_shared/userGraphClient.js'
import { getCurrentProfile, getPullRequests } from '../_shared/githubApiClient.js'

class OneProvider extends AgentApplication<TurnState> {
  constructor () {
    super({
      storage: new MemoryStorage(),
      authorization: {
        graph: { text: 'Sign in with Microsoft Graph', title: 'Graph Sign In' },
        github: { text: 'Sign in with GitHub', title: 'GitHub Sign In' },
      },
    })
    this.onConversationUpdate('membersAdded', this._status)
    this.authorization.onSignInSuccess(this._singinSuccess)
    this.authorization.onSignInFailure(this._singinFailure)
    this.onMessage('/logout', this._logout)
    this.onMessage('/me', this._profileRequest, ['graph'])
    this.onMessage('/prs', this._pullRequests, ['github'])
    this.onMessage('/status', this._status, ['graph', 'github'])
    this.onActivity('invoke', this._invoke)
    this.onActivity('message', this._message)
  }

  private _status = async (context: TurnContext, state: TurnState): Promise<void> => {
    await context.sendActivity(MessageFactory.text('Welcome to the App Routes with auth demo!'))
    const tokGraph = await this.authorization.getToken(context, 'graph')
    const tokGH = await this.authorization.getToken(context, 'github')
    const statusGraph = tokGraph.token !== undefined
    const statusGH = tokGH.token !== undefined
    await context.sendActivity(MessageFactory.text(`Token status: Graph:${statusGraph} GH:${statusGH}`))
  }

  private _logout = async (context: TurnContext, state: TurnState): Promise<void> => {
    await this.authorization.signOut(context, state)
    await context.sendActivity(MessageFactory.text('user logged out'))
  }

  private _invoke = async (context: TurnContext, state: TurnState): Promise<void> => {
    await context.sendActivity(MessageFactory.text('Invoke received.'))
  }

  private _singinSuccess = async (context: TurnContext, state: TurnState, authId?: string): Promise<void> => {
    await context.sendActivity(MessageFactory.text(`User signed in successfully in ${authId}`))
  }

  private _singinFailure = async (context: TurnContext, state: TurnState, authId?: string, err?: string): Promise<void> => {
    await context.sendActivity(MessageFactory.text(`Signing Failure in auth handler: ${authId} with error: ${err}`))
  }

  private _message = async (context: TurnContext, state: TurnState): Promise<void> => {
    await context.sendActivity(MessageFactory.text('You said.' + context.activity.text))
  }

  private _profileRequest = async (context: TurnContext, state: TurnState): Promise<void> => {
    const userTokenResponse = await this.authorization.getToken(context, 'graph')
    if (!userTokenResponse?.token) {
      await context.sendActivity(MessageFactory.text('Token not available. Please sign in with Microsoft Graph.'))
      return
    }

    const userTemplate = (await import('./../_resources/UserProfileCard.json'))
    const userInfo = await getUserInfo(userTokenResponse?.token!)
    /* eslint-disable no-template-curly-in-string */
    const card = JSON.parse(JSON.stringify(userTemplate)
      .replaceAll('${displayName}', userInfo.$root.displayName)
      .replaceAll('${mail}', userInfo.$root.mail)
      .replaceAll('${jobTitle}', (userInfo.$root.jobTitle ?? '').toUpperCase())
      .replaceAll('${givenName}', userInfo.$root.givenName)
      .replaceAll('${surname}', userInfo.$root.surname)
      .replaceAll('${imageUri}', userInfo.$root.imageUri))
    /* eslint-enable no-template-curly-in-string */
    const activity = MessageFactory.attachment(CardFactory.adaptiveCard(card))
    await context.sendActivity(activity)
  }

  private _pullRequests = async (context: TurnContext, state: TurnState): Promise<void> => {
    const userTokenResponse = await this.authorization.getToken(context, 'github')
    if (!userTokenResponse.token) {
      await context.sendActivity(MessageFactory.text('Token not available. Please sign in with GitHub.'))
      return
    }

    const ghProf = await getCurrentProfile(userTokenResponse.token)
    const userTemplate = (await import('./../_resources/UserProfileCard.json'))
    /* eslint-disable no-template-curly-in-string */
    const card = JSON.parse(JSON.stringify(userTemplate)
      .replaceAll('${displayName}', ghProf.$root.displayName)
      .replaceAll('${mail}', ghProf.$root.mail)
      .replaceAll('${jobTitle}', (ghProf.$root.jobTitle ?? '').toUpperCase())
      .replaceAll('${givenName}', ghProf.$root.givenName)
      .replaceAll('${surname}', ghProf.$root.surname)
      .replaceAll('${imageUri}', ghProf.$root.imageUri))
    /* eslint-enable no-template-curly-in-string */
    const activity = MessageFactory.attachment(CardFactory.adaptiveCard(card))
    await context.sendActivity(activity)

    const prs = await getPullRequests('microsoft', 'agents', userTokenResponse.token)
    for (const pr of prs) {
      const prCard = (await import('./../_resources/PullRequestCard.json'))
      /* eslint-disable no-template-curly-in-string */
      const card = JSON.parse(JSON.stringify(prCard)
        .replaceAll('${title}', pr.title)
        .replaceAll('${url}', pr.url))
      /* eslint-enable no-template-curly-in-string */
      await context.sendActivity(MessageFactory.attachment(CardFactory.adaptiveCard(card)))
    }
  }
}

startServer(new OneProvider())
