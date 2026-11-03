// @ts-check

import http from 'node:http'
import https from 'node:https'
import { lookup } from 'node:dns/promises'
import { isIP, BlockList } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { linkFinding } from './documentation-links.mjs'

/** URL and phase budgets include queueing; request timeouts start after a permit is acquired. */
const defaultLimits = Object.freeze({
  concurrency: 6,
  perHost: 2,
  requestTimeoutMs: 10000,
  urlTimeoutMs: 30000,
  phaseTimeoutMs: 180000,
  redirects: 5,
  retries: 1,
  retryDelayMs: 250,
})

/** @typedef {{ status: number, location?: string, retryAfter?: string }} ResponseMetadata */
/** @typedef {{ outcome: 'verified' | 'broken' | 'unverified' | 'skipped', url: string, finalUrl: string, message: string, attempts: number, status?: number, ruleId?: string }} ExternalResult */
/** @typedef {import('./documentation-links.mjs').Reference & { url: string }} ExternalReference */
/** @typedef {{ limits?: Partial<typeof defaultLimits>, request?: (url: URL, options: { method: string, signal: AbortSignal, allowPrivate: boolean }) => Promise<ResponseMetadata>, allowPrivate?: boolean, strict?: boolean, exceptions?: Map<string, any>, now?: () => number }} ExternalOptions */

/** Validate unique destinations and retain every authored occurrence for diagnostics.
 * @param {ExternalReference[]} references
 * @param {ExternalOptions} [options]
 */
export async function checkExternalLinks (references, options = {}) {
  const limits = { ...defaultLimits, ...options.limits }
  validateLimits(limits)
  const now = options.now ?? Date.now
  const request = options.request ?? requestHeaders
  const phase = new AbortController()
  const phaseTimer = setTimeout(() => phase.abort(new Error('External-phase deadline exceeded.')), limits.phaseTimeoutMs)
  const permits = createRequestQueue(limits.concurrency, limits.perHost)
  const urls = [...new Set(references.map(reference => reference.url))].sort()
  const results = new Map()
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < urls.length && !phase.signal.aborted) {
      const url = urls[nextIndex++]
      const exception = options.exceptions?.get(url)
      if (exception && !exception.expired) {
        results.set(url, result('skipped', url, `Configured exception: ${exception.reason}`))
        continue
      }
      const skipReason = destinationSkipReason(new URL(url), options.allowPrivate)
      if (skipReason) {
        results.set(url, result('skipped', url, skipReason))
        continue
      }
      const checked = await checkDestination(url, {
        limits,
        request,
        phaseSignal: phase.signal,
        permits,
        now,
        allowPrivate: options.allowPrivate ?? false,
      })
      results.set(url, checked)
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(limits.concurrency, urls.length) }, worker))
  } finally {
    clearTimeout(phaseTimer)
    phase.abort(new Error('External checking completed.'))
  }
  for (const url of urls) {
    if (!results.has(url)) {
      results.set(url, result('unverified', url, 'External-phase deadline exceeded before verification.'))
    }
  }

  const findings = []
  const summary = {
    requested: true,
    unique: urls.length,
    references: references.length,
    requests: 0,
    verified: 0,
    broken: 0,
    unverified: 0,
    skipped: 0,
  }
  for (const checked of results.values()) {
    summary[checked.outcome] += 1
    // Count transport attempts, including redirects, GET fallbacks, and retries.
    // A failed DNS lookup or connection still counts as an attempted request.
    summary.requests += checked.attempts
  }
  for (const reference of references) {
    const checked = results.get(reference.url)
    if (checked.outcome === 'verified' || checked.outcome === 'skipped') {
      continue
    }
    // In default mode, uncertain results stay in the summary and detailed log.
    if (checked.outcome === 'unverified' && !options.strict) {
      continue
    }
    const destination = checked.finalUrl !== reference.url ? ` Final destination: ${checked.finalUrl}.` : ''
    const fix = checked.outcome === 'broken'
      ? 'Replace the destination with a working URL or restore the referenced resource.'
      : 'Retry this URL and investigate the reported restriction or network failure; add only a justified exact exception.'
    findings.push(linkFinding(reference, checked.ruleId ?? 'docs/external-link-unverified', checked.message + destination, fix, 'error'))
  }
  return { findings, summary, results: urls.map(url => results.get(url)) }
}

