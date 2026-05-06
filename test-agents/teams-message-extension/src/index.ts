import { ActionTypes } from '@microsoft/agents-activity'
import {
  AgentApplication,
  CardFactory,
  CloudAdapter,
  ConsoleTranscriptLogger,
  loadAuthConfigFromEnv,
  M365AttachmentDownloader,
  MemoryStorage,
  TurnContext,
  TurnState
} from '@microsoft/agents-hosting'
import {
  SetTeamsApiClientMiddleware,
  TeamsAgentExtension,
  TeamsInfo
} from '@microsoft/agents-hosting-extensions-teams'
import {
  MessagingExtensionAttachment,
  MessagingExtensionQuery,
  MessagingExtensionResponse,
  MessagingExtensionResult,
  TaskModuleContinueResponse,
  TaskModuleResponse
} from '@microsoft/teams.api'
import {
  AdaptiveCard,
  TextBlock
} from '@microsoft/teams.cards'
import express from 'express'
import path from 'path'
import { myStartServer } from './myStartServer'

const STORED_FILES_KEY = 'STORED_FILES'

const adapter = new CloudAdapter(loadAuthConfigFromEnv())

const app = new AgentApplication<TurnState>({
  adapter,
  storage: new MemoryStorage(),
  fileDownloaders: [new M365AttachmentDownloader(STORED_FILES_KEY)],
  transcriptLogger: new ConsoleTranscriptLogger()
})

const teamsExt = new TeamsAgentExtension(app)

