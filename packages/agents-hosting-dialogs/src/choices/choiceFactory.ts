/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ActionTypes, Activity, CardAction, Channels, InputHints } from '@microsoft/agents-activity'
import {

  CardFactory,
  MessageFactory,
  TurnContext,
} from '@microsoft/agents-hosting'
import { Choice } from './choice'

/**
 * Additional options used to tweak the formatting of choice lists.
 */
export interface ChoiceFactoryOptions {
  /**
     * (Optional) character used to separate individual choices when there are more than 2 choices.
     * The default value is `", "`.
     */
  inlineSeparator?: string;

  /**
     * (Optional) separator inserted between the choices when their are only 2 choices. The default
     * value is `" or "`.
     */
  inlineOr?: string;

  /**
     * (Optional) separator inserted between the last 2 choices when their are more than 2 choices.
     * The default value is `", or "`.
     */
  inlineOrMore?: string;

  /**
     * (Optional) if `true`, inline and list style choices will be prefixed with the index of the
     * choice as in "1. choice". If `false`, the list style will use a bulleted list instead. The
     * default value is `true`.
     */
  includeNumbers?: boolean;
}

/**
 * A set of utility functions to assist with the formatting a 'message' activity containing a list
 * of choices.
 *
 */
export class ChoiceFactory {
  static readonly MAX_ACTION_TITLE_LENGTH = 20

  /**
     * Returns a 'message' activity containing a list of choices that has been automatically
     * formatted based on the capabilities of a given channel.
     *
     * @param channelOrContext Channel ID or context object for the current turn of conversation.
     * @param choices List of choices to render.
     * @param text (Optional) text of the message.
     * @param speak (Optional) SSML to speak for the message.
     * @param options (Optional) formatting options to use when rendering as a list.
     * @param conversationType (Optional) the type of the conversation.
     * @returns The created message activity.
     */
  static forChannel (
    channelOrContext: string | TurnContext,
    choices: (string | Choice)[],
    text?: string,
    speak?: string,
    options?: ChoiceFactoryOptions,
    conversationType?: string
  ): Activity {
    const channelId: string =
            typeof channelOrContext === 'string' ? channelOrContext : this.getChannelId(channelOrContext)

    const list: Choice[] = ChoiceFactory.toChoices(choices)

    let maxTitleLength = 0
    list.forEach((choice: Choice) => {
      const l: number = choice.action && choice.action.title ? choice.action.title.length : choice.value.length
      if (l > maxTitleLength) {
        maxTitleLength = l
      }
    })

    // Determine list style
    const supportsSuggestedActions: boolean = this.supportsSuggestedActions(channelId, choices.length, conversationType)
    const supportsCardActions = this.supportsCardActions(channelId, choices.length)
    const longTitles: boolean = maxTitleLength > this.MAX_ACTION_TITLE_LENGTH

    if (!longTitles && !supportsSuggestedActions && supportsCardActions) {
      // SuggestedActions is the preferred approach, but for channels that don't
      // support them (e.g. Teams) we should use a HeroCard with CardActions
      return ChoiceFactory.heroCard(list, text, speak)
    }

    if (!longTitles && supportsSuggestedActions) {
      // We always prefer showing choices using suggested actions. If the titles are too long, however,
      // we'll have to show them as a text list.
      return ChoiceFactory.suggestedActions(list, text, speak)
    }

    if (!longTitles && choices.length <= 3) {
      // If the titles are short and there are 3 or less choices we'll use an inline list.
      return ChoiceFactory.inline(list, text, speak, options)
    }

    // Show a numbered list.
    return ChoiceFactory.list(list, text, speak, options)
  }

  /**
     * Returns a 'message' activity containing a list of choices that has been formatted as an
     * inline list.
     *
     * @param choices List of choices to render.
     * @param text (Optional) text of the message.
     * @param speak (Optional) SSML to speak for the message.
     * @param options (Optional) formatting options to tweak rendering of list.
     * @returns The created message activity.
     */
  static inline (
    choices: (string | Choice)[],
    text?: string,
    speak?: string,
    options?: ChoiceFactoryOptions
  ): Activity {
    const opt: ChoiceFactoryOptions = {
      inlineSeparator: ', ',
      inlineOr: ' or ',
      inlineOrMore: ', or ',
      includeNumbers: true,
      ...options,
    } as ChoiceFactoryOptions

    let connector = ''
    let txt: string = text || ''
    txt += ' '
    ChoiceFactory.toChoices(choices).forEach((choice: any, index: number) => {
      const title: string = choice.action && choice.action.title ? choice.action.title : choice.value
      txt += `${connector}${opt.includeNumbers ? '(' + (index + 1).toString() + ') ' : ''}${title}`
      if (index === choices.length - 2) {
        connector = (index === 0 ? opt.inlineOr : opt.inlineOrMore) || ''
      } else {
        connector = opt.inlineSeparator || ''
      }
    })
    txt += ''

    return MessageFactory.text(txt, speak, InputHints.ExpectingInput)
  }

