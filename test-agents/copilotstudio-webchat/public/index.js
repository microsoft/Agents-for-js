/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { acquireToken } from "./acquireToken.js";

const agentsSettings = {
  environmentId:'',
  agentIdentifier:'',
  tenantId:'',
  appClientId:'',
}
const token = await acquireToken(agentsSettings);

const client = new Agents.CopilotStudioClient(agentsSettings, token);

window.WebChat.renderWebChat(
  {
    directLine: Agents.CopilotStudioWebChat.createConnection(client, { showTyping: true }),
  },
  document.getElementById("webchat")
);

document.querySelector("#webchat > *").focus();
