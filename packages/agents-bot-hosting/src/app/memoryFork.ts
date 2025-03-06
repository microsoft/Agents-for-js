/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const TEMP_SCOPE = 'temp'

export interface Memory {
  deleteValue(path: string): void;

  hasValue(path: string): boolean;

  getValue<TValue = unknown>(path: string): TValue;

  setValue(path: string, value: unknown): void;
}

export class MemoryFork implements Memory {
  private readonly _fork: Record<string, Record<string, unknown>> = {}
  private readonly _memory: Memory

  public constructor (memory: Memory) {
    this._memory = memory
  }

  public deleteValue (path: string): void {
    const { scope, name } = this.getScopeAndName(path)
    if (
      Object.prototype.hasOwnProperty.call(this._fork, scope) &&
            Object.prototype.hasOwnProperty.call(this._fork[scope], name)
    ) {
      delete this._fork[scope][name]
    }
  }

  public hasValue (path: string): boolean {
    const { scope, name } = this.getScopeAndName(path)
    if (Object.prototype.hasOwnProperty.call(this._fork, scope)) {
      return Object.prototype.hasOwnProperty.call(this._fork[scope], name)
    } else {
      return this._memory.hasValue(path)
    }
  }

  public getValue<TValue = unknown>(path: string): TValue {
    const { scope, name } = this.getScopeAndName(path)
    if (Object.prototype.hasOwnProperty.call(this._fork, scope)) {
      if (Object.prototype.hasOwnProperty.call(this._fork[scope], name)) {
        return this._fork[scope][name] as TValue
      }
    }

    return this._memory.getValue(path)
  }

  public setValue (path: string, value: unknown): void {
    const { scope, name } = this.getScopeAndName(path)
    if (!Object.prototype.hasOwnProperty.call(this._fork, scope)) {
      this._fork[scope] = {}
    }

    this._fork[scope][name] = value
  }

  private getScopeAndName (path: string): { scope: string; name: string } {
    const parts = path.split('.')
    if (parts.length > 2) {
      throw new Error(`Invalid state path: ${path}`)
    } else if (parts.length === 1) {
      parts.unshift(TEMP_SCOPE)
    }

    return { scope: parts[0], name: parts[1] }
  }
}
