import {
  ActionTypes,
  Activity,
  ActivityTypes,
  Attachment,
} from '@microsoft/agents-activity'
import {
  CardFactory
} from '@microsoft/agents-hosting'

export function createHeroCardActivity (text: string): Activity {
  const activity = new Activity(ActivityTypes.Message)
  activity.attachments = [
    {
      contentType: 'application/vnd.microsoft.card.hero',
      content: {
        text
      }
    }
  ]

  return activity
}

export function createCard (title: string): Attachment {
  return CardFactory.heroCard(
    title,
    undefined,
    undefined,
    [
      {
        type: ActionTypes.MessageBack,
        title: 'Message all members',
        text: '/messageall'
      },
      {
        type: ActionTypes.MessageBack,
        title: 'Mention Me',
        text: '/atmention'
      },
      {
        type: ActionTypes.MessageBack,
        title: 'Delete Card',
        text: '/delete'
      },
      {
        type: ActionTypes.MessageBack,
        title: 'Send Targeted',
        text: '/targeted'
      }
    ]
  )
}
