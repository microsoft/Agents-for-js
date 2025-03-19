import { Activity } from '@microsoft/agents-bot-activity'
import { ActivityHandler } from '../activityHandler'
import { CloudAdapter } from '../cloudAdapter'
import { Request, Response, Application } from 'express'
import { MemoryStorage } from '../storage'
import { TurnContext } from '../turnContext'

export const addBotApi = (app: Application, adapter: CloudAdapter, bot: ActivityHandler) => {
  app.post('/api/botresponse/v3/conversations/:conversationId/activities/:activityId', handleBotResponse(adapter, bot))
}

const handleBotResponse = (adapter: CloudAdapter, bot: ActivityHandler) => async (req: Request, res: Response) => {
  const activity = Activity.fromObject(req.body!)
  const activityFromEchoBot = JSON.stringify(activity)
  console.log('activityFromEchoBot', activityFromEchoBot)

  const dataForBot = await MemoryStorage.getSingleInstance().read([req.params!.conversationId])
  const conversationReference = dataForBot[req.params!.conversationId].conversationReference
  console.log('Data for bot:', dataForBot)

  // TODO delete activity from memory.
  // Bot1.cs 174
  //  await _conversationIdFactory.DeleteConversationReferenceAsync(conversationId, cancellationToken).ConfigureAwait(false);

  const callback = async (turnContext: TurnContext) => {
    activity.applyConversationReference(conversationReference)
    turnContext.activity.id = req.params!.activityId

    if (activity.type === 'endOfConversation') {
      await MemoryStorage.getSingleInstance().delete([activity.conversation!.id])
      await bot.run(turnContext)
    } else {
      await turnContext.sendActivity(activity)
    }
  }

  await adapter.continueConversation(conversationReference, callback, true)
  // TODO send an http response
}
