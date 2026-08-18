/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from 'assert'
import { createServer } from 'node:http'
import { describe, it } from 'node:test'
import { INetworkModule, NetworkRequestOptions, NetworkResponse } from '@azure/msal-node'
import { DEFAULT_MSAL_RETRY_COUNT, MsalHttpRetryHandlerHelper } from '../../src/auth/msal/msalHttpRetryHandlerHelper'

class SequenceNetworkClient implements INetworkModule {
  public getCalls = 0
  public postCalls = 0
  public getTimeouts: Array<number | undefined> = []

  public constructor (private readonly statuses: number[]) {}

  public async sendGetRequestAsync<T> (
    _url: string,
    _options?: NetworkRequestOptions,
    timeout?: number
  ): Promise<NetworkResponse<T>> {
    this.getCalls++
    this.getTimeouts.push(timeout)
    return this.nextResponse<T>(this.getCalls)
  }

  public async sendPostRequestAsync<T> (
    _url: string,
    _options?: NetworkRequestOptions
  ): Promise<NetworkResponse<T>> {
    this.postCalls++
    return this.nextResponse<T>(this.postCalls)
  }

  private nextResponse<T> (call: number): NetworkResponse<T> {
    const status = this.statuses[Math.min(call - 1, this.statuses.length - 1)]
    return { headers: {}, body: { status } as T, status }
  }
}

describe('MsalHttpRetryHandlerHelper', () => {
  it('should return a successful response without retrying', async () => {
    const networkClient = new SequenceNetworkClient([200])
    const helper = new MsalHttpRetryHandlerHelper(networkClient, 4)

    const response = await helper.sendGetRequestAsync('https://example.com')

    assert.strictEqual(response.status, 200)
    assert.strictEqual(networkClient.getCalls, 1)
  })

  it('should retry 408 responses until a request succeeds', async () => {
    const networkClient = new SequenceNetworkClient([408, 408, 408, 200])
    const helper = new MsalHttpRetryHandlerHelper(networkClient, 4)

    const response = await helper.sendPostRequestAsync('https://example.com')

    assert.strictEqual(response.status, 200)
    assert.strictEqual(networkClient.postCalls, 4)
  })

  it('should return a non-408 failure without retrying', async () => {
    const networkClient = new SequenceNetworkClient([400])
    const helper = new MsalHttpRetryHandlerHelper(networkClient, 4)

    const response = await helper.sendPostRequestAsync('https://example.com')

    assert.strictEqual(response.status, 400)
    assert.strictEqual(networkClient.postCalls, 1)
  })

  it('should return the final 408 response after exhausting all retries', async () => {
    const networkClient = new SequenceNetworkClient([408])
    const helper = new MsalHttpRetryHandlerHelper(networkClient, 4)

    const response = await helper.sendGetRequestAsync('https://example.com')

    assert.strictEqual(response.status, 408)
    assert.strictEqual(networkClient.getCalls, 5)
  })

  it('should use the default retry count and forward GET timeouts', async () => {
    const networkClient = new SequenceNetworkClient([408])
    const helper = new MsalHttpRetryHandlerHelper(networkClient)

    await helper.sendGetRequestAsync('https://example.com', undefined, 1234)

    assert.strictEqual(networkClient.getCalls, DEFAULT_MSAL_RETRY_COUNT + 1)
    assert.deepStrictEqual(networkClient.getTimeouts, Array(DEFAULT_MSAL_RETRY_COUNT + 1).fill(1234))
  })

  it('should allow zero to disable retries', async () => {
    const networkClient = new SequenceNetworkClient([408])
    const helper = new MsalHttpRetryHandlerHelper(networkClient, 0)

    const response = await helper.sendGetRequestAsync('https://example.com')

    assert.strictEqual(response.status, 408)
    assert.strictEqual(networkClient.getCalls, 1)
  })

  it('should normalize fractional retry counts', async () => {
    const networkClient = new SequenceNetworkClient([408])
    const helper = new MsalHttpRetryHandlerHelper(networkClient, 1.7)

    await helper.sendGetRequestAsync('https://example.com')

    assert.strictEqual(networkClient.getCalls, 2)
  })

  it('should retry real HTTP 408 responses using the default MSAL HTTP client', async () => {
    let requests = 0
    const server = createServer((_request, response) => {
      requests++
      const status = requests <= 2 ? 408 : 200
      response.writeHead(status, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ success: status === 200 }))
    })

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    assert.ok(address && typeof address !== 'string')

    try {
      const helper = new MsalHttpRetryHandlerHelper()
      const response = await helper.sendPostRequestAsync<{ success: boolean }>(
        `http://127.0.0.1:${address.port}/token`,
        { body: 'grant_type=client_credentials' }
      )

      assert.strictEqual(response.status, 200)
      assert.strictEqual(response.body.success, true)
      assert.strictEqual(requests, 3)
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve())
      })
    }
  })
})
