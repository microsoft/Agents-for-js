// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, CardFactory, MemoryStorage, MessageFactory, TurnContext, TurnState, Storage } from '@microsoft/agents-hosting'
import { Template } from 'adaptivecards-templating'
import { getUserInfo } from '../_shared/userGraphClient'
import { getCurrentProfile, getPullRequests } from '../_shared/githubApiClient'

class OAuthAgent extends AgentApplication<TurnState> {
  private readonly _storage: Storage

  constructor (storage?: Storage) {
    super({
      storage,
      authorization: {
        graph: { title: 'Login to Microsoft Graph', text: 'login to Graph>' },
        github: { title: 'Login to GitHub', text: 'login to GitHub' }
      }
    })

    this._storage = storage!

    this.onMessage('/login', this._signIn)
    this.onMessage('/status', this._status)
    this.onMessage('/logout', this._signOut)
    this.onMessage('/me', this._profileRequest)
    this.onMessage('/prs', this._pullRequests)
    this.onConversationUpdate('membersAdded', this._status)
    this.onActivity(ActivityTypes.Invoke, this._invoke)
    this.onSignInSuccess(this._handleSignInSuccess)
    this.onActivity(ActivityTypes.Message, this._message)
  }

  private _status = async (context: TurnContext, state: TurnState): Promise<void> => {
    const github = await this.authorization.getToken(context, 'github')
    const graph = await this.authorization.getToken(context, 'graph')
    const status = `GitHub flow status:  ${github.token?.length}  
                    Graph flow status:  ${graph.token?.length}`
    await context.sendActivity(MessageFactory.text(status))
    await context.sendActivity(MessageFactory.text('Enter "/login" to sign in or "/logout" to sign out. /me to see your profile. /prs to see your pull requests.'))
  }

  private _signOut = async (context: TurnContext, state: TurnState): Promise<void> => {
    await this.authorization.signOut(context, state)
    await context.sendActivity(MessageFactory.text('User signed out'))
  }

  private _signIn = async (context: TurnContext, state: TurnState): Promise<void> => {
    const tokenResponse = await this.authorization.beginOrContinueFlow(context, state)
    await context.sendActivity(MessageFactory.text(`Auth flow status: ${tokenResponse}`))
  }

  private _profileRequest = async (context: TurnContext, state: TurnState): Promise<void> => {
    const userTokenResponse = await this.authorization.getToken(context)
    if (userTokenResponse && userTokenResponse.token) {
      const userTemplate = (await import('./../_resources/UserProfileCard.json'))
      const template = new Template(userTemplate)
      const userInfo = await getUserInfo(userTokenResponse.token!)
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
      console.warn('GitHub token ', tokenResponse)
      await context.sendActivity(MessageFactory.text('GitHub token length.' + tokenResponse?.token?.length))
    }
  }

  private _invoke = async (context: TurnContext, state: TurnState): Promise<void> => {
    await this.authorization.beginOrContinueFlow(context, state)
  }

  private _handleSignInSuccess = async (context: TurnContext, state: TurnState, id?: string): Promise<void> => {
    await context.sendActivity(MessageFactory.text('User signed in successfully in ' + id))
  }

  private _message = async (context: TurnContext, state: TurnState): Promise<void> => {
    const isMagicCode = context.activity.text?.match(/^\d{6}$/)
    if (isMagicCode) {
      for (const ah in this.authorization._authHandlers) {
        const flow = this.authorization._authHandlers[ah].flow
        if (flow?.state?.flowStarted) {
          const tresp = await this.authorization.beginOrContinueFlow(context, state, ah)
          if (tresp && !tresp.token) {
            await context.sendActivity(MessageFactory.text('Failed to complete the flow ' + ah))
          }
        }
      }
    } else {
      await context.sendActivity(MessageFactory.text('You said.' + context.activity.text))
    }
  }
}

startServer(new OAuthAgent(new MemoryStorage()))
