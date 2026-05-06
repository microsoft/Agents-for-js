import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import {
  AgentApplication,
  CloudAdapter,
  InvokeResponse,
  loadAuthConfigFromEnv,
  MemoryStorage,
  TurnContext,
  TurnState
} from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-express'
import {
  SetTeamsApiClientMiddleware,
  TeamsAgentExtension
} from '@microsoft/agents-hosting-extensions-teams'
import { TaskModuleResponse, TaskModuleTaskInfo } from '@microsoft/teams.api'
import express from 'express'
import path from 'path'
import { loadCardJson } from './loadCard'

const APP_BASE_URL = process.env.AppBaseUrl ?? 'http://localhost:3978'

const adapter = new CloudAdapter(loadAuthConfigFromEnv())

const app = new AgentApplication<TurnState>({
  adapter,
  storage: new MemoryStorage()
})

const teamsExt = new TeamsAgentExtension(app)

app.registerExtension<TeamsAgentExtension>(teamsExt, (tae) => {
  // All task/fetch invokes are handled here; routing is done by data.task since
  // onFetchByVerb compares the entire data object rather than a field within it.
  tae.taskModule.onFetch(async (context: TurnContext, _state: TurnState) => {
    const data = (context.activity.value as any)?.data
    const task = data?.task as string

    let response: TaskModuleResponse

    switch (task) {
      case 'simple_form':
        response = {
          task: {
            type: 'continue',
            value: {
              card: {
                contentType: 'application/vnd.microsoft.card.adaptive',
                content: loadCardJson('simple-form-card.json')
              },
              title: 'Simple Form',
              height: 'small',
              width: 'small'
            } as TaskModuleTaskInfo
          }
        }
        break

      case 'webpage_dialog':
        response = {
          task: {
            type: 'continue',
            value: {
              url: `${APP_BASE_URL}/dialog-form`,
              title: 'Webpage Dialog',
              height: 500,
              width: 800
            } as TaskModuleTaskInfo
          }
        }
        break

      case 'multi_step_form':
        response = {
          task: {
            type: 'continue',
            value: {
              card: {
                contentType: 'application/vnd.microsoft.card.adaptive',
                content: loadCardJson('multi-step-name-card.json')
              },
              title: 'Multi-step Form Dialog',
              height: 'small',
              width: 'small'
            } as TaskModuleTaskInfo
          }
        }
        break

      case 'mixed_example':
        response = {
          task: {
            type: 'continue',
            value: {
              url: 'https://teams.microsoft.com/l/task/example-mixed',
              title: 'Mixed Example',
              height: 600,
              width: 800
            } as TaskModuleTaskInfo
          }
        }
        break

      default:
        response = {
          task: {
            type: 'message',
            value: 'Unknown task module'
          }
        }
    }

    await context.sendActivity(Activity.fromObject({
      value: { body: response, status: 200 } as InvokeResponse,
      type: ActivityTypes.InvokeResponse
    }))
  })

  // Simple form submit - adaptive card sends data.task
  tae.taskModule.submit(
    (context: TurnContext) => Promise.resolve(
      context.activity.type === ActivityTypes.Invoke &&
      context.activity.name === 'task/submit' &&
      (context.activity.value as any)?.data?.task === 'simple_form'
    ),
    async (context: TurnContext, _state: TurnState, data: any) => {
      const name = (data?.name as string) ?? 'Unknown'
      await context.sendActivity(`Hi ${name}, thanks for submitting the form!`)
      return 'Form was submitted'
    }
  )

  // Webpage dialog submit - HTML form sends data.verb via microsoftTeams.dialog.url.submit
  tae.taskModule.submit(
    (context: TurnContext) => Promise.resolve(
      context.activity.type === ActivityTypes.Invoke &&
      context.activity.name === 'task/submit' &&
      (context.activity.value as any)?.data?.verb === 'webpage_dialog'
    ),
    async (context: TurnContext, _state: TurnState, data: any) => {
      const name = (data?.name as string) ?? 'Unknown'
      const email = (data?.email as string) ?? 'No email provided'
      await context.sendActivity(`Hi ${name}, thanks for submitting the form! We got that your email is ${email}`)
      return 'Form submitted successfully'
    }
  )

  // Multi-step form step 1 (name) - returns the email card to continue the flow
  tae.taskModule.submit(
    (context: TurnContext) => Promise.resolve(
      context.activity.type === ActivityTypes.Invoke &&
      context.activity.name === 'task/submit' &&
      (context.activity.value as any)?.data?.task === 'multi_step_form_submit_name'
    ),
    async (_context: TurnContext, _state: TurnState, data: any) => {
      const name = (data?.name as string) ?? 'Unknown'
      return {
        card: {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: loadCardJson('multi-step-email-card.json', { name })
        },
        title: `Thanks ${name} - Get Email`,
        height: 'small',
        width: 'small'
      } as TaskModuleTaskInfo
    }
  )

  // Multi-step form step 2 (email) - completes the flow
  tae.taskModule.submit(
    (context: TurnContext) => Promise.resolve(
      context.activity.type === ActivityTypes.Invoke &&
      context.activity.name === 'task/submit' &&
      (context.activity.value as any)?.data?.task === 'multi_step_form_submit_email'
    ),
    async (context: TurnContext, _state: TurnState, data: any) => {
      const name = (data?.name as string) ?? 'Unknown'
      const email = (data?.email as string) ?? 'No email provided'
      await context.sendActivity(`Hi ${name}, thanks for submitting the form! We got that your email is ${email}`)
      return 'Multi-step form completed successfully'
    }
  )
})

// Default message handler - sends the launcher card so users can open task modules
app.onActivity('message', async (context: TurnContext, _state: TurnState) => {
  await context.sendActivity(Activity.fromObject({
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: loadCardJson('launcher-card.json')
    }]
  }))
})

const expressApp = startServer(
  app,
  {
    configureAdapter: (adapter) => {
      adapter.use(new SetTeamsApiClientMiddleware())
    }
  }
)

expressApp.use(express.static(path.join(__dirname, '../public')))
