// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, Authorization, CardFactory, MemoryStorage, MessageFactory, TurnContext } from '@microsoft/agents-hosting'
import { Template } from 'adaptivecards-templating'
import { getUserInfo } from '../_shared/userGraphClient.js'
import { getCurrentProfile, getPullRequests } from '../_shared/githubApiClient.js'

const app = new AgentApplication({ storage: new MemoryStorage() })

const auth = new Authorization(app)
const guards = auth.initialize({
  graph: { text: 'Sign in with Microsoft Graph', title: 'Graph Sign In', cancelTrigger: '/cancel' },
  github: { text: 'Sign in with GitHub', title: 'GitHub Sign In', cancelTrigger: '/cancel' },
})

app.onConversationUpdate('membersAdded', _status)
app.onMessage('/logout', _logout)
app.onMessage('/me', _profileRequest, [guards.graph])
app.onMessage('/prs', _pullRequests, [guards.github])
app.onMessage('/status', _status, [guards.graph, guards.github])
app.onActivity('invoke', _invoke)
app.onActivity('message', _message)

auth.onSuccess(async (guard, context) => {
  await context.sendActivity(MessageFactory.text(`You have successfully logged in with ${guard.id}!`))
})

auth.onFailure(async (guard, context, reason) => {
  // Log the detailed error for debugging
  console.error(`Auth failure for ${guard.id}:`, reason)
  // Send a generic message to the user
  await context.sendActivity(MessageFactory.text(`Failed to log in with ${guard.id}. Please try again.`))
})

auth.onCancelled(async (guard, context) => {
  await context.sendActivity(MessageFactory.text(`Login process canceled for ${guard.id}`))
})

async function _status (context: TurnContext): Promise<void> {
  await context.sendActivity(MessageFactory.text('Welcome to the App Routes with auth demo!'))
  const graph = await guards.graph.context(context)
  const github = await guards.github.context(context)
  const statusGraph = graph.token !== undefined
  const statusGH = github.token !== undefined
  await context.sendActivity(MessageFactory.text(`Token status: graph:${statusGraph} github:${statusGH}`))
}

async function _logout (context: TurnContext): Promise<void> {
  const loggedOut = await auth.logout(context)
  await context.sendActivity(MessageFactory.text(`You have successfully logged out from ${loggedOut.map(e => e.id).join(', ')}`))
}

async function _profileRequest (context: TurnContext): Promise<void> {
  const graph = await guards.graph.context(context)
  if (!graph.token) {
    await context.sendActivity(MessageFactory.text('Microsoft Graph authentication token not found. Please sign in again.'))
    return
  }
  const userTemplate = (await import('./../_resources/UserProfileCard.json'))
  const template = new Template(userTemplate)
  const userInfo = await getUserInfo(graph.token!)
  const card = template.expand(userInfo)
  const activity = MessageFactory.attachment(CardFactory.adaptiveCard(card))
  await context.sendActivity(activity)
}

async function _invoke (context: TurnContext): Promise<void> {
  await context.sendActivity(MessageFactory.text('Invoke received.'))
}

async function _message (context: TurnContext): Promise<void> {
  await context.sendActivity(MessageFactory.text(`You said ${context.activity.text}`))
}

async function _pullRequests (context: TurnContext): Promise<void> {
  const github = await guards.github.context(context)
  if (!github.token) {
    await context.sendActivity(MessageFactory.text('GitHub authentication token not found. Please sign in again.'))
    return
  }
  const ghProf = await getCurrentProfile(github.token!)
  const userTemplate = (await import('./../_resources/UserProfileCard.json'))
  const template = new Template(userTemplate)
  const card = template.expand(ghProf)
  const activity = MessageFactory.attachment(CardFactory.adaptiveCard(card))
  await context.sendActivity(activity)

  const prs = await getPullRequests('microsoft', 'agents', github.token!)
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
}

startServer(app)
