/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { isIP } from 'node:net'
import { debug } from '@microsoft/agents-telemetry'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../../errorHelper'
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_RETRY_COUNT,
  DEFAULT_SIDECAR_BASE_URL,
  SidecarProblemDetails,
  SidecarRequestOptions,
  SidecarTokenResult
} from './sidecarModels'

const logger = debug('agents:sidecar')

const DEFAULT_RETRY_BACKOFF_BASE_MS = 2000

/**
 * Reusable HTTP client for communicating with the Microsoft Entra Agent ID sidecar (agent container).
 * Handles URL construction, query parameter building, response parsing, retry, and SSRF-safe base
 * URL validation. Uses the native `fetch` API (Node.js 20+).
 */
export class SidecarHttpClient {
  /** Default per-attempt request timeout (milliseconds). */
  static readonly DEFAULT_TIMEOUT_MS = DEFAULT_REQUEST_TIMEOUT_MS

  /** Default number of retry attempts for transient failures. */
  static readonly DEFAULT_RETRY_COUNT = DEFAULT_RETRY_COUNT

  private readonly _baseUrl: string
  private readonly _timeoutMs: number
  private readonly _retryCount: number
  private readonly _retryBackoffBaseMs: number

  /**
   * Creates a new {@link SidecarHttpClient}.
   * @param baseUrl The resolved (and validated) sidecar base URL.
   * @param timeoutMs Per-attempt request timeout in milliseconds.
   * @param retryCount Number of retry attempts for transient failures (0 disables retries).
   * @param retryBackoffBaseMs Base delay for exponential backoff; primarily a test seam.
   */
  constructor (
    baseUrl: string,
    timeoutMs: number = SidecarHttpClient.DEFAULT_TIMEOUT_MS,
    retryCount: number = SidecarHttpClient.DEFAULT_RETRY_COUNT,
    retryBackoffBaseMs: number = DEFAULT_RETRY_BACKOFF_BASE_MS
  ) {
    this._baseUrl = SidecarHttpClient.stripTrailingSlashes(baseUrl ?? SidecarHttpClient.resolveBaseUrl())
    this._timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : SidecarHttpClient.DEFAULT_TIMEOUT_MS
    this._retryCount = Number.isFinite(retryCount) ? Math.max(0, Math.floor(retryCount)) : SidecarHttpClient.DEFAULT_RETRY_COUNT
    this._retryBackoffBaseMs = Number.isFinite(retryBackoffBaseMs) && retryBackoffBaseMs >= 0 ? retryBackoffBaseMs : DEFAULT_RETRY_BACKOFF_BASE_MS
  }

  /**
   * Removes any trailing `/` characters from `value` using a linear scan. Avoids a regular
   * expression so untrusted input with many `/` characters cannot trigger super-linear
   * backtracking (ReDoS).
   * @param value The string to trim.
   * @returns `value` without trailing slashes.
   */
  private static stripTrailingSlashes (value: string): string {
    let end = value.length
    while (end > 0 && value.charCodeAt(end - 1) === 47 /* '/' */) {
      end--
    }
    return end === value.length ? value : value.slice(0, end)
  }

  /**
   * Resolves the sidecar base URL. Resolution order: `SIDECAR_URL` environment variable >
   * `configuredUrl` > {@link DEFAULT_SIDECAR_BASE_URL}. Empty/whitespace values are treated as unset.
   * @param configuredUrl The optional base URL from configuration.
   * @returns The resolved base URL.
   */
  static resolveBaseUrl (configuredUrl?: string): string {
    const envUrl = process.env.SIDECAR_URL
    if (envUrl && envUrl.trim()) {
      return envUrl.trim()
    }
    return configuredUrl && configuredUrl.trim() ? configuredUrl.trim() : DEFAULT_SIDECAR_BASE_URL
  }

  /**
   * Returns a copy of `raw` with any userinfo (credentials) removed, safe to include in logs and
   * error messages. Falls back to a regex strip when `raw` is not a parseable URL.
   */
  private static redactUrl (raw: string): string {
    try {
      const u = new URL(raw)
      if (u.username || u.password) {
        u.username = ''
        u.password = ''
      }
      return u.toString()
    } catch {
      return raw.replace(/\/\/[^/@]*@/, '//')
    }
  }

