import { ModelResult, findValues, findChoices, recognizeChoices } from '../src/choices'
import { describe, it } from 'node:test'
import assert from 'assert'

interface Resolution {
  value: string;
  index: number;
  score: number;
  synonym?: string;
}

function assertResult (result: ModelResult, start: number, end: number, text: string): void {
  assert(result.start === start, `Invalid ModelResult.start of '${result.start}' for '${text}' result.`)
  assert(result.end === end, `Invalid ModelResult.end of '${result.end}' for '${text}' result.`)
  assert(result.text === text, `Invalid ModelResult.text of '${result.text}' for '${text}' result.`)
}

function assertValue (result: ModelResult, value: string, index: number, score: number): void {
  assert(result.typeName === 'value', `Invalid ModelResult.typeName of '${result.typeName}' for '${value}' value.`)
  assert(result.resolution, `Missing ModelResult.resolution for '${value}' value.`)

  const resolution = result.resolution as Resolution
  assert(resolution.value === value, `Invalid resolution.value of '${resolution.value}' for '${value}' value.`)
  assert(resolution.index === index, `Invalid resolution.index of '${resolution.index}' for '${value}' value.`)
  assert(resolution.score === score, `Invalid resolution.score of '${resolution.score}' for '${value}' value.`)
}

function assertChoice (result: ModelResult, value: string, index: number, score: number, synonym?: string): void {
  assert(result.typeName === 'choice', `Invalid ModelResult.typeName of '${result.typeName}' for '${value}' choice.`)
  assert(result.resolution, `Missing ModelResult.resolution for '${value}' choice.`)

  const resolution = result.resolution as Resolution
  assert(resolution.value === value, `Invalid resolution.value of '${resolution.value}' for '${value}' choice.`)
  assert(resolution.index === index, `Invalid resolution.index of '${resolution.index}' for '${value}' choice.`)
  assert(resolution.score === score, `Invalid resolution.score of '${resolution.score}' for '${value}' choice.`)

  if (synonym) {
    assert(
      resolution.synonym === synonym,
            `Invalid resolution.synonym of '${resolution.synonym}' for '${value}' choice.`
    )
  }
}

describe('Choices Recognizers Tests', function () {
  describe('findValues()', function () {
    const colorValues = [
      { value: 'red', index: 0 },
      { value: 'green', index: 1 },
      { value: 'blue', index: 2 },
    ]

    const overlappingValues = [
      { value: 'bread', index: 0 },
      { value: 'bread pudding', index: 1 },
      { value: 'pudding', index: 2 },
    ]

    const similarValues = [
      { value: 'option A', index: 0 },
      { value: 'option B', index: 1 },
      { value: 'option C', index: 2 },
    ]

    const valuesWithSpecialCharacters = [
      { value: 'A < B', index: 0 },
      { value: 'A >= B', index: 1 },
      { value: 'A ??? B', index: 2 },
    ]

    it('should find a simple value in an single word utterance.', function () {
      const found = findValues('red', colorValues)
      assert(found.length === 1, `Invalid token count of '${found.length}' returned.`)
      assertResult(found[0], 0, 2, 'red')
      assertValue(found[0], 'red', 0, 1.0)
    })

    it('should find a simple value in an utterance.', function () {
      const found = findValues('the red one please.', colorValues)
      assert(found.length === 1, `Invalid token count of '${found.length}' returned.`)
      assertResult(found[0], 4, 6, 'red')
      assertValue(found[0], 'red', 0, 1.0)
    })

    it('should find multiple values within an utterance.', function () {
      const found = findValues('the red and blue ones please.', colorValues)
      assert(found.length === 2, `Invalid token count of '${found.length}' returned.`)
      assertResult(found[0], 4, 6, 'red')
      assertValue(found[0], 'red', 0, 1.0)
      assertValue(found[1], 'blue', 2, 1.0)
    })

    it('should find multiple values that overlap.', function () {
      const found = findValues('the bread pudding and bread please.', overlappingValues)
      assert(found.length === 2, `Invalid token count of '${found.length}' returned.`)
      assertResult(found[0], 4, 16, 'bread pudding')
      assertValue(found[0], 'bread pudding', 1, 1.0)
      assertValue(found[1], 'bread', 0, 1.0)
    })

    it('should correctly disambiguate between very similar values.', function () {
      const found = findValues('option B', similarValues, { allowPartialMatches: true })
      assert(found.length === 1, `Invalid token count of '${found.length}' returned.`)
      assertValue(found[0], 'option B', 1, 1.0)
    })

    it('should prefer exact match.', function () {
      const index = 1
      const utterance = valuesWithSpecialCharacters[index].value
      const found = findValues(utterance, valuesWithSpecialCharacters)
      assert(found.length === 1, `Invalid token count of '${found.length}' returned.`)
      assertValue(found[0], utterance, index, 1)
    })
  })

  const colorChoices = ['red', 'green', 'blue']
  const overlappingChoices = ['bread', 'bread pudding', 'pudding']

  describe('findChoices()', function () {
    it('should find a single choice in an utterance.', function () {
      const found = findChoices('the red one please.', colorChoices)
      assert(found.length === 1, `Invalid token count of '${found.length}' returned.`)
      assertResult(found[0], 4, 6, 'red')
      assertChoice(found[0], 'red', 0, 1.0, 'red')
    })

    it('should find multiple choices within an utterance.', function () {
      const found = findChoices('the red and blue ones please.', colorChoices)
      assert(found.length === 2, `Invalid token count of '${found.length}' returned.`)
      assertResult(found[0], 4, 6, 'red')
      assertChoice(found[0], 'red', 0, 1.0)
      assertChoice(found[1], 'blue', 2, 1.0)
    })

    it('should find multiple choices that overlap.', function () {
      const found = findChoices('the bread pudding and bread please.', overlappingChoices)
      assert(found.length === 2, `Invalid token count of '${found.length}' returned.`)
      assertResult(found[0], 4, 16, 'bread pudding')
      assertChoice(found[0], 'bread pudding', 1, 1.0)
      assertChoice(found[1], 'bread', 0, 1.0)
    })
  })

  describe('recognizeChoices()', function () {
    // TODO: add recognizer test with ordinal and number options
    it('should find a choice in an utterance by name.', function () {
      const found = recognizeChoices('the red one please.', colorChoices)
      assert(found.length === 1, `Invalid token count of '${found.length}' returned.`)
      assertResult(found[0], 4, 6, 'red')
      assertChoice(found[0], 'red', 0, 1, 'red')
    })

    it('should not find a choice if recognizeOrdinals option disabled.', function () {
      const found = recognizeChoices('first', colorChoices, { recognizeOrdinals: false })
      assert(found.length === 0, `Invalid token count of '${found.length}' returned.`)
    })

    it('should not find a choice if recognizeNumbers option disabled.', function () {
      const found = recognizeChoices('1', colorChoices, { recognizeNumbers: false })
      assert(found.length === 0, `Invalid token count of '${found.length}' returned.`)
    })

    it('should not find a choice if both recognizeOrdinals and recognizeNumbers options are disabled.', function () {
      const found = recognizeChoices('the first and third one please.', colorChoices, {
        recognizeOrdinals: false,
        recognizeNumbers: false,
      })
      assert(found.length === 0, `Invalid token count of '${found.length}' returned.`)
    })
  })
})
