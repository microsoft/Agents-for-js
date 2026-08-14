import { AuthConfiguration, MsalTokenProvider } from '../auth'
import { Activity, ConversationReference, ExceptionHelper, RoleTypes } from '@microsoft/agents-activity'
import { randomUUID } from 'crypto'
import { debug } from '@microsoft/agents-telemetry'
import { ConversationState } from '../state'
import { TurnContext } from '../turnContext'
import { trace } from '@microsoft/agents-telemetry'
import { AgentClientTraceDefinitions } from '../observability'
import { Errors } from '../errorHelper'

const logger = debug('agents:agent-client')

/**
 * Configuration settings required to connect to an agent endpoint.
 */
export interface AgentClientConfig {
  /**
   * The URL endpoint where activities will be sent to the agent
   */
  endPoint: string;
  /**
   * The client ID of the target agent
   */
  clientId: string;
  /**
   * The service URL used for communication with the agent
   */
  serviceUrl: string;
}

/**
 * Data structure to store conversation state for agent interactions
 */
export interface ConversationData {
  /**
   * Flag indicating whether a name was requested from the agent
   */
  nameRequested: boolean;
  /**
   * Reference to the conversation for maintaining context across interactions
   */
  conversationReference: ConversationReference;
  /**
   * Client ID of the delegated agent allowed to send responses for this conversation.
   */
  expectedAgentClientId?: string;
}

/**
 * Client for communicating with other agents through HTTP requests.
 * Manages configuration, authentication, and activity exchange with target agents.
 */
export class AgentClient {
  /** Configuration settings for the agent client */
  agentClientConfig: AgentClientConfig

  /**
   * Creates a new instance of the AgentClient class.
   *
   * @param agentConfigKey The name of the agent, used to locate configuration in environment variables
   * @throws Error if required configuration is missing
   */
  public constructor (agentConfigKey: string) {
    this.agentClientConfig = this.loadAgentClientConfig(agentConfigKey)
  }

  /**
   * Sends an activity to another agent and handles the conversation state.
   *
   * @param activity The activity to send to the target agent
   * @param authConfig Authentication configuration used to obtain access tokens
   * @param conversationState State manager to store conversation data
   * @param context The current turn context
   * @returns A promise that resolves to the HTTP status text of the agent response
   * @throws Error if the request to the agent endpoint fails
   */
  public async postActivity (activity: Activity, authConfig: AuthConfiguration, conversationState: ConversationState, context: TurnContext): Promise<string> {
    return trace(AgentClientTraceDefinitions.postActivity, async ({ record }) => {
      record({
        endpoint: this.agentClientConfig.endPoint,
        clientId: this.agentClientConfig.clientId,
      })
      const activityCopy = activity.clone()
      activityCopy.serviceUrl = this.agentClientConfig.serviceUrl
      activityCopy.recipient = { ...activityCopy.recipient, role: RoleTypes.Skill }
      activityCopy.relatesTo = {
        serviceUrl: activity.serviceUrl,
        activityId: activityCopy.id,
        channelId: activityCopy.channelId!,
        locale: activityCopy.locale,
        conversation: {
          id: activity.conversation!.id,
          ...activityCopy.conversation
        }
      }
      activityCopy.conversation!.id = randomUUID()

      const delegatedContext = new TurnContext(context.adapter, activityCopy, context.identity)
      const delegatedStateKey = { channelId: activityCopy.channelId!, conversationId: activityCopy.conversation!.id }
      const conversationDataAccessor = conversationState.createProperty<ConversationData>(activityCopy.conversation!.id)
      await conversationDataAccessor.set(delegatedContext,
        {
          conversationReference: activity.getConversationReference(),
          nameRequested: false,
          expectedAgentClientId: this.agentClientConfig.clientId
        },
        delegatedStateKey
      )

      logger.debug('stored delegated conversation state')

      const authProvider = new MsalTokenProvider(authConfig)
      const token = await authProvider.getAccessToken(this.agentClientConfig.clientId)

      logger.debug('sending activity to delegated agent')

      let authHeader = '' // Allow anonymous auth.

      if (token.trim().length > 0) {
        authHeader = `Bearer ${token}`
      }

      await conversationState.saveChanges(delegatedContext, false, delegatedStateKey)
      let response: Response
      try {
        response = await fetch(this.agentClientConfig.endPoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
            'x-ms-conversation-id': activityCopy.conversation!.id
          },
          body: JSON.stringify(activityCopy)
        })
      } catch (error) {
        await conversationState.delete(delegatedContext, delegatedStateKey)
        throw error
      }

      record({ httpStatusCode: response.status.toString() })

      if (!response.ok) {
        await conversationState.delete(delegatedContext, delegatedStateKey)
        throw ExceptionHelper.generateException(Error, Errors.FailedToPostActivityToAgent, undefined, { statusText: response.statusText })
      }
      return response.statusText
    })
  }

  /**
   * Loads agent configuration from environment variables based on the agent name.
   *
   * @param agentName The name of the agent to load configuration for
   * @returns The agent client configuration
   * @throws Error if any required configuration is missing
   * @private
   */
  private loadAgentClientConfig (agentName: string): AgentClientConfig {
    if (agentName) {
      if (process.env[`${agentName}_endpoint`] !== undefined &&
        process.env[`${agentName}_clientId`] !== undefined &&
        process.env[`${agentName}_serviceUrl`] !== undefined) {
        return {
          endPoint: process.env[`${agentName}_endpoint`]!,
          clientId: process.env[`${agentName}_clientId`]!,
          serviceUrl: process.env[`${agentName}_serviceUrl`]!
        }
      } else {
        throw ExceptionHelper.generateException(Error, Errors.MissingAgentClientConfig, undefined, { agentName })
      }
    } else {
      throw ExceptionHelper.generateException(Error, Errors.AgentNameRequired)
    }
  }
}
