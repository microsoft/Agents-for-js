/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  TurnContext,
  AgentState,
  ConversationState,
  UserState,
  TurnContextStateCollection,
} from '@microsoft/agents-hosting'
import { AgentStateSet } from './agentStateSet'
import { Configurable } from './configurable'
import { DialogContainer } from './dialogContainer'
import { DialogContext, DialogState } from './dialogContext'
import { internalRun } from './dialogHelper'
import { DialogSet } from './dialogSet'
import { DialogTurnStateConstants } from './dialogTurnStateConstants'
import { Dialog } from './dialog'
import { DialogStateManagerConfiguration } from './memory'
import { DialogTurnResult } from './dialogTurnResult'

const LAST_ACCESS = '_lastAccess'
const CONVERSATION_STATE = 'ConversationState'
const USER_STATE = 'UserState'

export interface DialogManagerResult {
  turnResult: DialogTurnResult;
}

export interface DialogManagerConfiguration {
  conversationState: AgentState;
  rootDialog: Dialog;
  userState?: UserState;
  expireAfter?: number;
  stateConfiguration?: DialogStateManagerConfiguration;
}

/**
 * Class which runs the dialog system.
 *
 * @deprecated This class will be deprecated.
 */
export class DialogManager extends Configurable {
  private _rootDialogId: string
  private readonly _dialogStateProperty: string
  private readonly _initialTurnState: TurnContextStateCollection = new TurnContextStateCollection()

  /**
     * Creates an instance of the DialogManager class.
     *
     * @param rootDialog Optional, root Dialog to use.
     * @param dialogStateProperty Optional, alternate name for the dialogState property. (Default is "DialogStateProperty")
     */
  constructor (rootDialog?: Dialog, dialogStateProperty?: string) {
    super()
    if (rootDialog) {
      this.rootDialog = rootDialog
    }
    this._dialogStateProperty = dialogStateProperty ?? 'DialogState'
    this._initialTurnState.set(DialogTurnStateConstants.dialogManager, this)
  }

  conversationState: ConversationState
  userState?: UserState

  /**
     * Values that will be copied to the `TurnContext.turnState` at the beginning of each turn.
     *
     * @returns The turn state collection.
     */
  get initialTurnState (): TurnContextStateCollection {
    return this._initialTurnState
  }

  /**
     * Root dialog to start from [onTurn()](#onturn) method.
     */
  set rootDialog (value: Dialog) {
    this.dialogs = new DialogSet()
    if (value) {
      this._rootDialogId = value.id
      this.dialogs.add(value)
      this.registerContainerDialogs(this.rootDialog, false)
    } else {
      this._rootDialogId = undefined
    }
  }

  /**
     * Gets the root Dialog ID.
     *
     * @returns The root Dialog ID.
     */
  get rootDialog (): Dialog {
    return this._rootDialogId ? this.dialogs.find(this._rootDialogId) : undefined
  }

  dialogs: DialogSet = new DialogSet()
  stateConfiguration?: DialogStateManagerConfiguration
  expireAfter?: number

  /**
     * Set configuration settings.
     *
     * @param config Configuration settings to apply.
     * @returns The cofigured DialogManager context.
     */
  configure (config: Partial<DialogManagerConfiguration>): this {
    return super.configure(config)
  }

  /**
     * Runs dialog system in the context of a TurnContext.
     *
     * @param context TurnContext for the current turn of conversation with the user.
     * @returns Result of running the logic against the activity.
     */
  async onTurn (context: TurnContext): Promise<DialogManagerResult> {
    // Ensure properly configured
    if (!this._rootDialogId) {
      throw new Error("DialogManager.onTurn: the agent's 'rootDialog' has not been configured.")
    }

    // Copy initial turn state to context
    this.initialTurnState.forEach((value, key): void => {
      context.turnState.set(key, value)
    })

    const agentStateSet = new AgentStateSet()

    if (!this.conversationState) {
      this.conversationState = context.turnState.get(CONVERSATION_STATE)
    } else {
      context.turnState.set(CONVERSATION_STATE, this.conversationState)
    }

    if (!this.conversationState) {
      throw new Error("DialogManager.onTurn: the agent's 'conversationState' has not been configured.")
    }
    agentStateSet.add(this.conversationState)

    if (!this.userState) {
      this.userState = context.turnState.get(USER_STATE)
    } else {
      context.turnState.set(USER_STATE, this.userState)
    }

    if (this.userState) {
      agentStateSet.add(this.userState)
    }

    // Get last access
    const lastAccessProperty = this.conversationState.createProperty(LAST_ACCESS)
    const lastAccess = new Date(await lastAccessProperty.get(context, new Date().toISOString()))

    // Check for expired conversation
    const now = new Date()
    if (this.expireAfter !== undefined && now.getTime() - lastAccess.getTime() >= this.expireAfter) {
      // Clear conversation state
      await this.conversationState.clear(context)
    }

    // Update last access time
    await lastAccessProperty.set(context, lastAccess.toISOString())

    // get dialog stack
    const dialogsProperty = this.conversationState.createProperty(this._dialogStateProperty)
    const dialogState: DialogState = await dialogsProperty.get(context, {})

    // Create DialogContext
    const dc = new DialogContext(this.dialogs, context, dialogState)

    // Call the common dialog "continue/begin" execution pattern shared with the classic RunAsync extension method
    const turnResult = await internalRun(context, this._rootDialogId, dc, this.stateConfiguration)

    // Save agentState changes
    await agentStateSet.saveAllChanges(dc.context, false)

    return { turnResult }
  }

  // Recursively traverses the dialog tree and registers intances of `DialogContainer` in the `DialogSet`
  // for this `DialogManager` instance.
  private registerContainerDialogs (dialog: Dialog, registerRoot = true): void {
    if (!(dialog instanceof DialogContainer)) {
      return
    }
    const container = dialog
    if (registerRoot) {
      if (this.dialogs.getDialogs().find((dlg) => dlg === container)) {
        return
      }
      this.dialogs.add(container)
    }

    container.dialogs.getDialogs().forEach((inner) => {
      this.registerContainerDialogs(inner)
    })
  }
}