  /**
     * Returns a 'message' activity containing a list of choices that has been formatted as an
     * numbered or bulleted list.
     *
     * @param choices List of choices to render.
     * @param text (Optional) text of the message.
     * @param speak (Optional) SSML to speak for the message.
     * @param options (Optional) formatting options to tweak rendering of list.
     * @returns The created message activity.
     */
  static list (
    choices: (string | Choice)[],
    text?: string,
    speak?: string,
    options?: ChoiceFactoryOptions
  ): Activity {
    const opt: ChoiceFactoryOptions = {
      includeNumbers: true,
      ...options,
    } as ChoiceFactoryOptions

    let connector = ''
    let txt: string = text || ''
    txt += '\n\n   '
    ChoiceFactory.toChoices(choices).forEach((choice: any, index: number) => {
      const title: string = choice.action && choice.action.title ? choice.action.title : choice.value
      txt += `${connector}${opt.includeNumbers ? (index + 1).toString() + '. ' : '- '}${title}`
      connector = '\n   '
    })

    return MessageFactory.text(txt, speak, InputHints.ExpectingInput)
  }

  /**
     * Returns a 'message' activity containing a list of choices that has been formatted as suggested actions.
     *
     * @param choices List of choices to render.
     * @param text (Optional) Text of the message.
     * @param speak (Optional) SSML to speak for the message.
     * @returns The created message activity.
     */
  static suggestedActions (
    choices: (string | Choice)[],
    text?: string,
    speak?: string
  ): Activity {
    // Map choices to actions
    const actions: CardAction[] = ChoiceFactory.toChoices(choices).map<CardAction>((choice: Choice) => {
      if (choice.action) {
        return choice.action
      } else {
        return { type: ActionTypes.ImBack, value: choice.value, title: choice.value, channelData: undefined }
      }
    })

    // Return activity with choices as suggested actions
    return MessageFactory.suggestedActions(actions, text, speak, InputHints.ExpectingInput)
  }

  /**
     * Returns a 'message' activity that includes a list of choices that have been added as `HeroCard`'s.
     *
     * @param choices List of choices to render.
     * @param text (Optional) Text of the message.
     * @param speak (Optional) SSML to speak for the message.
     * @returns The created message activity with choices as a HeroCard with buttons.
     */
  static heroCard (
    choices: (string | Choice)[],
    text?: string,
    speak?: string
  ): Activity {
    const buttons: CardAction[] = ChoiceFactory.toChoices(choices).map<CardAction>((choice: Choice) => {
      if (choice.action) {
        return choice.action
      } else {
        return {
          title: choice.value,
          type: ActionTypes.ImBack,
          value: choice.value,
        }
      }
    })

    const attachment = CardFactory.heroCard(undefined, text, undefined, buttons)

    return MessageFactory.attachment(attachment, undefined, speak, InputHints.ExpectingInput) as Activity
  }

  /**
     * Takes a mixed list of `string` and `Choice` based choices and returns them as a `Choice[]`.
     *
     * @param choices List of choices to add.
     * @returns A list of choices.
     */
  static toChoices (choices: (string | Choice)[] | undefined): Choice[] {
    return (choices || [])
      .map((choice) => (typeof choice === 'string' ? { value: choice } : choice))
      .map((choice: Choice) => {
        const action = choice.action
        if (action) {
          action.type = action.type ? action.type : ActionTypes.ImBack
          if (!action.value && action.title) {
            action.value = action.title
          } else if (!action.title && action.value) {
            action.title = action.value
          } else if (!action.title && !action.value) {
            action.title = action.value = choice.value
          }
        }
        return choice
      })
      .filter((choice: Choice) => choice)
  }

  /**
   * @private
   * Determines if a number of Suggested Actions are supported by a Channel.
   * @param channelId The Channel to check if Suggested Actions are supported in.
   * @param buttonCnt Optional. The number of Suggested Actions to check for the Channel.
   * @param conversationType Optional.The type of the conversation.
   * @returns true if the Channel supports the buttonCnt total Suggested Actions, false if the Channel does not support that number of Suggested Actions.
   */
  private static supportsSuggestedActions (channelId: string, buttonCnt = 100, conversationType: string = ''): boolean {
    switch (channelId) {
      case Channels.Facebook:
      case Channels.Skype:
        return buttonCnt <= 10
      case Channels.Line:
        return buttonCnt <= 13
      case Channels.Telegram:
      case Channels.Emulator:
      case Channels.Directline:
      case Channels.Webchat:
      case Channels.DirectlineSpeech:
        return buttonCnt <= 100
      case Channels.Msteams:
        if (conversationType === 'personal') {
          return buttonCnt <= 3
        }
        return false
      default:
        return false
    }
  }

  /**
   * @private
   * Determines if a number of Card Actions are supported by a Channel.
   * @param channelId The Channel to check if the Card Actions are supported in.
   * @param buttonCnt Optional. The number of Card Actions to check for the Channel.
   * @returns true if the Channel supports the buttonCnt total Card Actions, false if the Channel does not support that number of Card Actions.
   */
  private static supportsCardActions (channelId: string, buttonCnt = 100): boolean {
    switch (channelId) {
      case Channels.Facebook:
      case Channels.Skype:
        return buttonCnt <= 3
      // any "msteams" channel regardless of subchannel since the switch is on channelId.Channel
      case Channels.Msteams:
        return buttonCnt <= 50
      case Channels.Line:
        return buttonCnt <= 99
      case Channels.Slack:
      case Channels.Telegram:
      case Channels.Emulator:
      case Channels.Directline:
      case Channels.DirectlineSpeech:
      case Channels.Webchat:
        return buttonCnt <= 100
      default:
        return false
    }
  }

  /**
 * @private
 * @param context a TurnContext object representing an incoming message.
 */
  private static getChannelId (context: TurnContext): string {
    return context.activity.channelId || ''
  }
}
