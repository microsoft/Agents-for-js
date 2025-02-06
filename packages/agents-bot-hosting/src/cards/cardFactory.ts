/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ActionTypes, Attachment, CardAction } from '@microsoft/agents-activity-schema'
import { MediaUrl } from './mediaUrl'
import { AnimationCard } from './animationCard'
import { AudioCard } from './audioCard'
import { HeroCard } from './heroCard'
import { ReceiptCard } from './receiptCard'
import { O365ConnectorCard } from './o365ConnectorCard'
import { ThumbnailCard } from './thumbnailCard'
import { VideoCard } from './videoCard'
import { CardImage } from './cardImage'
import { OAuthCard } from '../oauth/oauthCard'
import { SigningResource } from '../oauth/signingResource'

export class CardFactory {
  static contentTypes: any = {
    adaptiveCard: 'application/vnd.microsoft.card.adaptive',
    animationCard: 'application/vnd.microsoft.card.animation',
    audioCard: 'application/vnd.microsoft.card.audio',
    heroCard: 'application/vnd.microsoft.card.hero',
    receiptCard: 'application/vnd.microsoft.card.receipt',
    o365ConnectorCard: 'application/vnd.microsoft.teams.card.o365connector',
    thumbnailCard: 'application/vnd.microsoft.card.thumbnail',
    videoCard: 'application/vnd.microsoft.card.video',
    oauthCard: 'application/vnd.microsoft.card.oauth',
    signinCard: 'application/vnd.microsoft.card.signin',
  }

  static adaptiveCard (card: any): Attachment {
    return { contentType: CardFactory.contentTypes.adaptiveCard, content: card }
  }

  static animationCard (
    title: string,
    media: (MediaUrl | string)[],
    buttons?: (CardAction | string)[],
    other?: Partial<AnimationCard>
  ): Attachment {
    return CardFactory.mediaCard(CardFactory.contentTypes.animationCard, title, media, buttons, other)
  }

  static audioCard (
    title: string,
    media: (MediaUrl | string)[],
    buttons?: (CardAction | string)[],
    other?: Partial<AudioCard>
  ): Attachment {
    return CardFactory.mediaCard(CardFactory.contentTypes.audioCard, title, media, buttons, other)
  }

  static heroCard (title: string, text?: any, images?: any, buttons?: any, other?: Partial<HeroCard>): Attachment {
    const a: Attachment = CardFactory.thumbnailCard(title, text, images, buttons, other)
    a.contentType = CardFactory.contentTypes.heroCard
    return a
  }

  static receiptCard (card: ReceiptCard): Attachment {
    return { contentType: CardFactory.contentTypes.receiptCard, content: card }
  }

  static o365ConnectorCard (card: O365ConnectorCard): Attachment {
    return { contentType: CardFactory.contentTypes.o365ConnectorCard, content: card }
  }

  static thumbnailCard (
    title: string,
    text?: any,
    images?: any,
    buttons?: any,
    other?: Partial<ThumbnailCard>
  ): Attachment {
    if (typeof text !== 'string') {
      other = buttons
      buttons = images
      images = text
      text = undefined
    }
    const card: Partial<ThumbnailCard> = { ...other }
    if (title) {
      card.title = title
    }
    if (text) {
      card.text = text
    }
    if (images) {
      card.images = CardFactory.images(images)
    }
    if (buttons) {
      card.buttons = CardFactory.actions(buttons)
    }

    return { contentType: CardFactory.contentTypes.thumbnailCard, content: card }
  }

  static videoCard (
    title: string,
    media: (MediaUrl | string)[],
    buttons?: (CardAction | string)[],
    other?: Partial<VideoCard>
  ): Attachment {
    return CardFactory.mediaCard(CardFactory.contentTypes.videoCard, title, media, buttons, other)
  }

  static images (images: (CardImage | string)[] | undefined): CardImage[] {
    const list: CardImage[] = [];
    (images || []).forEach((img: CardImage | string) => {
      if (typeof img === 'object') {
        list.push(img)
      } else {
        list.push({ url: img })
      }
    })

    return list
  }

  static actions (actions: (CardAction | string)[] | undefined): CardAction[] {
    const list: CardAction[] = [];
    (actions || []).forEach((a: CardAction | string) => {
      if (typeof a === 'object') {
        list.push(a)
      } else {
        list.push({
          type: ActionTypes.ImBack,
          value: a.toString(),
          title: a.toString(),
          channelData: undefined,
        })
      }
    })

    return list
  }

  static oauthCard (connectionName: string, title: string, text: string, signingResource: SigningResource) : Attachment {
    const card: Partial<OAuthCard> = {
      buttons: [{ type: ActionTypes.Signin, title, value: signingResource.singingLink, channelData: undefined }],
      connectionName,
      tokenExchangeResource: signingResource.tokenExchangeResource,
      tokenPostResource: signingResource.tokenPostResource,
    }
    if (text) {
      card.text = text
    }

    return { contentType: CardFactory.contentTypes.oauthCard, content: card }
  }

  static media (links: (MediaUrl | string)[] | undefined): MediaUrl[] {
    const list: MediaUrl[] = [];
    (links || []).forEach((lnk: MediaUrl | string) => {
      if (typeof lnk === 'object') {
        list.push(lnk)
      } else {
        list.push({ url: lnk })
      }
    })

    return list
  }

  private static mediaCard (
    contentType: string,
    title: string,
    media: (MediaUrl | string)[],
    buttons?: (CardAction | string)[],
    other?: any
  ): Attachment {
    const card: VideoCard = { ...other }
    if (title) {
      card.title = title
    }
    card.media = CardFactory.media(media)
    if (buttons) {
      card.buttons = CardFactory.actions(buttons)
    }

    return { contentType, content: card }
  }
}
