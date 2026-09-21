/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { INetworkModule, NetworkRequestOptions, NetworkResponse } from '@azure/msal-node'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { debug } from '@microsoft/agents-telemetry'
import { Errors } from '../../errorHelper'

const logger = debug('agents:msal')
const requestTimeoutStatus = 408

/**
 * The default number of retries made for an MSAL HTTP request.
 */
export const DEFAULT_MSAL_RETRY_COUNT = 2

/**
 * Converts a configured MSAL retry count to its effective runtime value.
 */
export function normalizeMsalRetryCount (retryCount: number | undefined): number {
  if (!Number.isFinite(retryCount)) {
    return DEFAULT_MSAL_RETRY_COUNT
  }

  return Math.max(0, Math.floor(retryCount as number))
}

/**
 * MSAL network client that retries responses with HTTP status 408 (Request Timeout).
 *
 * @remarks
 * `maxRetryCount` is the number of retries after the initial request. Responses with
 * any other status are returned immediately and retries have no additional delay.
 */
export class MsalHttpRetryHandlerHelper implements INetworkModule {
  private readonly maxRetryCount: number

  public constructor (
    private readonly networkClient: INetworkModule = new MsalHttpClient(),
    maxRetryCount: number = DEFAULT_MSAL_RETRY_COUNT
  ) {
    this.maxRetryCount = normalizeMsalRetryCount(maxRetryCount)
  }

  /**
   * Sends an HTTP GET request, retrying only Request Timeout responses.
   */
  public async sendGetRequestAsync<T> (
    url: string,
    options?: NetworkRequestOptions,
    timeout?: number
  ): Promise<NetworkResponse<T>> {
    return this.sendWithRetries(() => this.networkClient.sendGetRequestAsync<T>(url, options, timeout))
  }

  /**
   * Sends an HTTP POST request, retrying only Request Timeout responses.
   */
  public async sendPostRequestAsync<T> (
    url: string,
    options?: NetworkRequestOptions
  ): Promise<NetworkResponse<T>> {
    return this.sendWithRetries(() => this.networkClient.sendPostRequestAsync<T>(url, options))
  }

  private async sendWithRetries<T> (send: () => Promise<NetworkResponse<T>>): Promise<NetworkResponse<T>> {
    let response = await send()
    let attempt
    for (attempt = 0; response.status === requestTimeoutStatus && attempt < this.maxRetryCount; attempt++) {
      logger.debug('MSAL retry on request timeout (retry %d/%d)', attempt + 1, this.maxRetryCount)
      response = await send()
    }
    logger.debug('MSAL request completed with status %d after %d attempt(s)', response.status, attempt + 1)
    return response
  }
}

/**
 * Default MSAL-compatible network implementation. MSAL Node does not export its
 * built-in HTTP client, so the retry handler uses the same native fetch contract.
 */
class MsalHttpClient implements INetworkModule {
  public async sendGetRequestAsync<T> (
    url: string,
    options?: NetworkRequestOptions,
    timeout?: number
  ): Promise<NetworkResponse<T>> {
    return this.sendRequest<T>(url, 'GET', options, timeout)
  }

  public async sendPostRequestAsync<T> (
    url: string,
    options?: NetworkRequestOptions
  ): Promise<NetworkResponse<T>> {
    return this.sendRequest<T>(url, 'POST', options)
  }

  private async sendRequest<T> (
    url: string,
    method: 'GET' | 'POST',
    options?: NetworkRequestOptions,
    timeout?: number
  ): Promise<NetworkResponse<T>> {
    const controller = new AbortController()
    const timeoutId = timeout
      ? setTimeout(() => controller.abort(), timeout)
      : undefined

    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers: options?.headers,
        body: method === 'POST' ? options?.body : undefined,
        signal: controller.signal
      })
    } catch (error) {
      const innerException = error instanceof Error ? error : undefined
      if (innerException?.name === 'AbortError') {
        throw ExceptionHelper.generateException(Error, Errors.TokenRequestTimeout, innerException, { timeoutMs: String(timeout) })
      }
      throw ExceptionHelper.generateException(Error, Errors.MsalHttpRequestFailed, innerException, {
        message: innerException?.message ?? 'unknown'
      })
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }

    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      headers[key] = value
    })

    return {
      headers,
      body: await this.parseBody<T>(response),
      status: response.status
    }
  }

  private async parseBody<T> (response: Response): Promise<T> {
    const text = await response.text()

    try {
      return JSON.parse(text) as T
    } catch (error) {
      if (response.status === requestTimeoutStatus) {
        return {} as T
      }
      throw ExceptionHelper.generateException(
        Error,
        Errors.MsalResponseUnparsable,
        error instanceof Error ? error : undefined
      )
    }
  }
}
