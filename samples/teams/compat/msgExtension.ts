import { ActionTypes, Attachment, CardAction } from '@microsoft/agents-activity'
import { CardFactory, CardImage, HeroCard, ThumbnailCard, TurnContext } from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-express'
import { MessagingExtensionAttachment, MessagingExtensionQuery, MessagingExtensionResponse, TeamsActivityHandler } from '@microsoft/agents-hosting-extensions-teams'

class MsgExtension extends TeamsActivityHandler {
  constructor () {
    super()
    this.onMembersAdded(async (context, next) => {
      const membersAdded = context.activity.membersAdded
      for (const member of membersAdded!) {
        if (member.id !== context.activity.recipient!.id) {
          await context.sendActivity('Welcome to the Teams bot!')
        }
      }
      await next()
    })

    this.onMessage(async (context, next) => {
      await context.sendActivity(`You said: ${context.activity.text}`)
      await next()
    })
  }

  async handleTeamsMessagingExtensionQuery (
    context: TurnContext,
    query: MessagingExtensionQuery
  ): Promise<MessagingExtensionResponse> {
    const text = query?.parameters?.at(0)?.value
    const packages = await this.findPackages(text)
    // We take every row of the results and wrap them in cards wrapped in MessagingExtensionAttachment objects.
    // The Preview is optional, if it includes a Tap, that will trigger the OnTeamsMessagingExtensionSelectItem event back on this agent.
    const attachments: MessagingExtensionAttachment[] = packages.map(({ item1, item2, item3, item4, item5 }) => {
      const cardValue = `{"packageId": "${item1}", "version": "${item2}", "description": "${item3}", "projectUrl": "${item4}", "iconUrl": "${item5}"}`

      const cardAction: CardAction = {
        type: 'invoke',
        value: cardValue,
        title: item1
      }
      const previewCard: Partial<ThumbnailCard> = {
        title: item1,
        tap: cardAction
      }

      if (item5) {
        const cardImage: CardImage = {
          url: item5,
          alt: 'icon'
        }
        previewCard.images = [cardImage]
      }

      const heroCard: Partial<HeroCard> = {
        title: item1
      }

      const attachment: Attachment = {
        content: previewCard,
        contentType: 'application/vnd.microsoft.card.thumbnail'
      }

      const messagingExtensionAttachment: MessagingExtensionAttachment = {
        contentType: CardFactory.contentTypes.heroCard,
        content: heroCard,
        preview: attachment
      }

      return messagingExtensionAttachment
    })

    return {
      composeExtension: {
        attachmentLayout: 'list',
        type: 'result',
        attachments
      }
    }
  }

  async handleTeamsMessagingExtensionSelectItem (_context: TurnContext, _query: any): Promise<MessagingExtensionResponse> {
    const packageId = _query['packageId']
    const version = _query['version']
    const description = _query['description']
    const projectUrl = _query['projectUrl']
    const iconUrl = _query['iconUrl']

    const buttons: CardAction[] = [
      {
        type: ActionTypes.OpenUrl,
        title: 'Nuget Package',
        value: `https://www.nuget.org/packages/${packageId}`
      },
      {
        type: ActionTypes.OpenUrl,
        title: 'Project',
        value: projectUrl
      }
    ]

    const card: Partial<ThumbnailCard> = {
      title: `${packageId}, ${version}`,
      subtitle: description,
      buttons
    }

    if (iconUrl) {
      card.images = [{
        url: iconUrl,
        alt: 'Icon'
      }]
    }

    const attachment: MessagingExtensionAttachment = {
      contentType: 'application/vnd.microsoft.card.thumbnail',
      content: card
    }

    return {
      composeExtension: {
        attachmentLayout: 'list',
        type: 'result',
        attachments: [attachment]
      }
    }
  }

  async findPackages (text: string): Promise<[{ item1: string, item2: string, item3: string, item4: string, item5: string }]> {
    const response = await fetch(`https://azuresearch-usnc.nuget.org/query?q=id:${text}&prerelease=true`)
    const status = response.status

    if (status !== 200) {
      return [{ item1: '', item2: '', item3: '', item4: '', item5: '' }]
    } else {
      const jsonValues: any = await response.json()
      const items = jsonValues['data']
      return items.map((item: any) => {
        return { item1: item['id'], item2: item['version'], item3: item['description'], item4: item['projectUrl'], item5: item['iconUrl'] }
      })
    }
  }
}
startServer(new MsgExtension())
