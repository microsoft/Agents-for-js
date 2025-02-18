/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TurnContext } from '../turnContext'
import { BotState } from './botState'

/**
 * Provides access to a bot state property.
 */
export class BotStatePropertyAccessor<T = any> {
  /**
   * Creates a new instance of BotStatePropertyAccessor.
   * @param botState The bot state.
   * @param name The name of the property.
   */
  constructor (protected readonly state: BotState, public readonly name: string) { }

  async delete (context: TurnContext): Promise<void> {
    const obj: any = await this.state.load(context)
    if (Object.prototype.hasOwnProperty.call(obj, this.name)) {
      delete obj[this.name]
    }
  }

  async get (context: TurnContext, defaultValue?: T): Promise<T> {
    const obj: any = await this.state.load(context)
    if (!Object.prototype.hasOwnProperty.call(obj, this.name) && defaultValue !== undefined) {
      const clone: any =
        typeof defaultValue === 'object' || Array.isArray(defaultValue)
          ? JSON.parse(JSON.stringify(defaultValue))
          : defaultValue
      obj[this.name] = clone
    }

    return obj[this.name]
  }

  async set (context: TurnContext, value: T): Promise<void> {
    const obj: any = await this.state.load(context)
    obj[this.name] = value
  }
}
