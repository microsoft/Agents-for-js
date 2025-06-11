/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";

import { loadCopilotStudioConnectionSettingsFromEnv } from "@microsoft/agents-copilotstudio-client";
import pkg from "@microsoft/agents-copilotstudio-client/package.json" with { type: "json" };
import express from "express";

import { dependency } from "./util.js";

const PORT = process.env.PORT || 3000;
const settings = loadCopilotStudioConnectionSettingsFromEnv();
const settingsString = JSON.stringify(settings, null, 2);

const app = express();

// Serve static assets from the "public" directory to support the web chat UI.
app.use(express.static(path.resolve(import.meta.dirname, "../public")));

// Make the Copilot Studio Client browser library available from node_modules.
app.use(dependency("@microsoft/agents-copilotstudio-client/browser")); 

// Provide Copilot Studio Client settings loaded from the environment.
// Note: Only expose non-sensitive configuration to the browser.
// In this sample, all Copilot Studio Client settings are assumed safe for public use.
app.get("/server:agentSettings", (_, res) => {
  res.type("application/javascript");
  res.send(`export const agentsSettings = ${settingsString};`);
});

app.listen(PORT, () => {
  console.log(`WebChat is running at http://localhost:${PORT}`);
  console.log(`Copilot Studio Client Version: ${pkg.version}, running with settings: ${settingsString}`);
  console.log("\nPress Ctrl+C to stop the server");
});
