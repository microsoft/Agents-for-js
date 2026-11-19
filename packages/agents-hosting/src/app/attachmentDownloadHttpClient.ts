/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ExceptionHelper } from '@microsoft/agents-activity'
import { debug } from '@microsoft/agents-telemetry'
import { Errors } from '../errorHelper'
import { HttpClient, HttpError, HttpResponse } from '../httpClient'
import { OutboundHostValidator, OutboundUrlPolicy } from '../outboundHostValidator'
import { getHttpsUrl, hasAllowedOutboundAddresses } from '../utils/outboundUrl'

const logger = debug('agents:attachmentDownloader')
const REDIRECT_STATUSES = new Set([300, 301, 302, 303, 307, 308])
const MAX_REDIRECTS = 50

export class AttachmentDownloadHttpClient {
  public constructor (
    private readonly httpClient: HttpClient,
    private readonly hostValidator: OutboundUrlPolicy
  ) {}

  public async get (
    url: string,
    headers: Record<string, string> = {},
    redirects: 'default' | 'https' | 'same-origin-bearer' = 'default'
  ): Promise<HttpResponse<ArrayBuffer> | undefined> {
    if (!this.hostValidator.enabled && redirects === 'default') {
      if (!this.hostValidator.isAllowed(url)) {
        return this.blocked(url)
      }
      return this.httpClient.get<ArrayBuffer>(url, { headers, responseType: 'arraybuffer' })
    }

    let currentUrl = url
    let requestHeaders = headers
    for (let hop = 0; ; hop++) {
      const parsed = getHttpsUrl(currentUrl)
      const allowed = parsed && (this.hostValidator instanceof OutboundHostValidator
        ? await this.hostValidator.isAllowedAsync(parsed)
        : this.hostValidator.isAllowed(currentUrl) &&
          (!this.hostValidator.enabled || await hasAllowedOutboundAddresses(parsed)))
      if (!allowed) {
        return this.blocked(currentUrl)
      }

      const response = await fetch(currentUrl, { method: 'GET', headers: new Headers(requestHeaders), redirect: 'manual' })
      const location = response.headers.get('location')

      if (REDIRECT_STATUSES.has(response.status) && location) {
        await response.body?.cancel()
        if (hop >= MAX_REDIRECTS) {
          throw ExceptionHelper.generateException(Error, Errors.AttachmentDownloadRedirectLimit)
        }
        try {
          const next = new URL(location, currentUrl)
          if (redirects !== 'same-origin-bearer' || next.origin !== parsed.origin) {
            requestHeaders = {}
          }
          currentUrl = next.href
        } catch {
          throw ExceptionHelper.generateException(Error, Errors.AttachmentDownloadInvalidRedirect)
        }
        continue
      }

      const config = { method: 'get', url: currentUrl, responseType: 'arraybuffer' as const }
      const result: HttpResponse<ArrayBuffer> = {
        data: await response.arrayBuffer(),
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        config
      }

      if (!response.ok) {
        throw new HttpError(`Request failed with status ${response.status}`, result, config)
      }

      return result
    }
  }

  private blocked (input: string): undefined {
    let host = '[invalid-url]'
    try {
      host = new URL(input).hostname
    } catch { /* Invalid URLs have no safe host to log. */ }
    logger.warn(`Attachment destination blocked by outbound policy or address validation. Host='${host}'`)
    return undefined
  }
}
