/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as z from 'zod'
import { AgentComponent } from './agentComponent'
import { ServiceCollection } from './serviceCollection'
import { Configuration } from './configuration'
import { MemoryScope, PathResolver } from './memory'

import {
  ClassMemoryScope,
  ConversationMemoryScope,
  DialogClassMemoryScope,
  DialogContextMemoryScope,
  DialogMemoryScope,
  SettingsMemoryScope,
  ThisMemoryScope,
  TurnMemoryScope,
  UserMemoryScope,
} from './memory/scopes'

import {
  AtAtPathResolver,
  AtPathResolver,
  DollarPathResolver,
  HashPathResolver,
  PercentPathResolver,
} from './memory/pathResolvers'

const InitialSettings = z.record(z.unknown())

/**
 * Agent component for agent Dialogs.
 */
export class DialogsAgentComponent extends AgentComponent {
  /**
     * @param services Services Collection to register.
     * @param configuration Configuration for the agent component.
     */
  configureServices (services: ServiceCollection, configuration: Configuration): void {
    services.composeFactory<MemoryScope[]>('memoryScopes', (memoryScopes) => {
      const rootConfiguration = configuration.get()
      const rootConfigurationParse = InitialSettings.safeParse(rootConfiguration)
      const initialSettings = rootConfigurationParse.success ? rootConfigurationParse.data : undefined

      return memoryScopes.concat(
        new TurnMemoryScope(),
        new SettingsMemoryScope(initialSettings),
        new DialogMemoryScope(),
        new DialogContextMemoryScope(),
        new DialogClassMemoryScope(),
        new ClassMemoryScope(),
        new ThisMemoryScope(),
        new ConversationMemoryScope(),
        new UserMemoryScope()
      )
    })

    services.composeFactory<PathResolver[]>('pathResolvers', (pathResolvers) =>
      pathResolvers.concat(
        new DollarPathResolver(),
        new HashPathResolver(),
        new AtAtPathResolver(),
        new AtPathResolver(),
        new PercentPathResolver()
      )
    )
  }
}
