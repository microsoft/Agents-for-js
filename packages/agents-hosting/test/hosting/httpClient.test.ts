import { strict as assert } from 'node:assert'
import http from 'node:http'
import { Readable } from 'node:stream'
import { describe, it } from 'node:test'
import { HttpClient, HttpError } from '../../src'

describe('HttpClient', () => {
  it('merges content-type headers without sending duplicates', async () => {
    let requestHeaders: http.IncomingHttpHeaders | undefined
    let requestBody = ''

    const server = http.createServer((req, res) => {
      requestHeaders = req.headers
      req.setEncoding('utf8')
      req.on('data', (chunk) => {
        requestBody += chunk
      })
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{"ok":true}')
      })
    })

    await new Promise<void>((resolve) => {
      server.listen(0, resolve)
    })

    const port = (server.address() as http.AddressInfo).port
    const client = new HttpClient({
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-token'
      }
    })

    try {
      await client.post(`http://127.0.0.1:${port}/activities`, { text: 'hello' }, {
        headers: {
          'Content-Type': 'application/json'
        }
      })
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    }

    assert.strictEqual(requestHeaders?.['content-type'], 'application/json')
    assert.strictEqual(requestBody, '{"text":"hello"}')
  })

  it('does not include an undefined code in serialized HttpError output', () => {
    const error = new HttpError(
      'Request failed with status 415',
      {
        data: { error: 'unsupported media type' },
        status: 415,
        statusText: 'Unsupported Media Type',
        headers: new Headers(),
        config: {
          method: 'post',
          url: '/activities'
        }
      },
      {
        method: 'post',
        url: '/activities'
      }
    )

    assert.deepStrictEqual(error.toJSON(), {
      message: 'Request failed with status 415',
      status: 415,
      config: {
        url: '/activities',
        method: 'post',
        data: undefined,
      },
      response: {
        status: 415,
        statusText: 'Unsupported Media Type',
        data: { error: 'unsupported media type' },
      }
    })
  })

  it('defaults Content-Type to application/json for JSON request bodies', async () => {
    let requestHeaders: http.IncomingHttpHeaders | undefined
    let requestBody = ''

    const server = http.createServer((req, res) => {
      requestHeaders = req.headers
      req.setEncoding('utf8')
      req.on('data', (chunk) => {
        requestBody += chunk
      })
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{"ok":true}')
      })
    })

    await new Promise<void>((resolve) => {
      server.listen(0, resolve)
    })

    const port = (server.address() as http.AddressInfo).port
    const client = new HttpClient()

    try {
      await client.post(`http://127.0.0.1:${port}/json`, { hello: 'world' })
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    }

    assert.strictEqual(requestHeaders?.['content-type'], 'application/json')
    assert.strictEqual(requestBody, '{"hello":"world"}')
  })

  it('defaults Content-Type to x-www-form-urlencoded for URLSearchParams bodies', async () => {
    let requestHeaders: http.IncomingHttpHeaders | undefined
    let requestBody = ''

    const server = http.createServer((req, res) => {
      requestHeaders = req.headers
      req.setEncoding('utf8')
      req.on('data', (chunk) => {
        requestBody += chunk
      })
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{"ok":true}')
      })
    })

    await new Promise<void>((resolve) => {
      server.listen(0, resolve)
    })

    const port = (server.address() as http.AddressInfo).port
    const client = new HttpClient()

    try {
      await client.post(`http://127.0.0.1:${port}/form`, new URLSearchParams({ hello: 'world', foo: 'bar baz' }))
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    }

    assert.strictEqual(requestHeaders?.['content-type'], 'application/x-www-form-urlencoded;charset=utf-8')
    assert.strictEqual(requestBody, 'hello=world&foo=bar+baz')
  })

  it('returns a Node readable stream when responseType is stream', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' })
      res.write('chunk-1')
      res.end('chunk-2')
    })

    await new Promise<void>((resolve) => {
      server.listen(0, resolve)
    })

    const port = (server.address() as http.AddressInfo).port
    const client = new HttpClient()

    try {
      const response = await client.get<NodeJS.ReadableStream>(`http://127.0.0.1:${port}/stream`, {
        responseType: 'stream'
      })

      assert.ok(response.data instanceof Readable)

      const chunks: Buffer[] = []
      for await (const chunk of response.data as AsyncIterable<string | Buffer>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }

      assert.strictEqual(Buffer.concat(chunks).toString('utf8'), 'chunk-1chunk-2')
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    }
  })

  it('throws a clear error when given a relative URL without a baseURL', async () => {
    const client = new HttpClient()

    await assert.rejects(
      client.get('/v3/conversations'),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /HttpClient requires baseURL when using a relative URL: \/v3\/conversations/)
        return true
      }
    )
  })
})
