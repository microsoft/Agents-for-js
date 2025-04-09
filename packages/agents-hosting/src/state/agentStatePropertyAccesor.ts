/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TurnContext } from '../turnContext'
import { AgentState, CustomKey } from './agentState'

export interface StatePropertyAccessor<T = any> {
  /**
   * Deletes the persisted property from its backing storage object.
   *
   * @remarks
   * The properties backing storage object SHOULD be loaded into memory on first access.
   *
   * ```JavaScript
   * await myProperty.delete(context);
   * ```
   * @param context Context for the current turn of conversation with the user.
   */
  delete(context: TurnContext): Promise<void>;

  /**
   * Reads a persisted property from its backing storage object.
   *
   * @remarks
   * The properties backing storage object SHOULD be loaded into memory on first access.
   *
   * If the property does not currently exist on the storage object and a `defaultValue` has been
   * specified, a clone of the `defaultValue` SHOULD be copied to the storage object. If a
   * `defaultValue` has not been specified then a value of `undefined` SHOULD be returned.
   *
   * ```JavaScript
   * const value = await myProperty.get(context, { count: 0 });
   * ```
   * @param context Context for the current turn of conversation with the user.
   */
  get(context: TurnContext): Promise<T | undefined>;

  /**
   * Reads a persisted property from its backing storage object.
   *
   * @param context Context for the current turn of conversation with the user.
   * @param defaultValue (Optional) default value to copy to the backing storage object if the property isn't found.
   */
  get(context: TurnContext, defaultValue: T): Promise<T>;

  /**
   * Assigns a new value to the properties backing storage object.
   *
   * @remarks
   * The properties backing storage object SHOULD be loaded into memory on first access.
   *
   * Depending on the state systems implementation, an additional step may be required to
   * persist the actual changes to disk.
   *
   * ```JavaScript
   * await myProperty.set(context, value);
   * ```
   * @param context Context for the current turn of conversation with the user.
   * @param value Value to assign.
   */
  set(context: TurnContext, value: T): Promise<void>;
}

/**
 * Provides access to an Agent state property.
 */
export class AgentStatePropertyAccessor<T = any> implements StatePropertyAccessor<T> {
  /**
   * Creates a new instance of AgentStatePropertyAccessor.
   * @param state The agent state.
   * @param name The name of the property.
   */
  constructor (protected readonly state: AgentState, public readonly name: string) { }

  /**
   * Deletes the property from the state.
   * @param context The turn context.
   * @returns A promise that resolves when the delete operation is complete.
   */
  async delete (context: TurnContext, customKey?: CustomKey): Promise<void> {
    const obj: any = await this.state.load(context, false, customKey)
    if (Object.prototype.hasOwnProperty.call(obj, this.name)) {
      delete obj[this.name]
    }
  }

  /**
   * Gets the value of the property from the state.
   * @param context The turn context.
   * @param defaultValue The default value to return if the property is not found.
   * @returns A promise that resolves to the value of the property.
   */
  async get (context: TurnContext, defaultValue?: T, customKey?: CustomKey): Promise<T> {
    const obj: any = await this.state.load(context, false, customKey)
    if (!Object.prototype.hasOwnProperty.call(obj, this.name) && defaultValue !== undefined) {
      const clone: any =
        typeof defaultValue === 'object' || Array.isArray(defaultValue)
          ? JSON.parse(JSON.stringify(defaultValue))
          : defaultValue
      obj[this.name] = clone
    }

    return obj[this.name]
  }

  /**
   * Sets the value of the property in the state.
   * @param context The turn context.
   * @param value The value to set.
   * @returns A promise that resolves when the set operation is complete.
   */
  async set (context: TurnContext, value: T, customKey?: CustomKey): Promise<void> {
    const obj: any = await this.state.load(context, false, customKey)
    obj[this.name] = value
  }
}
