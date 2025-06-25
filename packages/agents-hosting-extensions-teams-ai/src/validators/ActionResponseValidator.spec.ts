import { strict as assert } from 'assert'
import { TestAdapter } from '../internals/testing/TestAdapter'
import { TestTurnState } from '../internals/testing/TestTurnState'
import { ChatCompletionAction } from '../models'
import { Message } from '../prompts'
import { GPTTokenizer } from '../tokenizers'
import { ActionResponseValidator } from './ActionResponseValidator'

describe('ActionResponseValidator', () => {
  const adapter = new TestAdapter()
  const tokenizer = new GPTTokenizer()
  const actions: ChatCompletionAction[] = [
    {
      name: 'test',
      description: 'test action',
      parameters: {
        type: 'object',
        properties: {
          foo: {
            type: 'string'
          }
        },
        required: ['foo']
      }
    },
    {
      name: 'empty',
      description: 'empty test action'
    }
  ]
  const validTestCall: Message = {
    role: 'assistant',
    content: undefined,
    function_call: {
      name: 'test',
      arguments: '{"foo":"bar"}'
    }
  }
  const invalidTestCall: Message = {
    role: 'assistant',
    content: undefined,
    function_call: {
      name: 'test'
    }
  }
  const emptyCall: Message = {
    role: 'assistant',
    content: undefined,
    function_call: {
      name: 'empty'
    }
  }
  const textMessage: Message = {
    role: 'assistant',
    content: 'test'
  }
  const invalidActionCall: Message = {
    role: 'assistant',
    content: undefined,
    function_call: {
      name: 'invalid'
    }
  }

  describe('constructor', () => {
    it('should create a ActionResponseValidator', () => {
      const validator = new ActionResponseValidator(actions, false)
      assert.notEqual(validator, undefined)
      assert.deepEqual(validator.actions, actions)
    })
  })

  describe('validateResponse', () => {
    it('should pass a valid function with correct params', async () => {
      await adapter.sendTextToBot('test', async (context) => {
        const state = await TestTurnState.create(context)
        const validator = new ActionResponseValidator(actions, false)
        const response = await validator.validateResponse(
          context,
          state,
          tokenizer,
          { status: 'success', message: validTestCall },
          3
        )
        assert.notEqual(response, undefined)
        assert.equal(response.valid, true)
        assert.equal(response.feedback, undefined)
        assert.deepEqual(response.value, { name: 'test', parameters: { foo: 'bar' } })
      })
    })

    it('should fail a valid function with incorrect params', async () => {
      await adapter.sendTextToBot('test', async (context) => {
        const state = await TestTurnState.create(context)
        const validator = new ActionResponseValidator(actions, false)
        const response = await validator.validateResponse(
          context,
          state,
          tokenizer,
          { status: 'success', message: invalidTestCall },
          3
        )
        assert.notEqual(response, undefined)
        assert.equal(response.valid, false)
        assert.notEqual(response.feedback, undefined)
        assert.equal(response.value, undefined)
      })
    })

    it('should pass an empty function call', async () => {
      await adapter.sendTextToBot('test', async (context) => {
        const state = await TestTurnState.create(context)
        const validator = new ActionResponseValidator(actions, false)
        const response = await validator.validateResponse(
          context,
          state,
          tokenizer,
          { status: 'success', message: emptyCall },
          3
        )
        assert.notEqual(response, undefined)
        assert.equal(response.valid, true)
        assert.deepEqual(response.value, { name: 'empty', parameters: {} })
      })
    })

    it('should pass a text message with isRequired = false', async () => {
      await adapter.sendTextToBot('test', async (context) => {
        const state = await TestTurnState.create(context)
        const validator = new ActionResponseValidator(actions, false)
        const response = await validator.validateResponse(
          context,
          state,
          tokenizer,
          { status: 'success', message: textMessage },
          3
        )
        assert.notEqual(response, undefined)
        assert.equal(response.valid, true)
        assert.equal(response.feedback, undefined)
        assert.equal(response.value, undefined)
      })
    })

    it('should fail a text message with isRequired = true', async () => {
      await adapter.sendTextToBot('test', async (context) => {
        const state = await TestTurnState.create(context)
        const validator = new ActionResponseValidator(actions, true)
        const response = await validator.validateResponse(
          context,
          state,
          tokenizer,
          { status: 'success', message: textMessage },
          3
        )
        assert.notEqual(response, undefined)
        assert.equal(response.valid, false)
        assert.notEqual(response.feedback, undefined)
        assert.equal(response.value, undefined)
      })
    })

    it('should fail an invalid function call', async () => {
      await adapter.sendTextToBot('test', async (context) => {
        const state = await TestTurnState.create(context)
        const validator = new ActionResponseValidator(actions, false)
        const response = await validator.validateResponse(
          context,
          state,
          tokenizer,
          { status: 'success', message: invalidActionCall },
          3
        )
        assert.notEqual(response, undefined)
        assert.equal(response.valid, false)
        assert.notEqual(response.feedback, undefined)
        assert.equal(response.value, undefined)
      })
    })
  })
})