app.registerExtension<TeamsAgentExtension>(teamsExt, (tae) => {
  console.log('Teams extension registered')

  tae.messageExtension
    .onQuery(async (context: TurnContext, state: TurnState, query: MessagingExtensionQuery) : Promise<MessagingExtensionResult> => {
      const initialRun: boolean = query?.parameters?.some(param => param.name === 'initialRun' && param.value === true) ?? false

      if (initialRun) {
        return {
          type: 'message',
          text: 'Enter search query'
        }
      }

      const searchQuery: string | undefined = query?.parameters?.find(param => param.name === 'searchQuery')?.value as string ?? undefined

      console.log(`Search query received: ${searchQuery}`)

      const attachments: MessagingExtensionAttachment[] = []

      for (let i = 0; i <= 5; i++) {
        const card = new AdaptiveCard(
          new TextBlock(
            `Search Result ${i}`,
            {
              weight: 'Bolder',
              size: 'Large'
            }
          ),
          new TextBlock(
            `Query: ${searchQuery} - Result description for item ${i}`,
            {
              wrap: true,
              isSubtle: true
            }
          )
        )

        const previewCard = CardFactory.thumbnailCard(
          `Result ${i}`,
          `This is a preview of result ${i} for query '${searchQuery}'`,
          undefined,
          undefined,
          {
            tap: {
              title: `Result ${i}`,
              type: 'invoke',
              value: {
                index: i,
                query: searchQuery
              }
            }
          }
        )

        const attachment: MessagingExtensionAttachment = {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: card,
          preview: previewCard
        }

        attachments.push(attachment)
      }

      return {
        type: 'result',
        attachmentLayout: 'list',
        attachments
      }
    })
    .onSelectItem(async (context: TurnContext, state: TurnState, items: any) : Promise<MessagingExtensionResult> => {
      const index = items?.index as string ?? 'No Index'
      const query = items?.query as string ?? 'No Query'

      console.log(`Item selected: ${index}:${query}`)

      const card = new AdaptiveCard(
        new TextBlock(
          'Item Selected',
          {
            weight: 'Bolder',
            size: 'Large',
            color: 'Good'
          }
        ),
        new TextBlock(
          `You selected item: ${index} for query: '${query}'`,
          {
            wrap: true,
            fontType: 'Monospace',
            separator: true
          }
        )
      )

      card.$schema = 'http://adaptivecards.io/schemas/adaptive-card.json'

      const attachment = {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: card
      }

      return {
        type: 'result',
        attachmentLayout: 'list',
        attachments: [attachment]
      }
    })
    .onSubmitAction(async (context: TurnContext, state: TurnState, data: any) : Promise<MessagingExtensionResponse> => {
      const title = data?.data?.title ?? 'Default Title'
      const description = data?.data?.description ?? 'Default Description'

      console.info(`Creating card with Title: ${title} and Description: ${description}`)

      const card = new AdaptiveCard(
        new TextBlock(
          'Custom Card Created',
          {
            weight: 'Bolder',
            size: 'Large',
            color: 'Good'
          }
        ),
        new TextBlock(
          title,
          {
            weight: 'Bolder',
            size: 'Medium'
          }
        ),
        new TextBlock(
          description,
          {
            wrap: true,
            isSubtle: true
          }
        )
      )

      card.$schema = 'http://adaptivecards.io/schemas/adaptive-card.json'

      const attachment = {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: card
      }

      return {
        composeExtension:
        {
          type: 'result',
          attachmentLayout: 'list',
          attachments: [attachment]
        }
      }
    })
    .onQueryLink(async (context: TurnContext, state: TurnState, link: string) : Promise<MessagingExtensionResult> => {
      console.info(`Link query received: ${link}`)
      if (link === '') {
        return {
          type: 'message',
          text: 'No URL provided'
        }
      }

      const card = new AdaptiveCard(
        new TextBlock(
          'Link Preview',
          {
            weight: 'Bolder',
            size: 'Medium'
          }
        ),
        new TextBlock(
          `URL: ${link}`,
          {
            isSubtle: true,
            wrap: true
          }
        ),
        new TextBlock(
          'This is a preview of the linked content generated by the message extension.',
          {
            wrap: true,
            size: 'Small'
          }
        )
      )

      card.$schema = 'http://adaptivecards.io/schemas/adaptive-card.json'

      const attachment = {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: card,
        preview: {
          contentType: 'application/vnd.microsoft.card.thumbnail',
          content: {
            title: 'Link Preview',
            text: link
          }
        }
      }

      return {
        type: 'result',
        attachmentLayout: 'list',
        attachments: [attachment]
      }
    })
    .onConfigurationQuerySettingUrl(async (context: TurnContext, state: TurnState, settings: any) : Promise<MessagingExtensionResponse> => {
      console.info('Query settings URL requested')
      return {
        composeExtension:
        {
          type: 'config',
          suggestedActions: {
            actions: [
              {
                type: ActionTypes.OpenUrl,
                value: 'https://lj781498-3978.usw3.devtunnels.ms/settings.html',
                title: 'Configure'
              }
            ]
          }
        }
      }
    })
    .onConfigurationSetting(async (context: TurnContext, state: TurnState, settings: any) : Promise<void> => {
      const settingsQuery = settings as MessagingExtensionQuery
      console.info(`Message extension settings submitted with state: ${settingsQuery.state}`)

      if (settingsQuery.state === 'CancelledByUser') {
        console.info('Cancelled by user')
      }
      // process settings data
    })
    .onFetchTask(async (context: TurnContext, state: TurnState) : Promise<TaskModuleResponse> => {
      console.info('Fetch MessageExtensions.Action requested')

      const pagedMembersResponse = await TeamsInfo.getPagedMembers(context, 100)
      const memberTextBlocks: TextBlock[] = []
      for (const member of pagedMembersResponse.members) {
        memberTextBlocks.push(
          new TextBlock(
            `${member.name} (${member.email})`,
            {
              wrap: true,
              isSubtle: true
            }
          )
        )
      }

      const card = new AdaptiveCard(...memberTextBlocks)

      const taskModuleContinueResponse: TaskModuleContinueResponse = {
        type: 'continue',
        value: {
          card: {
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: card
          }
        }
      }

      return {
        task: taskModuleContinueResponse
      }
    })
})

app.onActivity(() => { return Promise.resolve(true) }, async (context: TurnContext, state: TurnState) => {
  console.log('Received activity:', context.activity)
  await context.sendActivity(`Echo: ${context.activity.text}\n\nThis is a message extension agent. Use the message extension commands in Teams to test functionality.`)
})

const expressApp = myStartServer(
  app,
  {
    configureAdapter: (adapter) => {
      adapter.use(new SetTeamsApiClientMiddleware())
    }
  }
)

expressApp.use(express.static(path.join(__dirname, '../public')))
