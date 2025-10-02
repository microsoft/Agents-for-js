/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { debug } from '@microsoft/agents-activity/logger'
import { AgentApplication } from '../agentApplication'
import { GuardStorage } from '../guards/guardStorage'
import { ActiveGuard, Guard, GuardRegisterOptions, GuardRegisterStatus } from '../guards/types'
import { AppRoute } from './appRoute'
import { RouteList } from './routeList'
import { TurnContext } from '../../turnContext'
import { Activity } from '@microsoft/agents-activity'
import { TurnState } from '../turnState'

const logger = debug('agents:route-manager')

/**
 * Manages route handlers and guard validation.
 */
export class RouteManager {
  private _context: TurnContext
  private _route: AppRoute<any> | undefined
  private _storage?: GuardStorage

  /**
   * Creates an instance of the RouteManager.
   * @param app The agent application.
   * @param routes The list of application routes.
   * @param context The current turn context.
   */
  private constructor (private app: AgentApplication<any>, private routes: RouteList<any>, context: TurnContext) {
    this._context = context

    if (app.options.storage) {
      this._storage = new GuardStorage(app.options.storage, this._context)
    }
  }

  /**
   * The current turn context.
   */
  public get context () {
    return this._context
  }

  /**
   * Initializes a route manager for the current context.
   * @param app The agent application.
   * @param routes The list of application routes.
   * @param context The current turn context.
   * @returns A promise that resolves to the initialized RouteManager.
   */
  static async initialize (app: AgentApplication<any>, routes: RouteList<any>, context: TurnContext) {
    const manager = new RouteManager(app, routes, context)
    manager._route = await manager.getRoute(context)
    return manager
  }

  /**
   * Handles the current route, if one is found.
   * @param state The current turn state.
   * @returns A promise that resolves to a boolean indicating whether the handler was successful.
   */
  public async handler (state: TurnState) : Promise<boolean> {
    if (this._route) {
      await this._route.handler.bind(this.app)(this._context, state)
      return true
    } else {
      logger.debug('No matching route found for activity:', this._context.activity)
      return false
    }
  }

  /**
   * Processes guards for the current route. If any guard requires action, the request is considered "guarded".
   * @returns A promise that resolves to a boolean indicating whether the request is being guarded.
   * @remarks If a guard is active, the original activity is restored in the turn context after processing.
   */
  public async guarded (): Promise<boolean> {
    let { route, active } = await this.active()
    if (active) {
      logger.debug(this.prefix(active.guard, `Active session found with ${active.attemptsLeft} attempt(s)`), active.activity)
    }

    const guards = (route ?? this._route)?.guards ?? []

    for (const guard of guards) {
      const status = await this.registerGuard(guard, { context: this._context, active })
      logger.debug(this.prefix(guard.id, `Registration status: ${status}`))

      if (status === GuardRegisterStatus.IGNORED) {
        await this._storage?.delete()
        return false
      }

      if (status === GuardRegisterStatus.PENDING) {
        return true
      }

      if (status === GuardRegisterStatus.REJECTED) {
        await this._storage?.delete()
        return true
      }

      if (status === GuardRegisterStatus.APPROVED) {
        await this._storage?.delete()
      }

      if (active) {
        // Restore the original activity in the turn context.
        (this._context as any)._activity = Activity.fromObject(active.activity)
        // Clear active guard session and re-evaluate route.
        this._route = route ?? this._route
        active = undefined
      }
    }

    return false
  }

  /**
   * Registers a guard and handles any errors that may occur during registration.
   */
  private async registerGuard (guard: Guard, options: GuardRegisterOptions) {
    try {
      return await guard.register(options)
    } catch (cause) {
      await this._storage?.delete()
      throw new Error(this.prefix(guard.id, 'Registration failed'), { cause })
    }
  }

  /**
   * Gets the active guard session from the storage.
   */
  private async active (): Promise<{ route?: AppRoute<any>, active?: ActiveGuard }> {
    const active = await this._storage?.read()
    if (!active) {
      return {}
    }

    const activity = Activity.fromObject(active.activity)
    const context = new TurnContext(this._context.adapter, activity)
    const route = await this.getRoute(context)

    if (!route) {
      return { active: { ...active, activity } }
    }

    // Sort guards to ensure the active guard is processed first, to ensure continuity.
    const guards = route.guards?.sort((a, b) => {
      if (a.id === active.guard) {
        return -1
      }
      if (b.id === active.guard) {
        return 1
      }
      return 0
    }) ?? []
    return { route: { ...route, guards }, active }
  }

  /**
   * Finds the appropriate route for the given context.
   */
  private async getRoute (context: TurnContext): Promise<AppRoute<any> | undefined> {
    for (const route of this.routes) {
      if (await route.selector(context)) {
        return route
      }
    }
  }

  /**
   * Prefixes a message with the guard ID.
   */
  private prefix (id: string, message: string) {
    return `[guard:${id}] ${message}`
  }
}
