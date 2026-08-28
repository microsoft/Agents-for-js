import assert from 'node:assert'
import { describe, it } from 'node:test'
import { Activity } from '@microsoft/agents-activity'
import { HandlerStorage } from '../../../src/app/auth/handlerStorage'
import { ActiveAuthorizationHandler } from '../../../src/app/auth/types'
import {
  StorageOperationStatus,
  StorageReadResults,
  StorageV2,
  StorageVersions,
  StorageWriteOptions,
  StorageWriteResults,
} from '../../../src/storage'
import { TurnContext } from '../../../src/turnContext'
import { BaseAdapter } from '../../../src/baseAdapter'

class RecordingHandlerStorage implements StorageV2 {
  readonly storageVersion = StorageVersions.V2
  changes?: Record<string, object>
  options?: StorageWriteOptions

  async read<T extends object> (keys: string[]): Promise<StorageReadResults<T>> {
    const value = {
      id: 'handler',
      activity: Activity.fromObject({ type: 'message' }),
    } as unknown as T
    return { [keys[0]]: {
      key: keys[0],
      status: StorageOperationStatus.Succeeded,
      value,
      version: 'version-1',
    } }
  }

  async write<T extends object> (changes: Record<string, T>, options?: StorageWriteOptions): Promise<StorageWriteResults> {
    this.changes = changes
    this.options = options
    const key = Object.keys(changes)[0]
    return { [key]: { key, status: StorageOperationStatus.Succeeded, version: 'version-2' } }
  }

  async delete (keys: string[]) {
    return { [keys[0]]: { key: keys[0], status: StorageOperationStatus.Succeeded } }
  }
}

describe('HandlerStorage', () => {
  it('shares the read version through cloned turn contexts and removes legacy eTag metadata', async () => {
    const storage = new RecordingHandlerStorage()
    const adapter = {} as BaseAdapter
    const context = new TurnContext(adapter, Activity.fromObject({
      type: 'message',
      channelId: 'channel',
      from: { id: 'user' },
    }))
    const reader = new HandlerStorage(storage, context)
    const active = await reader.read()
    const writer = new HandlerStorage(storage, new TurnContext(context))

    await writer.write({ ...active, eTag: 'legacy-version' } as ActiveAuthorizationHandler)

    assert.deepStrictEqual(storage.options, { expectedVersion: 'version-1' })
    assert.deepStrictEqual(storage.changes, {
      'auth/channel/user': {
        id: 'handler',
        activity: Activity.fromObject({ type: 'message' }),
      },
    })
  })
})
