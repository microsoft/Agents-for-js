/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ComponentRegistration } from './componentRegistration'
import { ServiceCollection } from './serviceCollection'
import { noOpConfiguration } from './configuration'
import { DialogsAgentComponent } from './dialogsAgentComponent'
import { ComponentMemoryScopes, ComponentPathResolvers, MemoryScope, PathResolver } from './memory'

/**
 * Makes dialogs component available to the system registering functionality.
 */
export class DialogsComponentRegistration
  extends ComponentRegistration
  implements ComponentMemoryScopes, ComponentPathResolvers {
  private readonly services = new ServiceCollection({
    memoryScopes: [],
    pathResolvers: [],
  })

  /**
     * Creates an instance of the DialogsComponentRegistration class.
     */
  constructor () {
    super()

    new DialogsAgentComponent().configureServices(this.services, noOpConfiguration)
  }

  /**
     * Gets the dialogs memory scopes.
     *
     * @returns {MemoryScope[]} A list of MemoryScope.
     */
  getMemoryScopes (): MemoryScope[] {
    return this.services.mustMakeInstance<MemoryScope[]>('memoryScopes')
  }

  /**
     * Gets the dialogs path resolvers.
     *
     * @returns {PathResolver[]} A list of PathResolver.
     */
  getPathResolvers (): PathResolver[] {
    return this.services.mustMakeInstance<PathResolver[]>('pathResolvers')
  }
}
