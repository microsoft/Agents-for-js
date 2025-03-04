/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  ActionTypes,
  Activity,
  CardAction,
  CardFactory,
  InputHints,
  MessageFactory,
  TurnContext,
} from '@microsoft/agents-bot-hosting'
import { Choice } from './choice'
import * as channel from './channel'

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
     * @returns The created message activity.
     */
  static forChannel (
    channelOrContext: string | TurnContext,
    choices: (string | Choice)[],
    text?: string,
    speak?: string,
    options?: ChoiceFactoryOptions
  ): Partial<Activity> {
    const channelId: string = typeof channelOrContext === 'string' ? channelOrContext : channelOrContext.activity.channelId ?? ''

    const list: Choice[] = ChoiceFactory.toChoices(choices)

    let maxTitleLength = 0
    list.forEach((choice: Choice) => {
      const l: number = choice.action && choice.action.title ? choice.action.title.length : choice.value.length
      if (l > maxTitleLength) {
        maxTitleLength = l
      }
    })

    const supportsSuggestedActions: boolean = channel.supportsSuggestedActions(channelId, choices.length)
    const supportsCardActions = channel.supportsCardActions(channelId, choices.length)
    const longTitles: boolean = maxTitleLength > this.MAX_ACTION_TITLE_LENGTH
    if (!longTitles && !supportsSuggestedActions && supportsCardActions) {
      // SuggestedActions is the preferred approach, but for channels that don't
      // support them (e.g. Teams, Slack) we should use a HeroCard with CardActions
      return ChoiceFactory.heroCard(list, text, speak)
    } else if (!longTitles && supportsSuggestedActions) {
      // We always prefer showing choices using suggested actions. If the titles are too long, however,
      // we'll have to show them as a text list.
      return ChoiceFactory.suggestedAction(list, text, speak)
    } else if (!longTitles && choices.length <= 3) {
      // If the titles are short and there are 3 or less choices we'll use an inline list.
      return ChoiceFactory.inline(list, text, speak, options)
    } else {
      return ChoiceFactory.list(list, text, speak, options)
    }
  }

  /**
     * Creates a message Activity that includes a Choice list that have been added as `HeroCard`'s.
     *
     * @param choices Optional. The Choice list to add.
     * @param text Optional. Text of the message.
     * @param speak Optional. SSML text to be spoken by the bot on a speech-enabled channel.
     * @returns An Activity with choices as `HeroCard` with buttons.
     */
  static heroCard (choices: (string | Choice)[] = [], text = '', speak = ''): Activity {
    const buttons: CardAction[] = ChoiceFactory.toChoices(choices).map(
      (choice) =>
        ({
          title: choice.value,
          type: ActionTypes.ImBack,
          value: choice.value,
        }) as CardAction
    )
    const attachment = CardFactory.heroCard('', text, undefined, buttons)

    return MessageFactory.attachment(attachment, undefined, speak, InputHints.ExpectingInput)
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
  ): Partial<Activity> {
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
  ): Partial<Activity> {
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
     * Returns a 'message' activity containing a list of choices that have been added as suggested
     * actions.
     *
     * @param choices List of choices to add.
     * @param text (Optional) text of the message.
     * @param speak (Optional) SSML to speak for the message.
     * @returns An activity with choices as suggested actions.
     */
  static suggestedAction (choices: (string | Choice)[], text?: string, speak?: string): Partial<Activity> {
    const actions: CardAction[] = ChoiceFactory.toChoices(choices).map<CardAction>((choice: Choice) => {
      if (choice.action) {
        return choice.action
      } else {
        return { type: ActionTypes.ImBack, value: choice.value, title: choice.value, channelData: undefined }
      }
    })

    return MessageFactory.suggestedActions(actions, text, speak, InputHints.ExpectingInput)
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
}
