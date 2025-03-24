// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { BotStatePropertyAccessor, TurnContext, UserState } from '@microsoft/agents-hosting'

import {
  ComponentDialog,
  DialogSet,
  DialogTurnStatus,
  NumberPrompt,
  PromptValidatorContext,
  TextPrompt,
  WaterfallDialog,
  WaterfallStepContext
} from '@microsoft/agents-hosting-dialogs'
import { SlotDetails } from './slotDetails'
import { SlotFillingDialog } from './slotFillingDialog'

export class RootDialog extends ComponentDialog {
  private userStateAccessor: BotStatePropertyAccessor<SlotDetails>

  constructor (userState: UserState) {
    super('root')
    this.userStateAccessor = userState.createProperty('result')

    // Set up a series of questions for collecting the user's name.
    const fullnameSlots = [
      new SlotDetails('first', 'text', 'Please enter your first name.'),
      new SlotDetails('last', 'text', 'Please enter your last name.')
    ]

    // Set up a series of questions to collect a street address.
    const addressSlots = [
      new SlotDetails('street', 'text', 'Please enter your street address.'),
      new SlotDetails('city', 'text', 'Please enter the city.'),
      new SlotDetails('zip', 'text', 'Please enter your zipcode.')
    ]

    // Link the questions together into a parent group that contains references
    // to both the fullname and address questions defined above.
    const slots = [
      new SlotDetails('fullname', 'fullname'),
      new SlotDetails('age', 'number', 'Please enter your age.'),
      new SlotDetails('shoesize', 'shoesize', 'Please enter your shoe size.', 'You must enter a size between 0 and 16. Half sizes are acceptable.'),
      new SlotDetails('address', 'address')
    ]

    // Add the individual child dialogs and prompts used.
    // Note that the built-in prompts work hand-in-hand with our custom SlotFillingDialog class
    // because they are both based on the provided Dialog class.
    this.addDialog(new SlotFillingDialog('address', addressSlots))
    this.addDialog(new SlotFillingDialog('fullname', fullnameSlots))
    this.addDialog(new TextPrompt('text'))
    this.addDialog(new NumberPrompt('number'))
    this.addDialog(new NumberPrompt('shoesize', this.shoeSizeValidator))
    this.addDialog(new SlotFillingDialog('slot-dialog', slots))

    // Finally, add a 2-step WaterfallDialog that will initiate the SlotFillingDialog,
    // and then collect and display the results.
    this.addDialog(new WaterfallDialog('root', [
      this.startDialog.bind(this),
      this.processResults.bind(this)
    ]))

    this.initialDialogId = 'root'
  }

  async run (context: TurnContext, accessor: BotStatePropertyAccessor) {
    const dialogSet = new DialogSet(accessor)
    dialogSet.add(this)

    const dialogContext = await dialogSet.createContext(context)
    const results = await dialogContext.continueDialog()
    if (results.status === DialogTurnStatus.empty) {
      await dialogContext.beginDialog(this.id)
    }
  }

  async startDialog (stepContext: WaterfallStepContext) {
    return await stepContext.beginDialog('slot-dialog')
  }

  async processResults (stepContext: WaterfallStepContext) {
    // Each "slot" in the SlotFillingDialog is represented by a field in step.result.values.
    // The complex that contain subfields have their own .values field containing the sub-values.
    const values = stepContext.result.values

    const fullname = values.fullname.values
    await stepContext.context.sendActivity(`Your name is ${fullname.first} ${fullname.last}.`)

    await stepContext.context.sendActivity(`You wear a size ${values.shoesize} shoes.`)

    const address = values.address.values
    await stepContext.context.sendActivity(`Your address is: ${address.street}, ${address.city} ${address.zip}`)

    return await stepContext.endDialog()
  }

  async shoeSizeValidator (promptContext: PromptValidatorContext<number>) {
    if (promptContext.recognized.succeeded) {
      const shoesize = promptContext.recognized.value ?? -1

      // Shoe sizes can range from 0 to 16.
      if (shoesize >= 0 && shoesize <= 16) {
        // We only accept round numbers or half sizes.
        if (Math.floor(shoesize) === shoesize || Math.floor(shoesize * 2) === shoesize * 2) {
          // Indicate success.
          return true
        }
      }
    }

    return false
  }
}
