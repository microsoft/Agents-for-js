# Microsoft 365 Agents SDK - NodeJS /TypeScript

![Build Status](https://github.com/microsoft/Agents-for-js/actions/workflows/ci.yml/badge.svg)
![NPM Downloads](https://img.shields.io/npm/dw/%40microsoft%2Fagents-activity)


The Microsoft 365 Agent SDK simplifies building full stack, multichannel, trusted agents for platforms including M365, Teams, Copilot Studio, and Webchat. We also offer integrations with 3rd parties such as Facebook Messenger, Slack, or Twilio. The SDK provides developers with the building blocks to create agents that handle user interactions, orchestrate requests, reason responses, and collaborate with other agents.

The M365 Agent SDK is a comprehensive framework for building enterprise-grade agents, enabling developers to integrate components from the Azure AI Foundry SDK, Semantic Kernel, as well as AI components from other vendors.

For more information please see the parent project information here [Microsoft 365 Agents SDK](https://aka.ms/agents)

## Channel Importance Analysis

Based on an analysis of all GitHub issues in this repository, **Microsoft Teams (msteams) is critically important** to the Agents-for-js SDK, representing 72.3% of all channel-related discussions. See the [Channel Importance Analysis Report](docs/channel-importance-analysis.md) for detailed findings.

## Getting Started

The best to way to get started with these packages is to look at the samples available in https://github.com/microsoft/Agents

## Packages Overview

We offer the following NPM packages to create conversational experiences based on Agents:

| Package Name | NPM Version | Description | Replaces|
|--------------|-------------|-------------|---------|
| `@microsoft/agents-activity` | [![npm](https://img.shields.io/npm/v/@microsoft/agents-activity)](https://www.npmjs.com/package/@microsoft/agents-activity) | Types and validators implementing the Activity protocol spec. | `botframework-schema` |
| `@microsoft/agents-hosting` | [![npm](https://img.shields.io/npm/v/@microsoft/agents-hosting)](https://www.npmjs.com/package/@microsoft/agents-hosting) | Provides classes to host an Agent in express.  | `botbuilder` |
| `@microsoft/agents-hosting-extensions-teams` | [![npm](https://img.shields.io/npm/v/@microsoft/agents-hosting-extensions-teams)](https://www.npmjs.com/package/@microsoft/agents-hosting-extensions-teams) | Teams specific features, such as TaskModules and Messaging Extensions.  | `botbuilder` |
| `@microsoft/agents-hosting-express` | [![npm](https://img.shields.io/npm/v/@microsoft/agents-hosting-express)](https://www.npmjs.com/package/@microsoft/agents-hosting-express) | Configures express to run the Agent.  | N/A |
| `@microsoft/agents-hosting-dialogs` | [![npm](https://img.shields.io/npm/v/@microsoft/agents-hosting-dialogs)](https://www.npmjs.com/package/@microsoft/agents-hosting-dialogs) | Provides classes to host an Agent in express.  | `botbuilder-dialogs` |
| `@microsoft/agents-hosting-storage-blob` | [![npm](https://img.shields.io/npm/v/@microsoft/agents-hosting-storage-blob)](https://www.npmjs.com/package/@microsoft/agents-hosting-storage-blob) | Extension to use Azure Blob as storage.  | `botbuilder-azure` |
| `@microsoft/agents-hosting-storage-cosmos` | [![npm](https://img.shields.io/npm/v/@microsoft/agents-hosting-storage-cosmos)](https://www.npmjs.com/package/@microsoft/agents-hosting-storage-cosmos) | Extension to use CosmosDB as storage.  | `botbuilder-azure` |


Additionally we provide a Copilot Studio Client, to interact with Agents created in CopilotStudio

| Package Name | NPM Version | Description |
|--------------|-------------|-------------|
| `@microsoft/agents-copilotstudio-client` | [![npm](https://img.shields.io/npm/v/@microsoft/agents-copilotstudio-client)](https://www.npmjs.com/package/@microsoft/agents-copilotstudio-client) | Direct to Engine client to interact with Agents created in CopilotStudio

### Nightly Builds

Each package also has a nightly build, available via the `@next` tag on NPM.
The nightly build contains the code from our `main` branch and may contain features that are still in development.

### Environment Requirements

The packages should target node18 or greater, and can be used from JavaScript using CommonJS or ES6 modules, or from TypeScript.

> Note: We are using node 24 to be able to initialize the process from a `.env` file without adding the dependency to `dotenv` by using the [`--env-file` flag](https://nodejs.org/en/learn/command-line/how-to-read-environment-variables-from-nodejs). Previous node versions should set the env vars explicitely before running.

### Debugging

The packages include the source code in the `src`, along with the sourcemaps in the `dist/src` folder to allow VSCode to debug the typescript files.

### Code Style

We are using `eslint` configured with [neostandard](https://github.com/neostandard/neostandard)

## Contributing

#### Note for Microsoft internal developers: 
- Internal Microsoft Developers should join the Core identity group [Agents SDK Contrib](https://coreidentity.microsoft.com/manage/Entitlement/entitlement/agentssdkint-upyj)

#### Non-Microsoft internal developers:

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft 
trademarks or logos is subject to and must follow 
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
Any use of third-party trademarks or logos are subject to those third-party's policies.
