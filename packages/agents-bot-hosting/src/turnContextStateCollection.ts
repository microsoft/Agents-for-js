/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
const TURN_STATE_SCOPE_CACHE = Symbol('turnStateScopeCache')

export class TurnContextStateCollection extends Map<any, any> {
  get<T = any>(key: any): T

  get (key: any): any

  get (key: any): unknown {
    return super.get(key)
  }

  push (key: any, value: any): void {
    const current = this.get(key)
    const cache: Map<any, any[]> = this.get(TURN_STATE_SCOPE_CACHE) || new Map<any, any[]>()
    if (cache.has(key)) {
      cache.get(key)?.push(current)
    } else {
      cache.set(key, [current])
    }

    if (value === undefined) {
      value = current
    }
    this.set(key, value)
    this.set(TURN_STATE_SCOPE_CACHE, cache)
  }

  pop (key: any): any {
    const current = this.get(key)

    let previous: any
    const cache: Map<any, any[]> = this.get(TURN_STATE_SCOPE_CACHE) || new Map<any, any[]>()
    if (cache.has(key)) {
      previous = cache.get(key)?.pop()
    }

    this.set(key, previous)
    this.set(TURN_STATE_SCOPE_CACHE, cache)

    return current
  }
}
