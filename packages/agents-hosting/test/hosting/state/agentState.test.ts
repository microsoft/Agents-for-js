import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert'
import { TurnContext, MemoryStorage } from '../../../src'
import { AgentState } from '../../../src/state/agentState'
import {
  StorageDeleteResults,
  StorageOperationStatus,
  StorageReadResults,
  Storage,
  StorageV2,
  StorageVersions,
  StorageWriteOptions,
  StorageWriteResults,
  StoreItem,
} from '../../../src/storage/storage'

class FailedWriteStorage implements StorageV2 {
  readonly storageVersion = StorageVersions.V2

  async read<T extends object> (keys: string[]): Promise<StorageReadResults<T>> {
    return Object.fromEntries(keys.map(key => [key, { key, status: StorageOperationStatus.NotFound }]))
  }

  async write<T extends object> (changes: Record<string, T>): Promise<StorageWriteResults> {
    return Object.fromEntries(Object.keys(changes).map(key => [key, { key, status: StorageOperationStatus.Conflict }]))
  }

  async delete (keys: string[]): Promise<StorageDeleteResults> {
    return Object.fromEntries(keys.map(key => [key, { key, status: StorageOperationStatus.NotFound }]))
  }
}

class RecordingAgentStateStorage implements StorageV2 {
  readonly storageVersion = StorageVersions.V2
  changes?: Record<string, object>
  options?: StorageWriteOptions

  async read<T extends object> (keys: string[]): Promise<StorageReadResults<T>> {
    const value = { newKey: 'oldValue', eTag: 'business-value' } as unknown as T
    return {
      [keys[0]]: {
        key: keys[0],
        status: StorageOperationStatus.Succeeded,
        value,
        version: 'version-1',
      }
    }
  }

  async write<T extends object> (changes: Record<string, T>, options?: StorageWriteOptions): Promise<StorageWriteResults> {
    this.changes = changes
    this.options = options
    const key = Object.keys(changes)[0]
    return { [key]: { key, status: StorageOperationStatus.Succeeded, version: 'version-2' } }
  }

  async delete (keys: string[]): Promise<StorageDeleteResults> {
    return Object.fromEntries(keys.map(key => [key, { key, status: StorageOperationStatus.Succeeded }]))
  }
}

class ReplaceableAgentState extends AgentState {
  setStorage (storage: Storage): void {
    this.storage = storage
  }
}

let fieldStorage: Storage
class FieldReplacingAgentState extends AgentState {
  protected storage = fieldStorage
}

