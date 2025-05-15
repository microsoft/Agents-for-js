/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as z from 'zod'
import { ServiceCollection } from './serviceCollection'
import { Configuration } from './configuration'

/**
 * Abstract base class for defining an AgentComponent.
 * @remarks
 * An `AgentComponent` allows the registration of services, custom actions, memory scopes, and adapters.
 * To make components available to the system, derive from this class and implement the `configureServices` method.
 * These components are consumed by the system in appropriate places. When using Composer, the `configureServices`
 * method is called automatically by the agent runtime, provided the components are registered in the configuration.
 */
export abstract class AgentComponent {
  /**
   * A Zod schema for validating that an object is an `AgentComponent`.
   * @remarks
   * This schema checks if the object has a `configureServices` method.
   */
  static z = z.custom<AgentComponent>((val: any) => typeof val.configureServices === 'function', {
    message: 'AgentComponent',
  })

  /**
   * Configures the services, custom actions, memory scopes, and adapters for the component.
   * @param services - The service collection to which services can be added.
   * @param configuration - The configuration object for accessing settings.
   */
  abstract configureServices (services: ServiceCollection, configuration: Configuration): void
}
