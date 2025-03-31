import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { ActivityHandler } from '../activityHandler'
import { CloudAdapter } from '../cloudAdapter'
import { Request, Response, Application } from 'express'
import { MemoryStorage } from '../storage'
import { TurnContext } from '../turnContext'
import { v4 } from 'uuid'
import { debug } from '../logger'

const logger = debug('agents:agent-client')

export const configureResponseController = (app: Application, adapter: CloudAdapter, agent: ActivityHandler) => {
  app.post('/api/agentresponse/v3/conversations/:conversationId/activities/:activityId', handleResponse(adapter, agent))
}

const handleResponse = (adapter: CloudAdapter, handler: ActivityHandler) => async (req: Request, res: Response) => {
  const activity = Activity.fromObject(req.body!)

  logger.debug('received response: ', activity)

  const requestData = await MemoryStorage.getSingleInstance().read([req.params!.conversationId])
  const conversationReference = requestData[req.params!.conversationId].conversationReference
  logger.debug('memoryChanges: ', requestData)

  const callback = async (turnContext: TurnContext) => {
    activity.applyConversationReference(conversationReference)
    turnContext.activity.id = req.params!.activityId

    let response
    if (activity.type === ActivityTypes.EndOfConversation) {
      await MemoryStorage.getSingleInstance().delete([activity.conversation!.id])

      applyActivityToTurnContext(turnContext, activity)
      await handler.run(turnContext)

      response = v4().replace(/-/g, '')
    } else {
      response = await turnContext.sendActivity(activity)
    }
    res.status(200).send(response)
  }

  await adapter.continueConversation(conversationReference, callback, true)
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
