import { Activity, ActivityTypes, ConversationReference } from '@microsoft/agents-activity'
import { ActivityHandler } from '../activityHandler'
import { CloudAdapter } from '../cloudAdapter'
import { Request, Response, Application } from 'express'
import { TurnContext } from '../turnContext'
import { v4 } from 'uuid'
import { normalizeIncomingActivity } from '../activityWireCompat'
import { debug } from '../logger'
import { ConversationState } from '../state'

const logger = debug('agents:agent-client')

interface ConversationReferenceState {
  conversationReference: ConversationReference
}

export const configureResponseController = (app: Application, adapter: CloudAdapter, agent: ActivityHandler, conversationState: ConversationState) => {
  app.post('/api/agentresponse/v3/conversations/:conversationId/activities/:activityId', handleResponse(adapter, agent, conversationState))
}

const handleResponse = (adapter: CloudAdapter, handler: ActivityHandler, conversationState: ConversationState) => async (req: Request, res: Response) => {
  const incoming = normalizeIncomingActivity(req.body!)
  const activity = Activity.fromObject(incoming)

  logger.debug('received response: ', activity)

  const myTurnContext = new TurnContext(adapter, activity)
  const conversationDataAccessor = conversationState.createProperty<ConversationReferenceState>(req.params!.conversationId)
  const conversationRefState = await conversationDataAccessor.get(myTurnContext, undefined, { channelId: activity.channelId!, conversationId: req.params!.conversationId })

  const conversationRef = JSON.stringify(conversationRefState.conversationReference)
  console.log('conversationRef', conversationRef)
  const callback = async (turnContext: TurnContext) => {
    activity.applyConversationReference(conversationRefState.conversationReference)
    turnContext.activity.id = req.params!.activityId

    let response
    if (activity.type === ActivityTypes.EndOfConversation) {
      await conversationDataAccessor.delete(turnContext, { channelId: activity.channelId!, conversationId: activity.conversation!.id })

      applyActivityToTurnContext(turnContext, activity)
      await handler.run(turnContext)

      response = v4().replace(/-/g, '')
    } else {
      response = await turnContext.sendActivity(activity)
    }
    res.status(200).send(response)
  }

  await adapter.continueConversation(conversationRefState.conversationReference, callback, true)
}

const applyActivityToTurnContext = (turnContext : TurnContext, activity : Activity) => {
  turnContext.activity.channelData = activity.channelData
  turnContext.activity.code = activity.code
  turnContext.activity.entities = activity.entities
  turnContext.activity.locale = activity.locale
  turnContext.activity.localTimestamp = activity.localTimestamp
  turnContext.activity.name = activity.name
  turnContext.activity.relatesTo = activity.relatesTo
  turnContext.activity.replyToId = activity.replyToId
  turnContext.activity.timestamp = activity.timestamp
  turnContext.activity.text = activity.text
  turnContext.activity.type = activity.type
  turnContext.activity.value = activity.value
}
