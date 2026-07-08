/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ExceptionHelper } from '@microsoft/agents-activity'
import { Readable } from 'node:stream'
import { Errors } from './errorHelper'

/**
 * Configuration for an HTTP request.
 */
export interface HttpRequestConfig {
  method: string
  url: string
  headers?: Record<string, string>
  data?: unknown
  params?: Record<string, string | undefined>
  responseType?: 'json' | 'arraybuffer' | 'stream'
  timeout?: number
  signal?: AbortSignal
}

/**
 * Represents an HTTP response.
 */
export interface HttpResponse<T = unknown> {
  data: T
  status: number
  statusText: string
  headers: Headers
  config: HttpRequestConfig
}

/**
 * Options for creating an HttpClient instance.
 */
export interface HttpClientOptions {
  baseURL?: string
  headers?: Record<string, string>
}

/**
 * A lightweight HTTP client built on native fetch.
 */
export class HttpClient {
  private _baseURL: string
  private _defaultHeaders: Record<string, string>

  constructor (options: HttpClientOptions = {}) {
    this._baseURL = options.baseURL ?? ''
    this._defaultHeaders = this.normalizeHeaders(options.headers)
  }

  get baseURL (): string {
    return this._baseURL
  }

  get defaultHeaders (): Record<string, string> {
    return this._defaultHeaders
  }

  set defaultHeaders (headers: Record<string, string>) {
    this._defaultHeaders = this.normalizeHeaders(headers)
  }

  setHeader (name: string, value: string): void {
    this._defaultHeaders[name.toLowerCase()] = value
  }

  async request<T = unknown> (config: HttpRequestConfig): Promise<HttpResponse<T>> {
    const url = this.buildUrl(config.url, config.params)
    const headers = this.normalizeHeaders({ ...this._defaultHeaders, ...config.headers })
    const requestHeaders = new Headers(headers)
    const fetchOptions: RequestInit = {
      method: config.method.toUpperCase(),
      headers: requestHeaders,
      signal: config.signal ??
    (config.timeout ? AbortSignal.timeout(config.timeout) : undefined)
    }

    if (config.data !== undefined && config.data !== null) {
      const contentType = requestHeaders.get('content-type') ?? ''
      if (contentType.includes('application/x-www-form-urlencoded')) {
        fetchOptions.body = new URLSearchParams(config.data as Record<string, string>).toString()
      } else if (config.data instanceof URLSearchParams) {
        if (!contentType) {
          requestHeaders.set('content-type', 'application/x-www-form-urlencoded;charset=utf-8')
        }
        fetchOptions.body = config.data.toString()
      } else if (typeof config.data === 'string') {
        fetchOptions.body = config.data
      } else if (config.data instanceof Uint8Array || config.data instanceof ArrayBuffer ||
            config.data instanceof Blob || config.data instanceof FormData ||
            config.data instanceof ReadableStream) {
        fetchOptions.body = config.data
      } else {
        if (!contentType) {
          requestHeaders.set('content-type', 'application/json')
        }
        fetchOptions.body = JSON.stringify(config.data)
      }
    }

    const response = await fetch(url, fetchOptions)

    let data: T
    if (config.responseType === 'stream') {
      if (!response.ok) {
        data = await response.text() as T
      } else {
        data = Readable.fromWeb(response.body ?? new ReadableStream()) as T
      }
    } else if (config.responseType === 'arraybuffer') {
      data = await response.arrayBuffer() as T
    } else {
      const text = await response.text()
      try {
        data = JSON.parse(text) as T
      } catch {
        data = text as T
      }
    }

    const httpResponse: HttpResponse<T> = {
      data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      config,
    }

    if (!response.ok) {
      const error: HttpError = new HttpError(
        `Request failed with status ${response.status}`,
        httpResponse,
        config
      )
      throw error
    }

    return httpResponse
  }

  async get<T = unknown> (url: string, options?: Partial<HttpRequestConfig>): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'get', url, ...options })
  }

  private buildUrl (path: string, params?: Record<string, string | undefined>): string {
    let url: string
    if (path.startsWith('http://') || path.startsWith('https://')) {
      url = path
    } else {
      if (!this._baseURL) {
        throw ExceptionHelper.generateException(Error, Errors.HttpClientRelativeUrlRequiresBaseUrl, undefined, { url: path })
      }

      const base = this._baseURL.endsWith('/') ? this._baseURL.slice(0, -1) : this._baseURL
      const cleanPath = path.startsWith('/') ? path : `/${path}`
      url = `${base}${cleanPath}`
    }

    if (params) {
      const searchParams = new URLSearchParams()
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          searchParams.set(key, value)
        }
      }
      const queryString = searchParams.toString()
      if (queryString) {
        url += `${url.includes('?') ? '&' : '?'}${queryString}`
      }
    }

    return url
  }

  private normalizeHeaders (headers?: Record<string, string>): Record<string, string> {
    if (!headers) {
      return {}
    }

    return Object.entries(headers).reduce((normalized, [name, value]) => {
      normalized[name.toLowerCase()] = value
      return normalized
    }, {} as Record<string, string>)
  }
}

/**
 * Error thrown when an HTTP request fails.
 */
export class HttpError extends Error {
  public readonly response: HttpResponse
  public readonly config: HttpRequestConfig
  public readonly status: number

  constructor (message: string, response: HttpResponse, config: HttpRequestConfig) {
    super(message)
    this.name = 'HttpError'
    this.response = response
    this.config = config
    this.status = response.status
  }

  toJSON (): Record<string, unknown> {
    return {
      message: this.message,
      status: this.status,
      config: {
        url: this.config.url,
        method: this.config.method,
        data: this.config.data,
      },
      response: {
        status: this.response.status,
        statusText: this.response.statusText,
        data: this.response.data,
      },
    }
  }
}