  /**
   * Validates that the resolved sidecar base URL is safe to call. The URL must be a well-formed
   * absolute http/https URL without userinfo. Unless `bypassLocalNetworkRestriction` is set, the host
   * must also be a loopback address or a private network address (RFC 1918 / RFC 4193 / link-local) to
   * avoid sending agent credentials off-box (SSRF safety).
   * @param resolvedUrl The resolved sidecar base URL.
   * @param bypassLocalNetworkRestriction Skip the loopback/private-address check (UNSAFE).
   * @throws When the URL is malformed or points to a disallowed address.
   */
  static validateBaseUrl (resolvedUrl: string, bypassLocalNetworkRestriction: boolean): void {
    let uri: URL
    try {
      uri = new URL(resolvedUrl)
    } catch {
      throw ExceptionHelper.generateException(Error, Errors.SidecarBaseUrlInvalid, undefined, { url: SidecarHttpClient.redactUrl(resolvedUrl) })
    }

    if (uri.protocol !== 'http:' && uri.protocol !== 'https:') {
      throw ExceptionHelper.generateException(Error, Errors.SidecarBaseUrlInsecureScheme, undefined, { url: SidecarHttpClient.redactUrl(resolvedUrl) })
    }

    if (uri.username || uri.password) {
      throw ExceptionHelper.generateException(Error, Errors.SidecarBaseUrlUserInfo, undefined, { url: SidecarHttpClient.redactUrl(resolvedUrl) })
    }

    if (bypassLocalNetworkRestriction) {
      return
    }

    if (SidecarHttpClient.isLoopbackOrPrivateHost(uri.hostname)) {
      return
    }

    throw ExceptionHelper.generateException(Error, Errors.SidecarBaseUrlNotLocal, undefined, { url: SidecarHttpClient.redactUrl(resolvedUrl) })
  }

  private static isLoopbackOrPrivateHost (host: string): boolean {
    // URL.hostname wraps IPv6 literals in brackets (e.g. "[::1]"); strip them before classification.
    const normalized = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
    const ipVersion = isIP(normalized)
    if (ipVersion === 0) {
      // DNS host: only "localhost" (and subdomains) is treated as safe.
      const lower = normalized.toLowerCase()
      return lower === 'localhost' || lower.endsWith('.localhost')
    }
    if (ipVersion === 4) {
      return SidecarHttpClient.isPrivateOrLoopbackIPv4(normalized)
    }
    return SidecarHttpClient.isPrivateOrLoopbackIPv6(normalized)
  }

  private static isPrivateOrLoopbackIPv4 (host: string): boolean {
    const b = host.split('.').map((p) => parseInt(p, 10))
    if (b.length !== 4 || b.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
      return false
    }
    if (b[0] === 127) return true // 127.0.0.0/8 loopback
    if (b[0] === 10) return true // 10.0.0.0/8
    if (b[0] === 172 && b[1] >= 16 && b[1] <= 31) return true // 172.16.0.0/12
    if (b[0] === 192 && b[1] === 168) return true // 192.168.0.0/16
    if (b[0] === 169 && b[1] === 254) return true // 169.254.0.0/16 link-local
    return false
  }