describe('AgentState', () => {
  let botState: AgentState
  let mockContext: TurnContext
  let storage: MemoryStorage

  const storageKeyFactory = (): string => 'mockKey'

  beforeEach(() => {
    storage = new MemoryStorage()
    botState = new AgentState(storage, storageKeyFactory)

    mockContext = {
      turnState: new Map(),
    } as unknown as TurnContext
  })

  describe('load', () => {
    test('loads state from storage if not cached', async () => {
      const initialData: StoreItem = { mockKey: { test: 'value', eTag: '1' } }
      await storage.write(initialData)

      const state = await botState.load(mockContext)

      assert.deepStrictEqual(state, { test: 'value', eTag: '1' })
    })

    test('returns cached state if present and force is false', async () => {
      mockContext.turnState.set(botState['stateKey'], {
        state: { cachedKey: 'cachedValue' },
        hash: 'mockHash',
      })

      const state = await botState.load(mockContext)

      assert.deepStrictEqual(state, { cachedKey: 'cachedValue' })
    })

    test('uses storage replaced by a subclass', async () => {
      const replacement = new MemoryStorage()
      await replacement.write({ mockKey: { source: 'replacement' } })
      const replaceableState = new ReplaceableAgentState(storage, storageKeyFactory)
      replaceableState.setStorage(replacement)

      const state = await replaceableState.load(mockContext)

      assert.strictEqual(state.source, 'replacement')
    })

    test('uses storage replaced by a subclass field initializer', async () => {
      const replacement = new MemoryStorage()
      await storage.write({ mockKey: { source: 'original' } })
      await replacement.write({ mockKey: { source: 'replacement' } })
      fieldStorage = replacement
      const replaceableState = new FieldReplacingAgentState(storage, storageKeyFactory)

      const state = await replaceableState.load(mockContext)

      assert.strictEqual(state.source, 'replacement')
    })
  })

  describe('saveChanges', () => {
    test('saves changes to storage when force is true', async () => {
      mockContext.turnState.set(botState['stateKey'], {
        state: { newKey: 'newValue' },
        hash: 'oldHash',
      })

      await botState.saveChanges(mockContext, true)

      const storedItem = await storage.read(['mockKey'])
      assert.deepStrictEqual(storedItem.mockKey, {
        newKey: 'newValue',
        eTag: '1',
      })
    })

    test('saves custom key without namespace segment', async () => {
      mockContext.turnState.set(botState['stateKey'], {
        state: { newKey: 'newValue' },
        hash: 'oldHash',
      })

      await botState.saveChanges(mockContext, true, { channelId: 'channel', conversationId: 'conversation' })

      const storedItem = await storage.read(['channel/conversations/conversation'])
      assert.deepStrictEqual(storedItem['channel/conversations/conversation'], {
        newKey: 'newValue',
        eTag: '1',
      })
    })

    test('saves custom key with namespace', async () => {
      mockContext.turnState.set(botState['stateKey'], {
        state: { newKey: 'newValue' },
        hash: 'oldHash',
      })

      await botState.saveChanges(mockContext, true, { channelId: 'channel', conversationId: 'conversation', namespace: 'namespace' })

      const storedItem = await storage.read(['channel/conversations/conversation/namespace'])
      assert.deepStrictEqual(storedItem['channel/conversations/conversation/namespace'], {
        newKey: 'newValue',
        eTag: '1',
      })
    })

    test('does not save unchanged circular state', async () => {
      const circularState: Record<string, any> = { newKey: 'newValue' }
      circularState.self = circularState
      const hash = botState['calculateChangeHash'](circularState)
      mockContext.turnState.set(botState['stateKey'], {
        state: circularState,
        hash,
      })

      await botState.saveChanges(mockContext, false)

      const storedItem = await storage.read(['mockKey'])
      assert.strictEqual(Object.keys(storedItem).length, 0)
    })

    test('detects changed circular state', () => {
      const circularState: Record<string, any> = { newKey: 'newValue' }
      circularState.self = circularState
      const hash = botState['calculateChangeHash'](circularState)

      circularState.newKey = 'updatedValue'
      const updatedHash = botState['calculateChangeHash'](circularState)

      assert.notStrictEqual(updatedHash, hash)
    })

    test('does not update the cached hash when a V2 write fails', async () => {
      const failedState = new AgentState(new FailedWriteStorage(), storageKeyFactory)
      mockContext.turnState.set(failedState['stateKey'], {
        state: { newKey: 'newValue' },
        hash: 'oldHash',
      })

      await assert.rejects(
        failedState.saveChanges(mockContext, true),
        /write failed for key "mockKey" with status "conflict"/
      )

      assert.strictEqual(mockContext.turnState.get(failedState['stateKey']).hash, 'oldHash')
    })

    test('keeps V2 writes unconditional without adding a wildcard legacy eTag', async () => {
      const storageV2 = new RecordingAgentStateStorage()
      const state = new AgentState(storageV2, storageKeyFactory)
      const loaded = await state.load(mockContext)
      loaded.newKey = 'newValue'

      await state.saveChanges(mockContext)

      assert.strictEqual(storageV2.options, undefined)
      assert.deepStrictEqual(storageV2.changes, {
        mockKey: { newKey: 'newValue', eTag: 'business-value' },
      })
    })
  })

  describe('clear', () => {
    test('clears cached state', async () => {
      mockContext.turnState.set(botState['stateKey'], { state: { key: 'value' }, hash: 'hash' })

      await botState.clear(mockContext)

      const cachedState = mockContext.turnState.get(botState['stateKey'])
      assert.deepStrictEqual(cachedState, { state: {}, hash: '' })
    })
  })

  describe('delete', () => {
    test('deletes state from storage and turnState', async () => {
      const initialData: StoreItem = { mockKey: { test: 'value' } }
      await storage.write(initialData)

      mockContext.turnState.set(botState['stateKey'], { state: { test: 'value' }, hash: 'hash' })

      await botState.delete(mockContext)

      const storedItem = await storage.read(['mockKey'])
      assert.strictEqual(Object.keys(storedItem).length, 0)
      assert.strictEqual(mockContext.turnState.has(botState['stateKey']), false)
    })
  })

  describe('get', () => {
    test('returns cached state from turnState', () => {
      mockContext.turnState.set(botState['stateKey'], { state: { test: 'value' } })

      const state = botState.get(mockContext)

      assert.deepStrictEqual(state, { test: 'value' })
    })

    test('returns undefined if state is not an object', () => {
      mockContext.turnState.set(botState['stateKey'], 'invalidState')

      const state = botState.get(mockContext)

      assert.strictEqual(state, undefined)
    })
  })
})
