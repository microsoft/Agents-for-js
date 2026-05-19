import { AdaptiveCard, AgentApplication, CardFactory, MemoryStorage, MessageFactory, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { TeamsAgentExtension } from '@microsoft/agents-hosting-extensions-teams'
import { startServer } from '@microsoft/agents-hosting-express'
import type { TaskModuleRequest, TaskModuleResponse } from '@microsoft/teams.api'

const app = new AgentApplication<TurnState>({ storage: new MemoryStorage() })

const teamsExt = new TeamsAgentExtension<TurnState>(app)

app.registerExtension<TeamsAgentExtension<TurnState>>(teamsExt, (tae) => {
  console.log('Teams extension registered')
  tae.taskModules.onFetch('simple_form', async (context: TurnContext, state: TurnState, request: TaskModuleRequest): Promise<TaskModuleResponse> => {
    const formCard = {
      type: 'AdaptiveCard',
      body: [
        {
          type: 'TextBlock',
          size: 'Large',
          weight: 'Bolder',
          text: 'Simple Form'
        },
        {
          type: 'Input.Text',
          id: 'name',
          label: 'Your Name',
          isRequired: true
        }
      ],
      actions: [
        {
          type: 'Action.Submit',
          title: 'Submit',
          data: {
            task: 'simple_form'
          }
        }
      ],
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      version: '1.4'
    } as AdaptiveCard

    return {
      task: {
        type: 'continue',
        value: {
          title: 'Simple Form',
          height: 'small',
          width: 'small',
          card: CardFactory.adaptiveCard(formCard)
        }
      }
    }
  })
    .onSubmit('simple_form', async (context: TurnContext, state: TurnState, request: TaskModuleRequest): Promise<TaskModuleResponse> => {
      const name = typeof request.data?.name === 'string' ? request.data.name : 'Unknown'
      console.log('Task module submit:', request.data)
      await context.sendActivity(`Task module submitted successfully for ${name}!`)

      return {
        task: {
          type: 'message',
          value: 'Form was submitted.'
        }
      }
    })
    .onFetch('multi_step_form', async (context: TurnContext, state: TurnState, request: TaskModuleRequest): Promise<TaskModuleResponse> => {
      const formCard = {
        type: 'AdaptiveCard',
        body: [
          {
            type: 'TextBlock',
            size: 'Large',
            weight: 'Bolder',
            text: 'This is a multi-step form'
          },
          {
            type: 'Input.Text',
            id: 'name',
            label: 'Enter Your Name',
            isRequired: true
          }
        ],
        actions: [
          {
            type: 'Action.Submit',
            title: 'Submit',
            data: {
              task: 'multi_step_form_submit_name'
            }
          }
        ],
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        version: '1.4'
      } as AdaptiveCard

      return {
        task: {
          type: 'continue',
          value: {
            title: 'Multi-Step Form Dialog',
            height: 'small',
            width: 'small',
            card: CardFactory.adaptiveCard(formCard)
          }
        }
      }
    })
    .onSubmit('multi_step_form_submit_name', async (context: TurnContext, state: TurnState, request: TaskModuleRequest): Promise<TaskModuleResponse> => {
      const name = typeof request.data?.name === 'string' ? request.data.name : 'Unknown'

      const formCard = {
        type: 'AdaptiveCard',
        body: [
          {
            type: 'TextBlock',
            size: 'Large',
            weight: 'Bolder',
            text: `Email, ${name}!`
          },
          {
            type: 'Input.Text',
            id: 'email',
            label: 'Enter Your Email',
            isRequired: true,
            placeholder: 'Enter your email'
          }
        ],
        actions: [
          {
            type: 'Action.Submit',
            title: 'Submit',
            data: {
              task: 'multi_step_form_submit_email',
              name
            }
          }
        ],
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        version: '1.4'
      } as AdaptiveCard

      return {
        task: {
          type: 'continue',
          value: {
            title: `Thanks ${name} - Get Email`,
            height: 'small',
            width: 'small',
            card: CardFactory.adaptiveCard(formCard)
          }
        }
      }
    })
    .onSubmit('multi_step_form_submit_email', async (context: TurnContext, state: TurnState, request: TaskModuleRequest): Promise<TaskModuleResponse> => {
      const name = typeof request.data?.name === 'string' ? request.data.name : 'Unknown'
      const email = typeof request.data?.email === 'string' ? request.data.email : 'No email provided'

      await context.sendActivity(`Hi ${name}, thanks for submitting the form! We got that your email is ${email}`)

      return {
        task: {
          type: 'message',
          value: 'Multi-step form completed successfully'
        }
      }
    })
})

app.onActivity('message', async (context: TurnContext, state: TurnState) => {
  const card = {
    type: 'AdaptiveCard',
    body: [
      {
        type: 'TextBlock',
        size: 'Large',
        weight: 'Bolder',
        text: 'Select the examples you want to see!'
      }
    ],
    actions: [
      {
        type: 'Action.Submit',
        title: 'Simple Form',
        data: {
          msteams: {
            type: 'task/fetch'
          },
          task: 'simple_form'
        }
      },
      {
        type: 'Action.Submit',
        title: 'Multi-Step Form',
        data: {
          msteams: {
            type: 'task/fetch'
          },
          task: 'multi_step_form'
        }
      }
    ],
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4'
  } as AdaptiveCard

  await context.sendActivity(MessageFactory.attachment(CardFactory.adaptiveCard(card)))
})

startServer(app)
