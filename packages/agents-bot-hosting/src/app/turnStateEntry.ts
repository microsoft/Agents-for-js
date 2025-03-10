/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export class TurnStateEntry {
  private _value: Record<string, unknown>
  private _storageKey?: string
  private _deleted = false
  private _hash: string

  public constructor (value?: Record<string, unknown>, storageKey?: string) {
    this._value = value || {}
    this._storageKey = storageKey
    this._hash = JSON.stringify(this._value)
  }

  public get hasChanged (): boolean {
    return JSON.stringify(this._value) !== this._hash
  }

  public get isDeleted (): boolean {
    return this._deleted
  }

  public get value (): Record<string, unknown> {
    if (this.isDeleted) {
      this._value = {}
      this._deleted = false
    }

    return this._value
  }

  public get storageKey (): string | undefined {
    return this._storageKey
  }

  public delete (): void {
    this._deleted = true
  }

  public replace (value?: Record<string, unknown>): void {
    this._value = value || {}
  }
}
