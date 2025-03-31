# @microsoft/agents-hosting-dialogs

> Port  https://github.com/microsoft/botbuilder-js/tree/main/libraries/botbuilder-dialogs to enable migrating to the new Agents SDK.

## Overview

This module includes a system for managing multi-turn conversations within a Microsoft Botbuilder app, including
tools for creating and managing dialog systems, a means for creating custom interoperable dialog systems, and a series
of useful prompts that provide type checking and validation of input.

## How to use

```javascript
// Import some of the capabilities from the module. 
const { DialogSet, WaterfallDialog } = require("@microsoft/agents-hosting-dialogs");
```

Then, create one or more `DialogSet` objects to manage the dialogs used in your agent.
A DialogSet is used to collect and execute dialogs. An agent may have more than one
DialogSet, which can be used to group dialogs logically and avoid name collisions.

Then, create one or more dialogs and add them to the DialogSet. Use the WaterfallDialog
class to construct dialogs defined by a series of functions for sending and receiving input
that will be executed in order.

More sophisticated multi-dialog sets can be created using the `ComponentDialog` class, which
contains a DialogSet, is itself also a dialog that can be triggered like any other. By building on top ComponentDialog,
developer can bundle multiple dialogs into a single unit which can then be packaged, distributed and reused.

```javascript
// Set up a storage system that will capture the conversation state.
const storage = new MemoryStorage();
const convoState = new ConversationState(storage);

// Define a property associated with the conversation state.
const dialogState = convoState.createProperty('dialogState');

// Initialize a DialogSet, passing in a property used to capture state.
const dialogs = new DialogSet(dialogState);

// Each dialog is identified by a unique name used to invoke the dialog later.
const DIALOG_ONE = 'dialog_identifier_value';

// Add a dialog. Use the included WaterfallDialog type, or build your own
// by subclassing from the Dialog class.
dialogs.add(new WaterfallDialog(DIALOG_ONE, [
    async (step) => {
        // access user input from previous step
        var last_step_answer = step.result;

        // send a message to the user
        await step.context.sendActivity('Send a reply');

        // continue to the next step
        return await step.next();

        // OR end
        // return await step.endDialog();
    },
    step2fn,
    step3fn,
    ...,
    stepNfn
]));
```

Finally, from somewhere in your agents' code, invoke your dialog by name:
```javascript
// Receive and process incoming events into TurnContext objects in the normal way
adapter.processActivity(req, res, async (turnContext) => {
    // Create a DialogContext object from the incoming TurnContext
    const dc = await dialogs.createContext(turnContext);

    // ...evaluate message and do other bot logic...

    // If the bot hasn't yet responded, try to continue any active dialog
    if (!turnContext.responded) {
        const status = await dc.continueDialog();
    }

    // Invoke the dialog we created above.
    if (!turnContext.responded) {
        await dc.beginDialog(DIALOG_ONE);
    }
});
```