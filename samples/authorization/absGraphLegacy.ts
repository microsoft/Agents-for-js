// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { MemoryStorage } from '@microsoft/agents-hosting'
import { AbsGraphBase } from './absGraphBase.js'

// The legacy env var format requires handler IDs to be registered in the
// constructor so the SDK can match `{handlerId}_{property}` env vars.
// Connection names and settings are provided by environment variables.
class AbsGraphLegacy extends AbsGraphBase {
  constructor () {
    super('**Legacy** .env format sample', {
      storage: new MemoryStorage(),
      authorization: {
        obo_auto: {},
        obo_manual: {},
        auth: {},
        sso: {},
      },
    })
  }
}

startServer(new AbsGraphLegacy())