  private static isPrivateOrLoopbackIPv6 (host: string): boolean {
    const lower = host.toLowerCase()
    if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true // loopback (`::` is the unspecified address, not loopback)
    // IPv4-mapped/-translated addresses in either dotted (::ffff:127.0.0.1)
    // or hex-compressed (::ffff:7f00:1) form.
    const mappedIPv4 = SidecarHttpClient.extractMappedIPv4(lower)
    if (mappedIPv4) {
      return SidecarHttpClient.isPrivateOrLoopbackIPv4(mappedIPv4)
    }
    const firstHextet = parseInt(lower.split(':')[0], 16)
    if (!Number.isNaN(firstHextet)) {
      if ((firstHextet & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
      if ((firstHextet & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
      if ((firstHextet & 0xffc0) === 0xfec0) return true // fec0::/10 site-local (deprecated)
    }
    return false
  }

  /**
   * Extracts the embedded IPv4 address from an IPv4-mapped/-translated IPv6 literal, returning it
   * in dotted-quad form, or `undefined` if `host` is not such an address. Handles both the dotted
   * form (`::ffff:127.0.0.1`) and the hex-compressed form Node emits (`::ffff:7f00:1`).
   */
  private static extractMappedIPv4 (host: string): string | undefined {
    const dotted = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
    if (dotted) {
      return dotted[1]
    }
    const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
    if (hex) {
      const high = parseInt(hex[1], 16)
      const low = parseInt(hex[2], 16)
      return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`
    }
    return undefined
  }

  /**
   * Calls `GET /AuthorizationHeaderUnauthenticated/{serviceName}` with the specified options.
   * @param serviceName The sidecar downstream API name.
   * @param options The request options used to build the query string.
   * @param signal Optional abort signal supplied by the caller.
   * @returns The parsed token result.
   */
  async getAuthorizationHeaderUnauthenticated (
    serviceName: string,
    options?: SidecarRequestOptions,
    signal?: AbortSignal
  ): Promise<SidecarTokenResult> {
    const url = this.buildUrl(`/AuthorizationHeaderUnauthenticated/${encodeURIComponent(serviceName)}`, options)
    return this.sendAndParse(url, signal)
  }

  /**
   * Checks sidecar health via `GET /healthz`.
   * @returns `true` when the sidecar responds with a success status, `false` otherwise.
   */
  async isHealthy (): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(`${this._baseUrl}/healthz`)
      return response.ok
    } catch {
      return false
    }
  }

  private buildUrl (path: string, options?: SidecarRequestOptions): string {
    const url = `${this._baseUrl}${path}`
    if (!options) {
      return url
    }

    // AgentUsername (UPN) and AgentUserId (object id) are mutually exclusive per the sidecar contract.
    if (options.agentUsername && options.agentUserId) {
      throw ExceptionHelper.generateException(Error, Errors.SidecarUserIdentityMutuallyExclusive)
    }

    const params = new URLSearchParams()
    if (options.agentIdentity) {
      params.append('AgentIdentity', options.agentIdentity)
    }
    if (options.agentUsername) {
      params.append('AgentUsername', options.agentUsername)
    }
    if (options.agentUserId) {
      params.append('AgentUserId', options.agentUserId)
    }
    if (options.scopes) {
      for (const scope of options.scopes) {
        if (scope && scope.trim()) {
          params.append('optionsOverride.Scopes', scope)
        }
      }
    }
    if (options.requestAppToken === true) {
      params.append('optionsOverride.RequestAppToken', 'true')
    }
    if (options.tenant) {
      params.append('optionsOverride.AcquireTokenOptions.Tenant', options.tenant)
    }
    if (options.forceRefresh === true) {
      params.append('optionsOverride.AcquireTokenOptions.ForceRefresh', 'true')
    }

    const query = params.toString()
    return query ? `${url}?${query}` : url
  }

  private async withTimeout<T> (signal: AbortSignal | undefined, op: (innerSignal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this._timeoutMs)
    const onAbort = () => controller.abort()
    if (signal) {
      if (signal.aborted) {
        controller.abort()
      } else {
        signal.addEventListener('abort', onAbort, { once: true })
      }
    }
    try {
      return await op(controller.signal)
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }

  private async fetchWithTimeout (url: string, signal?: AbortSignal): Promise<Response> {
    return this.withTimeout(signal, (innerSignal) => fetch(url, { method: 'GET', signal: innerSignal }))
  }

  /**
   * Performs the request and reads the full response body within a single timeout window, so a
   * sidecar that streams response headers and then stalls the body cannot hang token acquisition
   * beyond `requestTimeout`.
   */
  private async fetchAndReadText (url: string, signal?: AbortSignal): Promise<{ response: Response, body: string }> {
    return this.withTimeout(signal, async (innerSignal) => {
      const response = await fetch(url, { method: 'GET', signal: innerSignal })
      const body = await response.text().catch(() => '')
      return { response, body }
    })
  }

  private async sendAndParse (url: string, signal?: AbortSignal): Promise<SidecarTokenResult> {
    const maxAttempts = this._retryCount + 1
    // Log only the request path, never the query string, which can carry PII (UPN, object id, tenant).
    const requestPath = url.split('?')[0]

    for (let attempt = 1; ; attempt++) {
      logger.debug('Sidecar request (attempt %d/%d): GET %s', attempt, maxAttempts, requestPath)

      let response: Response
      let body: string
      try {
        ({ response, body } = await this.fetchAndReadText(url, signal))
      } catch (err) {
        // A caller-requested cancellation is not transient — propagate it.
        if (signal?.aborted) {
          throw err
        }
        if (attempt >= maxAttempts) {
          logger.error('Sidecar request to %s failed after %d attempt(s).', requestPath, attempt)
          throw ExceptionHelper.generateException(Error, Errors.SidecarRequestFailed, err as Error, {
            attempts: String(attempt),
            message: (err as Error)?.message ?? 'network error'
          })
        }
        logger.warn('Sidecar request to %s failed (attempt %d/%d); retrying.', requestPath, attempt, maxAttempts)
        await this.delayBeforeRetry(attempt, signal)
        continue
      }

      if (!response.ok) {
        if (SidecarHttpClient.isTransientStatus(response.status) && attempt < maxAttempts) {
          logger.warn('Sidecar returned transient status %d from %s (attempt %d/%d); retrying.', response.status, requestPath, attempt, maxAttempts)
          await this.delayBeforeRetry(attempt, signal)
          continue
        }

        const problem = SidecarHttpClient.tryParseProblemDetails(body)
        // Never surface problem.detail: the sidecar can echo request parameters (UPN, object id,
        // tenant) into it. Use only the non-sensitive title/status in logs and the thrown error.
        const message = problem?.title ?? `Sidecar returned ${response.status}`
        logger.error('Sidecar returned error. Status: %d, URL: %s, Title: %s', response.status, requestPath, problem?.title ?? '(none)')
        throw ExceptionHelper.generateException(Error, Errors.SidecarErrorResponse, undefined, {
          status: String(response.status),
          message
        })
      }

      const result = SidecarHttpClient.parseTokenResponse(body)
      logger.debug('Sidecar token acquired from %s. Scheme: %s, TokenLength: %d', requestPath, result.scheme, result.token.length)
      return result
    }
  }

  private async delayBeforeRetry (attempt: number, signal?: AbortSignal): Promise<void> {
    const multiplier = Math.pow(2, attempt - 1)
    const delay = this._retryBackoffBaseMs * multiplier
    if (delay <= 0) {
      return
    }
    // Resolve after the backoff delay, but reject immediately if the caller aborts so a pending
    // retry wait does not keep the caller blocked for the full (potentially several second) delay.
    await new Promise<void>((resolve, reject) => {
      let onAbort: (() => void) | undefined
      const timer = setTimeout(() => {
        if (signal && onAbort) {
          signal.removeEventListener('abort', onAbort)
        }
        resolve()
      }, delay)
      if (signal) {
        onAbort = () => {
          clearTimeout(timer)
          reject(signal.reason ?? new Error('Aborted'))
        }
        if (signal.aborted) {
          onAbort()
          return
        }
        signal.addEventListener('abort', onAbort, { once: true })
      }
    })
  }

  private static isTransientStatus (status: number): boolean {
    return status === 408 || status === 429 || status >= 500
  }

  private static parseTokenResponse (responseContent: string): SidecarTokenResult {
    let body: { authorizationHeader?: unknown }
    try {
      body = JSON.parse(responseContent)
    } catch (err) {
      throw ExceptionHelper.generateException(Error, Errors.SidecarResponseUnparsable, err as Error)
    }

    const headerValue = typeof body.authorizationHeader === 'string' ? body.authorizationHeader.trim() : ''
    if (headerValue) {
      const spaceIndex = headerValue.indexOf(' ')
      if (spaceIndex > 0) {
        // "{scheme} {token}" form: the token after the separator must be non-empty.
        const token = headerValue.substring(spaceIndex + 1).trim()
        if (token.length > 0) {
          return { scheme: headerValue.substring(0, spaceIndex), token }
        }
      } else if (!SidecarHttpClient.isKnownAuthScheme(headerValue)) {
        // No separator: treat the whole value as a raw token and default the scheme to
        // Bearer. A lone scheme name (e.g. "Bearer") is not a valid token and falls
        // through to the error below.
        return { scheme: 'Bearer', token: headerValue }
      }
    }

    throw ExceptionHelper.generateException(Error, Errors.SidecarResponseMissingAuthorizationHeader)
  }

  private static isKnownAuthScheme (value: string): boolean {
    const lower = value.toLowerCase()
    return lower === 'bearer' || lower === 'pop'
  }

  private static tryParseProblemDetails (content: string): SidecarProblemDetails | undefined {
    if (!content) {
      return undefined
    }
    try {
      return JSON.parse(content) as SidecarProblemDetails
    } catch {
      return undefined
    }
  }
}
