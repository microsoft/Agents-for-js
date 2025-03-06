/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TurnContext } from '../turnContext'
import { TurnState } from './turnState'
import { TurnStateEntry } from './turnStateEntry'

export class TurnStateProperty<T = any> {
  private readonly _state: TurnStateEntry
  private readonly _propertyName: string

  public constructor (state: TurnState, scopeName: string, propertyName: string) {
    this._propertyName = propertyName

    const scope = state.getScope(scopeName)
    if (!scope) {
      throw new Error(`TurnStateProperty: TurnState missing state scope named "${scope}".`)
    }

    this._state = scope
    if (!this._state) {
      throw new Error(`TurnStateProperty: TurnState missing state scope named "${scope}".`)
    }
  }

  public deleteAsync (): Promise<void> {
    this._state.value[this._propertyName] = undefined
    return Promise.resolve()
  }

  public getAsync (context: TurnContext): Promise<T | undefined>
  public getAsync (context: TurnContext, defaultValue: T): Promise<T>
  public getAsync (defaultValue?: unknown): Promise<T | undefined> | Promise<T> {
    if (this._state.value[this._propertyName] === undefined) {
      this._state.value[this._propertyName] = defaultValue
    }

    return Promise.resolve(this._state.value[this._propertyName] as T)
  }

  public setAsync (context: TurnContext, value: T): Promise<void> {
    this._state.value[this._propertyName] = value
    return Promise.resolve()
  }
}
