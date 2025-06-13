// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, CardFactory, MemoryStorage, MessageFactory, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { Template } from 'adaptivecards-templating'
import { getUserInfo } from '../_shared/userGraphClient'
import { getCurrentProfile, getPullRequests } from '../_shared/githubApiClient'

class OneProvider extends AgentApplication<TurnState> {
  constructor () {
    super({
      storage: new MemoryStorage(),
      authorization: {
        graph: { name: 'SSOSelf' },
        github: { name: 'GH', text: 'Sign in with GitHub', title: 'GitHub Sign In' },
      }
    })
    this.onConversationUpdate('membersAdded', this._status)
    this.authorization.onSignInSuccess(this._singinSuccess)
    this.onMessage('/logout', this._logout)
    this.onMessage('/me', this._profileRequest, ['graph'])
    this.onMessage('/prs', this._pullRequests, ['github'])
    this.onMessage('/status', this._status, ['graph', 'github'])
    this.onActivity('invoke', this._invoke)
    this.onActivity('message', this._message)
  }

  private _status = async (context: TurnContext, state: TurnState): Promise<void> => {
    await context.sendActivity(MessageFactory.text('Welcome to the Basic App demo!'))
    const tresp = await this.authorization.getToken(context, 'graph')
    if (tresp && tresp.token) {
      await context.sendActivity(MessageFactory.text('Graph Token  received: ' + tresp.token?.length))
    } else {
      await context.sendActivity(MessageFactory.text('Graph Token request status: '))
    }

    const tresp2 = await this.authorization.getToken(context, 'github')
    if (tresp2 && tresp2.token) {
      await context.sendActivity(MessageFactory.text('github Token  received: ' + tresp2.token?.length))
    } else {
      await context.sendActivity(MessageFactory.text('github Token request status: '))
    }
  }

  private _logout = async (context: TurnContext, state: TurnState): Promise<void> => {
    await this.authorization.signOut(context, state)
    await context.sendActivity(MessageFactory.text('user logged out'))
  }

  private _invoke = async (context: TurnContext, state: TurnState): Promise<void> => {
    await context.sendActivity(MessageFactory.text('Invoke received.'))
  }

  private _singinSuccess = async (context: TurnContext, state: TurnState): Promise<void> => {
    await context.sendActivity(MessageFactory.text('User signed in successfully'))
  }

  private _message = async (context: TurnContext, state: TurnState): Promise<void> => {
    await context.sendActivity(MessageFactory.text('You said.' + context.activity.text))
  }

  private _profileRequest = async (context: TurnContext, state: TurnState): Promise<void> => {
    const userTokenResponse = await this.authorization.getToken(context)
    if (userTokenResponse && userTokenResponse?.token) {
      const userTemplate = (await import('./../_resources/UserProfileCard.json'))
      const template = new Template(userTemplate)
      const userInfo = await getUserInfo(userTokenResponse?.token!)
      const card = template.expand(userInfo)
      const activity = MessageFactory.attachment(CardFactory.adaptiveCard(card))
      await context.sendActivity(activity)
    } else {
      await context.sendActivity(MessageFactory.text(' token not available. Enter "/login" to sign in.'))
    }
  }

  private _pullRequests = async (context: TurnContext, state: TurnState): Promise<void> => {
    const userTokenResponse = await this.authorization.getToken(context, 'github')
    if (userTokenResponse && userTokenResponse.token) {
      const ghProf = await getCurrentProfile(userTokenResponse.token)
      console.log('GitHub profile', ghProf)

      const userTemplate = (await import('./../_resources/UserProfileCard.json'))
      const template = new Template(userTemplate)
      const card = template.expand(ghProf)
      const activity = MessageFactory.attachment(CardFactory.adaptiveCard(card))
      await context.sendActivity(activity)

      const prs = await getPullRequests('microsoft', 'agents', userTokenResponse.token)
      for (const pr of prs) {
        const prCard = (await import('./../_resources/PullRequestCard.json'))
        const template = new Template(prCard)
        const toExpand = {
          $root: {
            title: pr.title,
            url: pr.url,
            id: pr.id,
          }
        }
        const card = template.expand(toExpand)
        await context.sendActivity(MessageFactory.attachment(CardFactory.adaptiveCard(card)))
      }
    } else {
      const tokenResponse = await this.authorization.beginOrContinueFlow(context, state, 'github')
      console.warn(`GitHub token: ${JSON.stringify(tokenResponse)}`)
      await context.sendActivity(MessageFactory.text('GitHub token length.' + tokenResponse?.token?.length))
    }
  }
}

startServer(new OneProvider())
