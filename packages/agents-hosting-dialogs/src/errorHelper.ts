// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { AgentErrorDefinition } from '@microsoft/agents-activity'

/**
 * Error definitions for the Dialogs system.
 * This contains localized error codes for the Dialogs subsystem of the AgentSDK.
 *
 * Each error definition includes an error code (starting from -130000), a description, and a help link
 * pointing to an AKA link to get help for the given error.
 *
 * Usage example:
 * ```
 * throw ExceptionHelper.generateException(
 *   Error,
 *   Errors.MissingDialog
 * );
 * ```
 */
export const Errors: { [key: string]: AgentErrorDefinition } = {
  // Dialog Helper Errors (-130000 to -130003)
  /**
   * Error thrown when dialog parameter is missing.
   */
  MissingDialog: {
    code: -130000,
    description: 'runDialog(): missing dialog',
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  /**
   * Error thrown when context parameter is missing.
   */
  MissingContext: {
    code: -130001,
    description: 'runDialog(): missing context',
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  /**
   * Error thrown when context.activity is missing.
   */
  MissingContextActivity: {
    code: -130002,
    description: 'runDialog(): missing context.activity',
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  /**
   * Error thrown when accessor parameter is missing.
   */
  MissingAccessor: {
    code: -130003,
    description: 'runDialog(): missing accessor',
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  // Dialog Manager Errors (-130004 to -130005)
  /**
   * Error thrown when root dialog has not been configured.
   */
  RootDialogNotConfigured: {
    code: -130004,
    description: "DialogManager.onTurn: the agent's 'rootDialog' has not been configured.",
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  /**
   * Error thrown when conversationState has not been configured.
   */
  ConversationStateNotConfigured: {
    code: -130005,
    description: "DialogManager.onTurn: the agent's 'conversationState' has not been configured.",
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  // Recognizer Errors (-130006 to -130007)
  /**
   * Error thrown when recognizer result is empty.
   */
  EmptyRecognizerResult: {
    code: -130006,
    description: 'result is empty',
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  /**
   * Error thrown when recognize function is not implemented.
   */
  RecognizeFunctionNotImplemented: {
    code: -130007,
    description: 'Please implement recognize function.',
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  // Dialog State Manager Errors (-130008 to -130013)
  /**
   * Error thrown when path is not specified in setValue.
   */
  PathNotSpecified: {
    code: -130008,
    description: "DialogStateManager.setValue: path wasn't specified.",
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  /**
   * Error thrown when memory scope is not found in setValue.
   */
  ScopeNotFound: {
    code: -130009,
    description: "DialogStateManager.setValue: a scope of '{scope}' wasn't found.",
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  /**
   * Error thrown when unable to update value with negative index.
   */
  NegativeIndexNotAllowed: {
    code: -130010,
    description: "DialogStateManager.setValue: unable to update value for '{path}'. Negative indexes aren't allowed.",
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  /**
   * Error thrown when unable to update value for path.
   */
  UnableToUpdateValue: {
    code: -130011,
    description: "DialogStateManager.setValue: unable to update value for '{path}'.",
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  /**
   * Error thrown when invalid path in deleteValue.
   */
  InvalidDeletePath: {
    code: -130012,
    description: "DialogStateManager.deleteValue: invalid path of '{path}'.",
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  /**
   * Error thrown when scope not found in deleteValue.
   */
  ScopeNotFoundForDelete: {
    code: -130013,
    description: "DialogStateManager.deleteValue: a scope of '{scope}' wasn't found.",
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  /**
   * Error thrown when path contains invalid characters.
   */
  InvalidPathCharacters: {
    code: -130014,
    description: "DialogStateManager: path '{path}' contains invalid characters.",
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  /**
   * Error thrown when path resolution fails.
   */
  PathResolutionFailed: {
    code: -130015,
    description: "DialogStateManager: unable to resolve path '{path}'.",
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  // Dialog Set Errors (-130016 to -130017)
  /**
   * Error thrown when invalid dialog is being added to DialogSet.
   */
  InvalidDialogBeingAdded: {
    code: -130016,
    description: 'DialogSet.add(): Invalid dialog being added.',
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  /**
   * Error thrown when DialogSet was not bound to a stateProperty.
   */
  DialogSetNotBound: {
    code: -130017,
    description: 'DialogSet.createContext(): the dialog set was not bound to a stateProperty when constructed.',
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  // Dialog Context Error Errors (-130018 to -130019)
  /**
   * Error thrown when error argument is not an Error or string.
   */
  InvalidErrorArgument: {
    code: -130018,
    description: '`error` argument must be an Error or a string',
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  /**
   * Error thrown when dialogContext argument is not of type DialogContext.
   */
  InvalidDialogContextArgument: {
    code: -130019,
    description: '`dialogContext` argument must be of type DialogContext',
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  // Dialog Errors (-130020)
  /**
   * Error thrown when onComputeId is not implemented.
   */
  OnComputeIdNotImplemented: {
    code: -130020,
    description: 'Dialog.onComputeId(): not implemented.',
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  // Agent State Set Errors (-130021)
  /**
   * Error thrown when non-AgentState object is added to AgentStateSet.
   */
  InvalidAgentStateObject: {
    code: -130021,
    description: "AgentStateSet: a object was added that isn't an instance of AgentStateSet.",
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  // Memory Scope Errors (-130022 to -130029)
  /**
   * Error thrown when state key is not available in memory scope.
   */
  StateKeyNotAvailable: {
    code: -130022,
    description: '{stateKey} is not available.',
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  /**
   * Error thrown when attempting to replace root AgentState object.
   */
  CannotReplaceRootAgentState: {
    code: -130023,
    description: 'You cannot replace the root AgentState object.',
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  /**
   * Error thrown when undefined memory object passed to setMemory.
   */
  UndefinedMemoryObject: {
    code: -130024,
    description: '{scopeName}.setMemory: undefined memory object passed in.',
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  /**
   * Error thrown when activeDialog is undefined.
   */
  ActiveDialogUndefined: {
    code: -130025,
    description: 'DialogMemoryScope: activeDialog is undefined.',
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  /**
   * Error thrown when memory scope operation is not supported.
   */
  MemoryScopeOperationNotSupported: {
    code: -130026,
    description: '{scopeName}: {operation} is not supported.',
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  /**
   * Error thrown when attempting unsupported memory scope operation.
   */
  UnsupportedMemoryScopeOperation: {
    code: -130027,
    description: 'MemoryScope.{operation}(): operation not supported for this scope.',
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  // Waterfall Dialog Errors (-130028)
  /**
   * Error thrown when waterfall step error occurs.
   */
  WaterfallStepError: {
    code: -130028,
    description: 'WaterfallDialog: error in step {stepIndex}.',
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  }
}
