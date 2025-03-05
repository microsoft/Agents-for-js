/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Turn event types.
 * @remarks
 * The `beforeTurn` event is triggered before the turn is processed. This allows for the turn state to be
 * modified before the turn is processed. Returning false from the event handler will prevent the turn from
 * being processed.
 *
 * The `afterTurn` event is triggered after the turn is processed. This allows for the turn state to be
 * modified or inspected after the turn is processed. Returning false from the event handler will prevent
 * the turn state from being saved.
 */
export type TurnEvents = 'beforeTurn' | 'afterTurn'