async function checkDestination (url, context) {
  const controller = new AbortController()
  const deadline = context.now() + context.limits.urlTimeoutMs
  const timer = setTimeout(() => controller.abort(new Error('Per-URL deadline exceeded.')), context.limits.urlTimeoutMs)
  const signal = AbortSignal.any([context.phaseSignal, controller.signal])
  const state = { attempts: 0, finalUrl: url }
  try {
    for (let retry = 0; retry <= context.limits.retries; retry += 1) {
      let checked
      try {
        checked = await followRedirects(url, 'HEAD', signal, state, context)
        // Some servers reject HEAD, including with a false 404. Confirm using GET.
        const headRejected = checked.status >= 400 && checked.status < 500 && checked.status !== 429
        if (headRejected || checked.status === 501) {
          checked = await followRedirects(checked.finalUrl, 'GET', signal, state, context)
        }
      } catch (error) {
        if (signal.aborted) {
          return { ...result('unverified', url, signal.reason.message), ...state }
        }
        if (error.code === 'EDESTINATION') {
          return { ...result(state.finalUrl === url ? 'skipped' : 'broken', url, error.message, 'docs/external-link-redirect'), ...state }
        }
        if (!isExpectedRequestError(error)) {
          throw error
        }
        checked = { ...result('unverified', url, `Request failed: ${error.cause?.code ?? error.code ?? error.name}: ${error.message}`), ...state, retryable: true }
      }
      if (!checked.retryable || retry === context.limits.retries) {
        return { ...checked, url, ...state }
      }
      const pause = retryDelay(checked.retryAfter, context.now(), context.limits.retryDelayMs)
      if (pause >= deadline - context.now()) {
        return { ...checked, url, ...state, message: `${checked.message} Retry delay exceeds the remaining URL budget.` }
      }
      await delay(pause, undefined, { signal })
    }
  } catch (error) {
    if (!signal.aborted) {
      throw error
    }
    return { ...result('unverified', url, signal.reason.message), ...state }
  } finally {
    clearTimeout(timer)
  }
}

async function followRedirects (initialUrl, method, signal, state, context) {
  let current = new URL(initialUrl)
  const seen = new Set()
  for (let hop = 0; hop <= context.limits.redirects; hop += 1) {
    signal.throwIfAborted()
    state.finalUrl = current.href
    const skipReason = destinationSkipReason(current, context.allowPrivate)
    if (skipReason) {
      return { ...result('broken', initialUrl, `Redirect destination is not eligible: ${skipReason}`, 'docs/external-link-redirect'), finalUrl: current.href }
    }
    if (seen.has(current.href)) {
      return result('broken', initialUrl, 'Redirect loop detected.', 'docs/external-link-redirect')
    }
    seen.add(current.href)
    state.finalUrl = current.href
    const release = await context.permits.acquire(current.hostname, signal)
    const timeout = AbortSignal.timeout(context.limits.requestTimeoutMs)
    const requestSignal = AbortSignal.any([signal, timeout])
    let response
    try {
      state.attempts += 1
      response = await context.request(current, { method, signal: requestSignal, allowPrivate: context.allowPrivate })
    } finally {
      release()
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.location) {
        return result('broken', initialUrl, 'Redirect response has no Location header.', 'docs/external-link-redirect')
      }
      if (hop === context.limits.redirects) {
        return result('broken', initialUrl, 'Redirect hop limit exceeded.', 'docs/external-link-redirect')
      }
      try {
        current = new URL(response.location, current)
        decodeURI(current.href)
        current.hash = ''
        if (!['http:', 'https:'].includes(current.protocol) || current.username || current.password) {
          throw new TypeError('Unsupported redirect destination')
        }
      } catch {
        return result('broken', initialUrl, 'Redirect has an invalid or unsupported destination.', 'docs/external-link-redirect')
      }
      continue
    }
    return { ...classifyResponse(current.href, response.status), status: response.status, retryAfter: response.retryAfter }
  }
}

function classifyResponse (url, status) {
  if (status >= 200 && status < 300) {
    return result('verified', url, `HTTP ${status}.`)
  }
  if ([401, 403, 407].includes(status)) {
    return result('unverified', url, `HTTP ${status}: access restricted; resource existence is unverified.`)
  }
  if ([408, 429].includes(status) || (status >= 500 && status < 600)) {
    return { ...result('unverified', url, `HTTP ${status}: website could not be verified.`), retryable: true }
  }
  return result('broken', url, `HTTP ${status}: destination is not usable.`, 'docs/external-link-http')
}

function result (outcome, url, message, ruleId) {
  return {
    outcome,
    url,
    finalUrl: url,
    message,
    attempts: 0,
    ...(ruleId ? { ruleId } : {}),
  }
}

function retryDelay (header, now, fallback) {
  if (!header) {
    return fallback
  }
  const seconds = Number(header)
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000)
  }
  const timestamp = Date.parse(header)
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : fallback
}

