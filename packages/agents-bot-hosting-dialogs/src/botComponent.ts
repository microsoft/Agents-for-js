/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as z from 'zod'
import { ServiceCollection } from './serviceCollection'
import { Configuration } from './configuration'

/**
 * Definition of a BotComponent that allows registration of services, custom actions, memory scopes and adapters.
 *
 * To make your components available to the system you derive from BotComponent and register services to add functionality.
 * These components then are consumed in appropriate places by the systems that need them. When using Composer, configureServices
 * gets called automatically on the components by the bot runtime, as long as the components are registered in the configuration.
 */
export abstract class BotComponent {
  static z = z.custom<BotComponent>((val: any) => typeof val.configureServices === 'function', {
    message: 'BotComponent',
  })

  abstract configureServices (services: ServiceCollection, configuration: Configuration): void
}
