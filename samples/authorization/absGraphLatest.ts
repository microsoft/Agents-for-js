// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { MemoryStorage } from '@microsoft/agents-hosting'
import { AbsGraphBase } from './absGraphBase.js'

// No authorization config in the constructor — the latest env var format
// is self-describing: handler IDs are embedded in the key structure, so
// the SDK discovers and configures handlers entirely from environment variables.
class AbsGraphLatest extends AbsGraphBase {
  constructor () {
    super('**Latest** .env format sample', { storage: new MemoryStorage() })
  }
}

startServer(new AbsGraphLatest())
