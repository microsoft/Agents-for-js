import { describe, it, beforeEach } from 'node:test'
import assert from 'assert'
import sinon from 'sinon'
import { A2ATaskStore } from '../src/adapter/A2ATaskStore'

describe('A2ATaskStore', () => {
  let store: A2ATaskStore
  let mockStorage: { read: sinon.SinonStub; write: sinon.SinonStub; delete: sinon.SinonStub }

  beforeEach(() => {
    mockStorage = {
      read: sinon.stub(),
      write: sinon.stub().resolves(),
      delete: sinon.stub().resolves(),
    }
    store = new A2ATaskStore(mockStorage)
  })

  describe('makeKeyFromTaskId', () => {
    it('should prefix task id with "task-"', () => {
      assert.strictEqual(store.makeKeyFromTaskId('abc123'), 'task-abc123')
    })

    it('should handle empty string', () => {
      assert.strictEqual(store.makeKeyFromTaskId(''), 'task-')
    })

    it('should handle task ids with special characters', () => {
      assert.strictEqual(store.makeKeyFromTaskId('task-with-dashes'), 'task-task-with-dashes')
    })
  })

  describe('load', () => {
    it('should return the task when it exists in storage', async () => {
      const task = { kind: 'task', id: 'task1', contextId: 'ctx1', status: { state: 'submitted' } }
      mockStorage.read.resolves({ 'task-task1': task })

      const result = await store.load('task1')

      assert.deepStrictEqual(result, task)
      sinon.assert.calledOnceWithExactly(mockStorage.read, ['task-task1'])
    })

    it('should return undefined when the task does not exist', async () => {
      mockStorage.read.resolves({})

      const result = await store.load('nonexistent')

      assert.strictEqual(result, undefined)
      sinon.assert.calledOnceWithExactly(mockStorage.read, ['task-nonexistent'])
    })

    it('should return undefined when storage returns null for the key', async () => {
      mockStorage.read.resolves({ 'task-task1': null })

      const result = await store.load('task1')

      assert.strictEqual(result, undefined)
    })
  })

  describe('save', () => {
    it('should write the task to storage with the correct key', async () => {
      const task = { kind: 'task' as const, id: 'task1', contextId: 'ctx1', status: { state: 'submitted' as const } }

      await store.save(task as any)

      sinon.assert.calledOnce(mockStorage.write)
      const writtenData = mockStorage.write.firstCall.args[0]
      assert.deepStrictEqual(writtenData['task-task1'], task)
    })

    it('should deep copy the task to prevent mutation', async () => {
      const task = {
        kind: 'task' as const,
        id: 'task2',
        contextId: 'ctx2',
        status: { state: 'working' as const },
        history: [{ role: 'user', parts: [{ kind: 'text', text: 'hello' }] }]
      }

      await store.save(task as any)

      const writtenData = mockStorage.write.firstCall.args[0]
      // The saved data should equal the task
      assert.deepStrictEqual(writtenData['task-task2'], task)
      // But should not be the same reference
      assert.notStrictEqual(writtenData['task-task2'], task)
      assert.notStrictEqual(writtenData['task-task2'].history, task.history)
    })
  })
})