/** Abortable FIFO queue. Permits cover actual requests, including redirected hosts. */
function createRequestQueue (globalLimit, hostLimit) {
  const waiting = []
  const hosts = new Map()
  let active = 0

  const schedule = () => {
    for (let index = 0; index < waiting.length && active < globalLimit;) {
      const entry = waiting[index]
      if ((hosts.get(entry.host) ?? 0) >= hostLimit) {
        index += 1
        continue
      }
      waiting.splice(index, 1)
      entry.signal.removeEventListener('abort', entry.abort)
      active += 1
      hosts.set(entry.host, (hosts.get(entry.host) ?? 0) + 1)
      entry.resolve(() => {
        active -= 1
        hosts.set(entry.host, hosts.get(entry.host) - 1)
        schedule()
      })
    }
  }
  return {
    acquire (host, signal) {
      return new Promise((resolve, reject) => {
        signal.throwIfAborted()
        const entry = { host, signal, resolve, abort: undefined }
        entry.abort = () => {
          waiting.splice(waiting.indexOf(entry), 1)
          reject(signal.reason)
        }
        signal.addEventListener('abort', entry.abort, { once: true })
        waiting.push(entry)
        schedule()
      })
    },
  }
}

/** Read response headers and immediately close the body; no cookies or credentials are sent.
 * @param {URL} url
 * @param {{ method: string, signal: AbortSignal, allowPrivate: boolean }} options
 * @returns {Promise<ResponseMetadata>}
 */
export function requestHeaders (url, { method, signal, allowPrivate }) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http
    const request = transport.request(url, {
      method,
      signal,
      agent: false,
      headers: { 'user-agent': 'Agents-for-js-repo-doctor/1.0', accept: '*/*' },
      lookup: (hostname, lookupOptions, callback) => {
        // Resolve and pin the checked address in the actual connection lookup.
        // This prevents a separate preflight lookup from racing a changed DNS answer.
        lookup(hostname, { all: true }).then(addresses => {
          if (!allowPrivate && addresses.some(entry => isPrivateAddress(entry.address))) {
            callback(Object.assign(new Error('DNS resolved to private or local infrastructure.'), { code: 'EDESTINATION' }), '')
            return
          }
          if (lookupOptions.all) {
            callback(null, addresses)
          } else {
            callback(null, addresses[0].address, addresses[0].family)
          }
        }).catch(error => callback(error, ''))
      },
    }, response => {
      const metadata = {
        status: response.statusCode,
        location: response.headers.location,
        retryAfter: response.headers['retry-after'],
      }
      response.destroy()
      resolve(metadata)
    })
    request.once('error', reject)
    request.end()
  })
}

const privateAddresses = new BlockList()
/** @type {[string, number][]} */
const ipv4PrivateSubnets = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['192.0.0.0', 24],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]
/** @type {[string, number][]} */
const ipv6PrivateSubnets = [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
]
for (const [address, prefix] of ipv4PrivateSubnets) {
  privateAddresses.addSubnet(address, prefix, 'ipv4')
}
for (const [address, prefix] of ipv6PrivateSubnets) {
  privateAddresses.addSubnet(address, prefix, 'ipv6')
}

function isPrivateAddress (address) {
  const family = isIP(address)
  return privateAddresses.check(address, family === 6 ? 'ipv6' : 'ipv4')
}

function destinationSkipReason (url, allowPrivate = false) {
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  const localName = hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
  const singleLabel = !hostname.includes('.') && !isIP(hostname)
  const privateAddress = isIP(hostname) && isPrivateAddress(hostname)
  if (!allowPrivate && (localName || singleLabel || privateAddress)) {
    return 'Local development or private infrastructure destination.'
  }
  const decoded = decodeURI(url.href)
  if (/[{}<>]/.test(decoded) || /%[A-Z_][A-Z_0-9]*%/i.test(decoded) || hostname.endsWith('.example') || hostname.endsWith('.invalid') || hostname.endsWith('.test')) {
    return 'Template or reserved example destination.'
  }
  return undefined
}

function isExpectedRequestError (error) {
  return error.name === 'TimeoutError' || error.name === 'AbortError' ||
    /^(?:E[A-Z_]+|ERR_(?:TLS|SSL|HTTP|SOCKET|STREAM|NETWORK)|CERT_|DEPTH_|UNABLE_)/.test(error.cause?.code ?? error.code ?? '')
}

function validateLimits (limits) {
  for (const [key, value] of Object.entries(limits)) {
    const allowsZero = ['redirects', 'retries', 'retryDelayMs'].includes(key)
    if (!Number.isSafeInteger(value) || value < (allowsZero ? 0 : 1)) {
      throw new TypeError(`Invalid external-link limit: ${key}`)
    }
  }
}
