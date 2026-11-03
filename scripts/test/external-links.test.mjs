import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { describe, it } from 'node:test'
import { checkExternalLinks, requestHeaders } from '../repo-doctor/external-links.mjs'

function references (...urls) {
  return urls.map((url, index) => ({
    path: `docs/${index}.md`,
    line: index + 1,
    column: 1,
    kind: 'link',
    target: url,
    url,
  }))
}

function options (request, limits = {}) {
  return {
    request,
    limits: { retryDelayMs: 0, ...limits },
  }
}

describe('external link validation', () => {
  it('skips an initial private DNS destination but rejects redirected private DNS', async () => {
    for (const redirected of [false, true]) {
      const report = await checkExternalLinks(references('https://public.example.org/'), options(async url => {
        if (redirected && url.pathname === '/') {
          return { status: 302, location: '/private' }
        }
        throw Object.assign(new Error('DNS resolved to private infrastructure.'), { code: 'EDESTINATION' })
      }))
      assert.equal(report.results[0].outcome, redirected ? 'broken' : 'skipped')
      assert.equal(report.findings.length, redirected ? 1 : 0)
    }
  })

  it('retains rejected redirect destinations in results and findings', async () => {
    const target = 'http://10.0.0.1/private'
    const report = await checkExternalLinks(references('https://public.example.org/'), options(async () => ({ status: 302, location: target })))
    assert.equal(report.results[0].finalUrl, target)
    assert.ok(report.findings[0].message.includes(target))
  })

  it('deduplicates destinations while retaining every source diagnostic', async () => {
    const calls = []
    const report = await checkExternalLinks(references(
      'https://public.example.org/missing',
      'https://public.example.org/missing',
      'https://public.example.org/missing?q=1'
    ), options(async (url, { method }) => {
      calls.push(`${method} ${url.href}`)
      return { status: 404 }
    }))
    assert.equal(calls.length, 4)
    assert.equal(report.summary.requests, 4)
    assert.equal(report.summary.unique, 2)
    assert.equal(report.summary.references, 3)
    assert.equal(report.summary.broken, 2)
    assert.equal(report.findings.length, 3)
    assert.match(report.findings[0].message, /HTTP 404/)
  })

  it('uses GET to confirm HEAD failures and classifies all supported response categories', async () => {
    for (const status of [200, 204, 400, 401, 403, 404, 407, 408, 410, 429, 451, 500, 501, 503, 304]) {
      const methods = []
      const report = await checkExternalLinks(references('https://public.example.org/'), options(async (url, { method }) => {
        methods.push(method)
        return { status }
      }))
      let expected = 'broken'
      if (status < 300) {
        expected = 'verified'
      } else if ([401, 403, 407, 408, 429, 500, 501, 503].includes(status)) {
        expected = 'unverified'
      }
      assert.equal(report.results[0].outcome, expected, `HTTP ${status}`)
      const headRejected = status >= 400 && status < 500 && status !== 429
      if (headRejected || status === 501) {
        assert.ok(methods.includes('GET'), `HTTP ${status} must confirm HEAD using GET`)
      }
      if (expected === 'unverified') {
        assert.equal(report.findings.length, 0)
      }
    }
    const fallback = await checkExternalLinks(references('https://public.example.org/'), options(async (url, { method }) => ({
      status: method === 'HEAD' ? 404 : 200,
    })))
    assert.equal(fallback.summary.verified, 1)
  })

  it('follows relative and absolute redirects and diagnoses invalid redirect chains', async () => {
    const routes = {
      '/relative': { status: 301, location: '/absolute' },
      '/absolute': { status: 302, location: 'https://other.example.org/done' },
      '/done': { status: 200 },
      '/missing': { status: 302, location: '/gone' },
      '/gone': { status: 410 },
      '/loop': { status: 307, location: '/loop' },
      '/empty': { status: 308 },
      '/scheme': { status: 302, location: 'file:///secret' },
      '/private': { status: 302, location: 'http://127.0.0.1/secret' },
      '/deep': { status: 302, location: '/relative' },
      '/encoding': { status: 302, location: '/bad%ZZ' },
    }
    const report = await checkExternalLinks(references(...Object.keys(routes).filter(route => !['/done', '/gone', '/absolute'].includes(route)).map(route => `https://public.example.org${route}`)), options(async url => routes[url.pathname], { redirects: 2 }))
    const resultFor = route => report.results.find(result => result.url.endsWith(route))
    assert.equal(resultFor('/relative').outcome, 'verified')
    assert.equal(resultFor('/relative').finalUrl, 'https://other.example.org/done')
    assert.equal(resultFor('/missing').status, 410)
    for (const route of ['/loop', '/empty', '/scheme', '/private', '/deep', '/encoding']) {
      assert.equal(resultFor(route).ruleId, 'docs/external-link-redirect', route)
    }
    assert.ok(report.findings.some(finding => finding.message.includes('Final destination:')))
  })

  it('retries transient outcomes once and keeps internal failures visible', async () => {
    for (const code of ['ENOTFOUND', 'ECONNRESET', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID']) {
      let calls = 0
      const report = await checkExternalLinks(references('https://public.example.org/'), options(async () => {
        calls += 1
        throw Object.assign(new Error('Simulated request failure'), { code })
      }))
      assert.equal(calls, 2)
      assert.equal(report.summary.requests, 2)
      assert.equal(report.summary.unverified, 1)
      assert.match(report.results[0].message, new RegExp(code))
    }
    let attempts = 0
    const recovered = await checkExternalLinks(references('https://public.example.org/'), options(async () => ({
      status: ++attempts === 1 ? 503 : 200,
    })))
    assert.equal(recovered.summary.verified, 1)
    await assert.rejects(checkExternalLinks(references('https://public.example.org/'), options(async () => {
      throw new Error('Programming invariant failed')
    })), /Programming invariant failed/)
  })

  it('bounds Retry-After instead of waiting beyond a URL budget', async () => {
    const report = await checkExternalLinks(references('https://public.example.org/'), options(async () => ({
      status: 429,
      retryAfter: '3600',
    }), { urlTimeoutMs: 50 }))
    assert.equal(report.results[0].attempts, 1)
    assert.match(report.results[0].message, /remaining URL budget/)
    const dated = await checkExternalLinks(references('https://public.example.org/'), {
      ...options(async () => ({ status: 429, retryAfter: 'Tue, 27 Oct 2026 00:00:00 GMT' }), { urlTimeoutMs: 50 }),
      now: () => Date.parse('2026-10-26T00:00:00Z'),
    })
    assert.equal(dated.results[0].attempts, 1)
  })

  it('cancels timed-out requests and retains completed and unfinished results at the phase deadline', async () => {
    const report = await checkExternalLinks(references(
      'https://public.example.org/a-fast',
      'https://public.example.org/b-slow',
      'https://public.example.org/c-queued'
    ), options(async (url, { signal }) => {
      if (url.pathname === '/a-fast') {
        return { status: 200 }
      }
      await delay(1000, undefined, { signal })
      return { status: 200 }
    }, { concurrency: 1, perHost: 1, phaseTimeoutMs: 35, requestTimeoutMs: 100, urlTimeoutMs: 200 }))
    assert.equal(report.summary.verified, 1)
    assert.equal(report.summary.unverified, 2)
    assert.equal(report.summary.unique, 3)
    assert.equal(report.summary.requests, 2)
    assert.equal(report.results[2].attempts, 0)
    assert.ok(report.results.slice(1).every(result => /deadline/i.test(result.message)))

    const timedOut = await checkExternalLinks(references('https://public.example.org/'), options(async (url, { signal }) => {
      await delay(1000, undefined, { signal })
      return { status: 200 }
    }, { requestTimeoutMs: 5, urlTimeoutMs: 100 }))
    assert.equal(timedOut.summary.unverified, 1)
    assert.equal(timedOut.results[0].attempts, 2)
  })

  it('enforces global and host concurrency across redirected destinations', async () => {
    let active = 0
    let maximum = 0
    const hosts = new Map()
    const maxima = new Map()
    const report = await checkExternalLinks(references(...Array.from({ length: 8 }, (_, index) => `https://host${index % 2}.example.org/${index}`)), options(async url => {
      active += 1
      maximum = Math.max(maximum, active)
      hosts.set(url.host, (hosts.get(url.host) ?? 0) + 1)
      maxima.set(url.host, Math.max(maxima.get(url.host) ?? 0, hosts.get(url.host)))
      try {
        await delay(2)
        if (url.host !== 'destination.example.org') {
          return { status: 302, location: `https://destination.example.org${url.pathname}` }
        }
        return { status: 200 }
      } finally {
        active -= 1
        hosts.set(url.host, hosts.get(url.host) - 1)
      }
    }, { concurrency: 3, perHost: 1 }))
    assert.equal(report.summary.verified, 8)
    assert.ok(maximum <= 3)
    assert.ok([...maxima.values()].every(count => count === 1))
  })

  it('reports exact exceptions, templates, and private endpoints as skipped; strict mode promotes only unverified results', async () => {
    const url = 'https://public.example.org/restricted'
    let calls = 0
    const input = references(url, 'http://localhost:3000/', 'http://10.1.2.3/', 'https://tenant.example/', 'https://public.example.org/%7Btenant%7D')
    const skipped = await checkExternalLinks(input, {
      ...options(async () => {
        calls += 1
        return { status: 403 }
      }),
      strict: true,
      exceptions: new Map([[url, { reason: 'Requires an organizational login', expired: false }]]),
    })
    assert.equal(calls, 0)
    assert.equal(skipped.summary.requests, 0)
    assert.equal(skipped.summary.skipped, 5)
    assert.equal(skipped.findings.length, 0)
    const strict = await checkExternalLinks(references(url), {
      ...options(async () => ({ status: 403 })),
      strict: true,
    })
    assert.equal(strict.findings[0].severity, 'error')
    const expired = await checkExternalLinks(references(url), {
      ...options(async () => ({ status: 200 })),
      exceptions: new Map([[url, { reason: 'Expired exception', expired: true }]]),
    })
    assert.equal(expired.summary.verified, 1)
  })

  it('does not confuse percent-encoded package names with URL templates', async () => {
    const report = await checkExternalLinks(references('https://img.shields.io/npm/dw/%40microsoft%2Fagents-activity'), options(async () => ({ status: 200 })))
    assert.equal(report.summary.verified, 1)
    assert.equal(report.summary.skipped, 0)
  })

  it('applies a host limit across distinct ports on that host', async () => {
    let active = 0
    let maximum = 0
    const report = await checkExternalLinks(references(
      'https://public.example.org:444/a',
      'https://public.example.org:445/b'
    ), options(async () => {
      active += 1
      maximum = Math.max(maximum, active)
      try {
        await delay(2)
        return { status: 200 }
      } finally {
        active -= 1
      }
    }, { perHost: 1 }))
    assert.equal(maximum, 1)
    assert.equal(report.summary.verified, 2)
  })

  it('does not consume request timeouts while healthy URLs wait for host permits', async () => {
    const report = await checkExternalLinks(references(...Array.from({ length: 6 }, (_, index) => `https://public.example.org/${index}`)), options(async (url, { signal }) => {
      await delay(40, undefined, { signal })
      return { status: 200 }
    }, { requestTimeoutMs: 70, urlTimeoutMs: 1000 }))
    assert.equal(report.summary.verified, 6)
    assert.equal(report.summary.unverified, 0)
  })

  it('uses a real local HTTP server for HEAD fallback, body cleanup, and redirects', async context => {
    const calls = []
    const server = http.createServer((request, response) => {
      calls.push(`${request.method} ${request.url}`)
      if (request.url === '/redirect') {
        response.writeHead(302, { location: '/resource' })
        response.end()
      } else if (request.method === 'HEAD') {
        response.writeHead(405)
        response.end()
      } else {
        response.writeHead(200, { 'content-type': 'application/octet-stream' })
        response.flushHeaders()
        // A response that never finishes proves that header validation cancels bodies.
        response.write('partial body')
      }
    })
    context.after(async () => {
      server.closeAllConnections()
      await new Promise(resolve => server.close(resolve))
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    const report = await checkExternalLinks(references(`http://127.0.0.1:${address.port}/redirect`), {
      allowPrivate: true,
      limits: { phaseTimeoutMs: 1000 },
    })
    assert.equal(report.summary.verified, 1)
    assert.deepEqual(calls, ['HEAD /redirect', 'HEAD /resource', 'GET /resource'])
    assert.equal(report.summary.requests, calls.length)
  })

  it('rejects private DNS answers in the actual connection lookup', async () => {
    const controller = new AbortController()
    await assert.rejects(requestHeaders(new URL('http://localhost/'), {
      method: 'HEAD',
      signal: controller.signal,
      allowPrivate: false,
    }), /private or local/)
  })
})
