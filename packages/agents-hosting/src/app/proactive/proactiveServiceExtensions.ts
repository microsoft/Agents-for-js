import { Application, Request, Response } from 'express'
import { Activity, ConversationReference } from '@microsoft/agents-activity'
import { AgentApplication } from '../agentApplication'
import { JwtPayload } from 'jsonwebtoken'
import { ProactiveSendResult } from './proactiveTypes'
import { TurnState } from '../turnState'

/**
 * Options for configuring the proactive HTTP endpoints.
 */
export interface ProactiveHttpOptions {
  /**
   * Optional path prefix applied to all generated routes.
   *
   * @default '/api'
   */
  prefix?: string;
}

interface SendActivityRequestBody {
  conversationId?: string;
  channelId?: string;
  activity?: Activity;
  activities?: Activity[];
}

interface SendToReferenceRequestBody {
  identity?: JwtPayload;
  reference?: ConversationReference;
  activities?: Activity[];
}

/**
 * Registers HTTP endpoints that expose the proactive messaging helper.
 *
 * @param app - Express application to augment.
 * @param agent - Agent application instance.
 * @param options - Optional configuration.
 */
export const registerProactiveRoutes = <TState extends TurnState>(
  app: Application,
  agent: AgentApplication<TState>,
  options?: ProactiveHttpOptions
): void => {
  const prefix = options?.prefix ?? '/api'

  app.post(`${prefix}/sendactivity`, async (req: Request, res: Response) => {
    const body = req.body as SendActivityRequestBody | undefined

    if (!body?.conversationId || !body.channelId) {
      return res.status(400).json({
        status: 'Error',
        error: { code: 'Validation', message: 'Both conversationId and channelId are required.' }
      })
    }

    const activities = asActivityArray(body)
    if (activities.length === 0) {
      return res.status(400).json({
        status: 'Error',
        error: { code: 'Validation', message: 'At least one activity must be supplied.' }
      })
    }

    try {
      const result = await agent.proactive.sendActivities(body.conversationId, body.channelId, activities)
      respondWithResult(res, result, body.conversationId)
    } catch (err: any) {
      res.status(500).json({
        status: 'Error',
        error: { code: 'ProactiveSendFailure', message: err?.message ?? 'Unable to send activities.' }
      })
    }
  })

  app.post(`${prefix}/sendtoreference`, async (req: Request, res: Response) => {
    const body = req.body as SendToReferenceRequestBody | undefined

    if (!body?.identity || !body.reference) {
      return res.status(400).json({
        status: 'Error',
        error: { code: 'Validation', message: 'Both identity and reference are required.' }
      })
    }

    const activities = Array.isArray(body.activities) ? body.activities : []
    if (activities.length === 0) {
      return res.status(400).json({
        status: 'Error',
        error: { code: 'Validation', message: 'At least one activity must be supplied.' }
      })
    }

    try {
      const result = await agent.proactive.sendToReference(body.identity, body.reference, activities)
      respondWithResult(res, result)
    } catch (err: any) {
      res.status(500).json({
        status: 'Error',
        error: { code: 'ProactiveSendFailure', message: err?.message ?? 'Unable to send activities.' }
      })
    }
  })
}

const asActivityArray = (body: SendActivityRequestBody): Activity[] => {
  if (Array.isArray(body.activities) && body.activities.length > 0) {
    return body.activities.map((activity) => Activity.fromObject(activity))
  }

  if (body.activity) {
    return [Activity.fromObject(body.activity)]
  }

  return []
}

const respondWithResult = (res: Response, result: ProactiveSendResult, conversationId?: string) => {
  res.status(200).json({
    conversationId,
    status: 'Delivered',
    activityIds: result.activityIds
  })
}
