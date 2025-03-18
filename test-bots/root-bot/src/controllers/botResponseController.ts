import { Request, Response } from 'express'
import { Activity, TurnContext, MemoryStorage, CloudAdapter } from '@microsoft/agents-bot-hosting'
import { RootBot } from '../bot'

export const handleBotResponse = (adapter: CloudAdapter, bot: RootBot) => async (req: Request, res: Response) => {
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
