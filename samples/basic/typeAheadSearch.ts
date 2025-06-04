import axios from 'axios'
import { startServer } from '@microsoft/agents-hosting-express'
import { AdaptiveCardSearchResult, AgentApplication, CardFactory, MemoryStorage, MessageFactory, TurnContext, TurnState } from '@microsoft/agents-hosting'

interface packageResult {
  package: {
    name: string
    description: string
  }
}

const app = new AgentApplication<TurnState>({ storage: new MemoryStorage() })
app.onConversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity('Hello and welcome! With this sample you can see the functionality of static and dynamic search in adaptive card')
})

app.adaptiveCards.search('', async (context: TurnContext, state: TurnState) => {
  const dropdownCard = (context.activity.value! as any).data.choiceselect

  let result
  if (dropdownCard) {
    result = getCountrySpecificResults(dropdownCard.toLowerCase())
    return Promise.resolve(result)
  } else {
    const searchQuery = (context.activity.value! as any).queryText
    if (searchQuery.lengh < 4) {
      return []
    }
    const params = { text: searchQuery, size: 8 }
    const response = await axios.get('http://registry.npmjs.com/-/v1/search?', { params })

    const npmPackages: AdaptiveCardSearchResult[] = response.data.objects.map((obj: packageResult) => ({
      title: obj.package.name,
      value: `${obj.package.name} - ${obj.package.description}`
    }))
    if (response.status === 200) {
      return Promise.resolve(npmPackages)
    } else if (response.status === 204) {
      return Promise.resolve([{ title: 'No results found', value: 'No results found' }])
    } else if (response.status === 500) {
      return Promise.resolve([{ title: 'Error', value: 'Error message: Internal Server Error' }])
    }
  }
  return Promise.resolve([])
})

app.onActivity('message', async (context: TurnContext, state: TurnState) => {
  const text = context.activity.text?.toLowerCase().trim()
  const value = context.activity.value

  if (text) {
    switch (text) {
      case 'staticsearch':
        await context.sendActivity(MessageFactory.attachment(CardFactory.adaptiveCard(staticSearchCard)))
        break
      case 'dynamicsearch':
        await context.sendActivity(MessageFactory.attachment(CardFactory.adaptiveCard(dynamicSearchCard)))
        break
      case 'dependantdropdown':
        await context.sendActivity(MessageFactory.attachment(CardFactory.adaptiveCard(dependantSearchCard)))
        break
      default:
        await context.sendActivity("Unknown command. Please use 'staticsearch', 'dynamicsearch', or 'dependantdropdown'.")
    }
  } else if (value) {
    await context.sendActivity(`Selected option is: ${(value as any).choiceselect}`)
  }
})

startServer(app)

const staticSearchCard = {
  $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
  version: '1.2',
  type: 'AdaptiveCard',
  body: [
    {
      text: 'Please search for the IDE from static list.',
      wrap: true,
      type: 'TextBlock'
    },
    {
      columns: [
        {
          width: 'auto',
          items: [
            {
              text: 'IDE: ',
              wrap: true,
              height: 'stretch',
              type: 'TextBlock'
            }
          ],
          type: 'Column'
        }
      ],
      type: 'ColumnSet'
    },
    {
      columns: [
        {
          width: 'stretch',
          items: [
            {
              choices: [
                { title: 'Visual studio', value: 'visual_studio' },
                { title: 'IntelliJ IDEA', value: 'intelliJ_IDEA' },
                { title: 'Aptana Studio 3', value: 'aptana_studio_3' },
                { title: 'PyCharm', value: 'pycharm' },
                { title: 'PhpStorm', value: 'phpstorm' },
                { title: 'WebStorm', value: 'webstorm' },
                { title: 'NetBeans', value: 'netbeans' },
                { title: 'Eclipse', value: 'eclipse' },
                { title: 'RubyMine', value: 'rubymine' },
                { title: 'Visual studio code', value: 'visual_studio_code' }
              ],
              style: 'filtered',
              placeholder: 'Search for an IDE',
              id: 'choiceselect',
              type: 'Input.ChoiceSet'
            }
          ],
          type: 'Column'
        }
      ],
      type: 'ColumnSet'
    }
  ],
  actions: [
    {
      type: 'Action.Submit',
      id: 'submit',
      title: 'Submit'
    }
  ]
}

const dynamicSearchCard = {
  $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
  version: '1.2',
  type: 'AdaptiveCard',
  body: [
    {
      text: 'Please search for npm packages using dynamic search control.',
      wrap: true,
      type: 'TextBlock'
    },
    {
      columns: [
        {
          width: 'auto',
          items: [
            {
              text: 'NPM packages search: ',
              wrap: true,
              height: 'stretch',
              type: 'TextBlock'
            }
          ],
          type: 'Column'
        }
      ],
      type: 'ColumnSet'
    },
    {
      columns: [
        {
          width: 'stretch',
          items: [
            {
              choices: [
                { title: 'Static Option 1', value: 'static_option_1' },
                { title: 'Static Option 2', value: 'static_option_2' },
                { title: 'Static Option 3', value: 'static_option_3' }
              ],
              isMultiSelect: false,
              style: 'filtered',
              'choices.data': {
                type: 'Data.Query',
                dataset: 'npmpackages'
              },
              id: 'choiceselect',
              type: 'Input.ChoiceSet'
            }
          ],
          type: 'Column'
        }
      ],
      type: 'ColumnSet'
    }
  ],
  actions: [
    {
      type: 'Action.Submit',
      id: 'submitdynamic',
      title: 'Submit'
    }
  ]
}

const dependantSearchCard = {
  type: 'AdaptiveCard',
  $schema: 'https://adaptivecards.io/schemas/adaptive-card.json',
  version: '1.5',
  body: [
    {
      size: 'ExtraLarge',
      text: 'Country Picker',
      weight: 'Bolder',
      wrap: true,
      type: 'TextBlock'
    },
    {
      id: 'choiceselect',
      type: 'Input.ChoiceSet',
      label: 'Select a country or region:',
      choices: [
        { title: 'USA', value: 'usa' },
        { title: 'France', value: 'france' },
        { title: 'India', value: 'india' }
      ],
      valueChangedAction: {
        type: 'Action.ResetInputs',
        targetInputIds: ['city']
      },
      isRequired: true,
      errorMessage: 'Please select a country or region'
    },
    {
      style: 'filtered',
      'choices.data': {
        type: 'Data.Query',
        dataset: 'cities',
        associatedInputs: 'auto'
      },
      id: 'city',
      type: 'Input.ChoiceSet',
      label: 'Select a city:',
      placeholder: 'Type to search for a city in the selected country',
      isRequired: true,
      errorMessage: 'Please select a city'
    }
  ],
  actions: [
    {
      title: 'Submit',
      type: 'Action.Submit'
    }
  ]
}

function getCountrySpecificResults (country: 'usa' | 'france' | 'india') : AdaptiveCardSearchResult[] {
  const results = {
    usa: [
      { title: 'CA', value: 'CA' },
      { title: 'FL', value: 'FL' },
      { title: 'TX', value: 'TX' }
    ],
    france: [
      { title: 'Paris', value: 'Paris' },
      { title: 'Lyon', value: 'Lyon' },
      { title: 'Nice', value: 'Nice' }
    ],
    india: [
      { title: 'Delhi', value: 'Delhi' },
      { title: 'Mumbai', value: 'Mumbai' },
      { title: 'Pune', value: 'Pune' }
    ]
  }
  return results[country] || []
}
