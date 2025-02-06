import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert'
import { TurnContext, MemoryStorage } from '../../../src'
import { BotState } from '../../../src/state/botState'
import { StoreItem } from '../../../src/storage/storage'

describe('BotState', () => {
  let botState: BotState
  let mockContext: TurnContext
  let storage: MemoryStorage

  const storageKeyFactory = (): string => 'mockKey'

  beforeEach(() => {
    storage = new MemoryStorage()
    botState = new BotState(storage, storageKeyFactory)

    mockContext = {
      turnState: new Map(),
    } as unknown as TurnContext
  })

  describe('loadAsync', () => {
    test('loads state from storage if not cached', async () => {
      const initialData: StoreItem = { mockKey: { test: 'value', eTag: '1' } }
      await storage.write(initialData)

      const state = await botState.loadAsync(mockContext)

      assert.deepStrictEqual(state, { test: 'value', eTag: '1' })
    })

    test('returns cached state if present and force is false', async () => {
      mockContext.turnState.set(botState['stateKey'], {
        state: { cachedKey: 'cachedValue' },
        hash: 'mockHash',
      })

      const state = await botState.loadAsync(mockContext)

      assert.deepStrictEqual(state, { cachedKey: 'cachedValue' })
    })
  })

  describe('saveChangesAsync', () => {
    test('saves changes to storage when force is true', async () => {
      mockContext.turnState.set(botState['stateKey'], {
        state: { newKey: 'newValue' },
        hash: 'oldHash',
      })

      await botState.saveChangesAsync(mockContext, true)

      const storedItem = await storage.read(['mockKey'])
      assert.deepStrictEqual(storedItem.mockKey, {
        newKey: 'newValue',
        eTag: '1',
      })
    })
  })

  describe('clearAsync', () => {
    test('clears cached state', async () => {
      mockContext.turnState.set(botState['stateKey'], { state: { key: 'value' }, hash: 'hash' })

      await botState.clearAsync(mockContext)

      const cachedState = mockContext.turnState.get(botState['stateKey'])
      assert.deepStrictEqual(cachedState, { state: {}, hash: '' })
    })
  })

  describe('deleteAsync', () => {
    test('deletes state from storage and turnState', async () => {
      const initialData: StoreItem = { mockKey: { test: 'value' } }
      await storage.write(initialData)

      mockContext.turnState.set(botState['stateKey'], { state: { test: 'value' }, hash: 'hash' })

      await botState.deleteAsync(mockContext)

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
