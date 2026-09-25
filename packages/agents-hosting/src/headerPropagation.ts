/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from './errorHelper'

/**
 * A class that implements the HeaderPropagationCollection interface.
 * It filters the incoming request headers based on the definition provided and loads them into the outgoing headers collection.
 */
export class HeaderPropagation implements HeaderPropagationCollection {
  private _keys: string[] = []
  private _incomingRequests: Record<string, string>
  private _outgoingHeaders: Record<string, string> = {}

  private _protectedHeaders = ['x-ms-correlation-id']

  public get incoming (): Record<string, string> {
    return this._incomingRequests
  }

  public get outgoing (): Record<string, string> {
    return this._outgoingHeaders
  }

  constructor (headers: Record<string, string | string[] | undefined>) {
    if (!headers) {
      throw ExceptionHelper.generateException(Error, Errors.HeadersRequired)
    }

    this._incomingRequests = this.normalizeHeaders(headers)

    // Ensure protected headers are propagated from incoming to outgoing by default without allowing modifications.
    const protectedHeaders = [...this._protectedHeaders]
    this._protectedHeaders = [] // Temporarily clear protected headers to allow propagation without restriction
    this.propagate(protectedHeaders)
    this._protectedHeaders = protectedHeaders // Restore protected headers list after propagation
  }

  propagate (headers: string[]) {
    this.process(headers.map(h => [h, '']), key => {
      if (this._incomingRequests[key] && !this._outgoingHeaders[key]) {
        this._outgoingHeaders[key] = this._incomingRequests[key]
      }
    })
  }

  add (headers: Record<string, string>) {
    this.process(Object.entries(headers ?? {}), (key, value) => {
      if (!this._incomingRequests[key] && !this._outgoingHeaders[key]) {
        this._outgoingHeaders[key] = value
      }
    })
  }

  concat (headers: Record<string, string>) {
    this.process(Object.entries(headers ?? {}), (key, value) => {
      if (this._incomingRequests[key] || this._outgoingHeaders[key]) {
        this._outgoingHeaders[key] = `${this._outgoingHeaders[key] ?? this._incomingRequests[key]} ${value}`.trim()
      }
    })
  }

  override (headers: Record<string, string>) {
    this.process(Object.entries(headers ?? {}), (key, value) => {
      this._outgoingHeaders[key] = value
    })
  }

  key (key: string) {
    return this._keys.find(k => k.toLowerCase() === key.toLowerCase())
  }

  /**
   * A helper method to process headers based on a provided callback function. It iterates over the headers and applies the callback to each header key and value.
   * @param headers An array of header key-value pairs to process.
   * @param callback A function that takes a header key and value, allowing for custom processing logic to be applied to each header.
   */
  private process (headers: [string, string][], callback: (key: string, value: string) => void) {
    for (const [key, value] of headers) {
      const savedKey = this.key(key)
      const realKey = savedKey ?? key
      if (!savedKey) {
        this._keys.push(realKey)
      }
      if (!this._protectedHeaders.includes(key.toLowerCase())) {
        callback(realKey, value)
      }
    }
  }

  /**
   * Normalizes the headers by ensuring the values are strings.
   * @param headers The headers to normalize.
   * @returns A new object with normalized headers.
   */
  private normalizeHeaders (headers: Record<string, string | string[] | undefined>) {
    return Object.entries(headers).reduce((acc, [key, value]) => {
      if (value) {
        acc[key] = Array.isArray(value) ? value.join(' ') : value
        if (!this._keys.includes(key)) {
          this._keys.push(key) // Store the original casing of the header keys
        }
      }
      return acc
    }, {} as Record<string, string>)
  }
}

/**
 * A function type that defines how headers should be propagated.
 */
export interface HeaderPropagationDefinition {
  (headers: HeaderPropagationCollection): void
}

/**
 * Defines the interface for managing header propagation.
 */
export interface HeaderPropagationCollection {
  /**
   * The collection of incoming headers from the incoming request.
   *
   * @remarks
   * This collection is built based on the headers received in the request.
   */
  incoming: Record<string, string>
  /**
   * The collection of headers that will be propagated to outgoing requests.
   *
   * @remarks
   * This collection is built based on the incoming headers and the definition provided.
   */
  outgoing: Record<string, string>
  /**
   * Propagates the incoming header value to the outgoing collection based on the header definition key.
   * @param headers List of header keys to propagate.
   *
   * @remarks
   * If the header does not exist in the incoming headers, it will be ignored.
   */
  propagate(headers: string[]): void
  /**
   * Adds a header definition to the outgoing collection.
   * @param headers Headers to add to the outgoing collection.
   *
   * @remarks
   * If the header already exists, it will not be added.
   */
  add(headers: Record<string, string>): void
  /**
   * Concatenates a header definition to the outgoing collection.
   * @param headers Headers to concatenate to the outgoing collection.
   *
   * @remarks
   * If the header does not exist in the incoming headers, it will be ignored. Unless the header is already present in the outgoing collection.
   */
  concat(headers: Record<string, string>): void
  /**
   * Overrides a header definition in the outgoing collection.
   * @param headers Headers to override in the outgoing collection.
   *
   * @remarks
   * If the header does not exist in the incoming headers, it will be added to the outgoing collection.
   */
  override(headers: Record<string, string>): void
  /**
   * Resolves the actual header key in a case-insensitive manner.
   * This is useful for ensuring that headers are accessed correctly regardless of their case in the incoming request.
   * @param key The header key to resolve.
   * @returns The resolved header key or undefined if not found.
   */
  key?(key: string): string | undefined
}
