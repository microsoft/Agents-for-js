# Microsoft 365 Agents SDK - NodeJS /TypeScript

![Build Status](https://github.com/microsoft/Agents-for-js/actions/workflows/ci.yml/badge.svg)
![NPM Downloads](https://img.shields.io/npm/dw/%40microsoft%2Fagents-activity)


The Microsoft 365 Agent SDK simplifies building full stack, multichannel, trusted agents for platforms including M365, Teams, Copilot Studio, and Webchat. We also offer integrations with 3rd parties such as Facebook Messenger, Slack, or Twilio. The SDK provides developers with the building blocks to create agents that handle user interactions, orchestrate requests, reason responses, and collaborate with other agents.

The M365 Agent SDK is a comprehensive framework for building enterprise-grade agents, enabling developers to integrate components from the Azure AI Foundry SDK, Semantic Kernel, as well as AI components from other vendors.

For more information please see the parent project information here [Microsoft 365 Agents SDK](https://aka.ms/agents)

## Getting Started

The best way to get started with these packages is to look at the samples available in [github.com/microsoft/Agents/samples/nodejs](https://github.com/microsoft/Agents/tree/main/samples/nodejs)

## Learn More

Learn more in the [Microsoft 365 Agents SDK documentation](https://learn.microsoft.com/microsoft-365/agents-sdk/)

- [Overview](https://learn.microsoft.com/microsoft-365/agents-sdk/agents-sdk-overview) Learn about the Microsoft 365 Agents SDK.
- [Quickstart](https://learn.microsoft.com/microsoft-365/agents-sdk/quickstart?pivots=nodejs) Create an agent with the Microsoft 365 Agents SDK using JavaScript.
- **Key concepts**
  - [Activity Protocol](https://learn.microsoft.com/microsoft-365/agents-sdk/activity-protocol) Learn how Activity Protocol standardizes communication between agents, users, and channels in the Microsoft 365 Agents SDK. Explore its schema and key properties.
  - [AgentApplication](https://learn.microsoft.com/microsoft-365/agents-sdk/agent-application) Learn how AgentApplication works as the central building block of an agent built with the Microsoft 365 Agents SDK. Understand routing, turn state, lifecycle hooks, and more.
  - [Manage state](https://learn.microsoft.com/microsoft-365/agents-sdk/state-concepts) Learn how to manage state in the Microsoft 365 Agents SDK.
- **Microsoft 365 Agents Toolkit**
  - [JavaScript agents in Visual Studio Code](https://learn.microsoft.com/microsoft-365/agents-sdk/create-new-toolkit-project-vsc) Learn how to create a Microsoft 365 Agents SDK agent in Visual Studio Code, using a JavaScript app template available in the Agents Toolkit.
- **Test and debug**
  - [Agents Playground](https://learn.microsoft.com/microsoft-365/agents-sdk/test-with-toolkit-project) Learn how to test your new agent using the Microsoft 365 Agents Playground in the Toolkit
  - [Dev tunnels](https://learn.microsoft.com/microsoft-365/agents-sdk/test-with-dev-tunnel) Expose a locally running Agents SDK agent through a secure dev tunnel and connect it to Azure Bot Service for testing.
- **Provision Azure resources**
  - [Provisioning plugin](https://learn.microsoft.com/microsoft-365/agents-sdk/provision-with-agent-plugin) Use the Agents SDK provisioning plugin with an AI coding assistant to create Azure resources and configure identity for your agent.
  - [Manual Azure Bot provisioning](https://learn.microsoft.com/microsoft-365/agents-sdk/provision-azure-bot-service-manually) Learn how to provision an Azure Bot resource and related identity resources for an Agents SDK agent.
  - Provision OAuth resources manually
- **Configure your agent**
  - [Authentication](https://learn.microsoft.com/microsoft-365/agents-sdk/configure-authentication-msal?pivots=nodejs) Learn about configuration setting options for authentication in the Agents SDK.
  - [Storage](https://learn.microsoft.com/microsoft-365/agents-sdk/storage?tabs=javascript) Learn about the importance of storage and the different storage options available for use with the Microsoft 365 Agents SDK.
  - [Make your agent production-ready](https://learn.microsoft.com/microsoft-365/agents-sdk/production-ready-agent/production-ready-agent) Learn how to prepare your agent for production.
- **Add capabilities**
  - [AI services and orchestration](https://learn.microsoft.com/microsoft-365/agents-sdk/using-semantic-kernel-agent-framework) Learn how to build intelligent agents using the Microsoft 365 Agents SDK with Semantic Kernel or Agent Framework for AI orchestration and flexibility.
  - [OAuth user authorization](https://learn.microsoft.com/microsoft-365/agents-sdk/agent-oauth-configuration?pivots=nodejs) Learn about configuring a .NET, JavaScript, or Python agent to use Azure Bot Service OAuth
  - [Copilot Studio integration](https://learn.microsoft.com/microsoft-365/agents-sdk/integrate-with-mcs) Learn how to integrate with Copilot Studio in Microsoft 365 Agents SDK.
  - [Microsoft Copilot APIs](https://learn.microsoft.com/microsoft-365-copilot/extensibility/sdks/api-libraries) Learn how the Microsoft 365 Copilot API client libraries simplify AI solution development with robust features like retry handling, secure redirects, and payload compression.
  - [Microsoft Teams extension](https://learn.microsoft.com/microsoft-365/agents-sdk/teams/teams-extension) Build agents with deep Microsoft Teams integration using the Teams extension, which provides structured access to meetings, message extensions, task modules, channels, and team lifecycle events.
  - [Proactive messages](https://learn.microsoft.com/microsoft-365/agents-sdk/proactive-overview?pivots=typescript) Learn about proactive messaging in the Agents SDK.
  - [Adaptive cards](https://learn.microsoft.com/microsoft-365/agents-sdk/adaptive-cards?pivots=nodejs) Create adaptive cards, send them from a .NET or JavaScript Agents SDK agent, and handle Action.Execute, Action.Submit, and dynamic search requests.
  - [Telemetry](https://learn.microsoft.com/microsoft-365/agents-sdk/agent-telemetry?pivots=nodejs) Review traces, metrics, and span attributes in the Microsoft 365 Agents SDK for JavaScript, C#, and Python, and configure OpenTelemetry.
- [Deploy to Azure](https://learn.microsoft.com/microsoft-365/agents-sdk/deploy-azure-bot-service-manually) Learn how to deploy your agent to Azure, Teams, or Microsoft 365
- **Bot Framework migration guides**
  - [General guidance](https://learn.microsoft.com/microsoft-365/agents-sdk/bf-migration-guidance) Migration guidance from Azure Bot Framework SDK to the Microsoft 365 Agents SDK.
  - [JavaScript SDK](https://learn.microsoft.com/microsoft-365/agents-sdk/bf-migration-nodejs) Migration guidance from Azure Bot Framework SDK to the Microsoft 365 Agents SDK for Node.js.
- [JavaScript API reference](https://learn.microsoft.com/javascript/api/overview/agents-overview) Reference documentation for Microsoft 365 Agents SDK


## Packages Overview

We offer the following NPM packages to create conversational experiences based on Agents:

| Package Name | NPM Version | Description | Replaces|
|--------------|-------------|-------------|---------|
| `@microsoft/agents-activity` | [![npm](https://img.shields.io/npm/v/@microsoft/agents-activity)](https://www.npmjs.com/package/@microsoft/agents-activity) | Types and validators implementing the Activity protocol spec. | `botframework-schema` |
| `@microsoft/agents-hosting` | [![npm](https://img.shields.io/npm/v/@microsoft/agents-hosting)](https://www.npmjs.com/package/@microsoft/agents-hosting) | Provides classes to host an Agent in express.  | `botbuilder` |
| `@microsoft/agents-hosting-extensions-msteams` | [![npm](https://img.shields.io/npm/v/@microsoft/agents-hosting-extensions-msteams)](https://www.npmjs.com/package/@microsoft/agents-hosting-extensions-msteams) | Teams specific features, such as TaskModules and Messaging Extensions.  | `botbuilder` |
| `@microsoft/agents-hosting-extensions-teams` (deprecated) | [![npm](https://img.shields.io/npm/v/@microsoft/agents-hosting-extensions-teams)](https://www.npmjs.com/package/@microsoft/agents-hosting-extensions-teams) | Legacy Teams extension retained for backward compatibility. Use `@microsoft/agents-hosting-extensions-msteams` for new development. | `botbuilder` |
| `@microsoft/agents-hosting-express` | [![npm](https://img.shields.io/npm/v/@microsoft/agents-hosting-express)](https://www.npmjs.com/package/@microsoft/agents-hosting-express) | Configures express to run the Agent.  | N/A |
| `@microsoft/agents-hosting-fastify` | [![npm](https://img.shields.io/npm/v/@microsoft/agents-hosting-fastify)](https://www.npmjs.com/package/@microsoft/agents-hosting-fastify) | Configures Fastify to run the Agent.  | N/A |
| `@microsoft/agents-hosting-dialogs` | [![npm](https://img.shields.io/npm/v/@microsoft/agents-hosting-dialogs)](https://www.npmjs.com/package/@microsoft/agents-hosting-dialogs) | Provides classes to host an Agent in express.  | `botbuilder-dialogs` |
| `@microsoft/agents-hosting-directline-namedpipes` | [![npm](https://img.shields.io/npm/v/@microsoft/agents-hosting-directline-namedpipes)](https://www.npmjs.com/package/@microsoft/agents-hosting-directline-namedpipes) | Direct Line named-pipe hosting support. | N/A |
| `@microsoft/agents-hosting-extensions-slack` | [![npm](https://img.shields.io/npm/v/@microsoft/agents-hosting-extensions-slack)](https://www.npmjs.com/package/@microsoft/agents-hosting-extensions-slack) | Slack channel extensions. | N/A |
| `@microsoft/agents-telemetry` | [![npm](https://img.shields.io/npm/v/@microsoft/agents-telemetry)](https://www.npmjs.com/package/@microsoft/agents-telemetry) | Telemetry support for agents. | N/A |
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

The packages require Node.js 22 or greater, and can be used from JavaScript using CommonJS or ES6 modules, or from TypeScript.

> Note: Development and CI use Node.js 24.

### Debugging

The packages include the source code in the `src`, along with the sourcemaps in the `dist/src` folder to allow VSCode to debug the typescript files.

### Debug Logging

The packages use the [`debug`](https://github.com/debug-js/debug) library. Set the `DEBUG` environment variable to enable logging for specific subsystems.

Each namespace in the tables below ends with `:*` to enable all log levels for that prefix.

#### Auth & connections

| DEBUG filter | What it logs |
|---|---|
| `agents:authorization:connections:*` | Auth connections loaded at startup (clientId, tenantId, authType); which connection is selected per request |
| `agents:authorization:manager:*` | Auth handlers configured at startup (type, scopes); which handler is invoked per request |
| `agents:authorization:azurebot:*` | Azure Bot sign-in flow detail (token exchange, magic code, SSO) |
| `agents:authorization:agentic:*` | Agentic auth flow detail (token acquisition, OBO) |
| `agents:authorization:*` | High-level authorization middleware decisions |
| `agents:msal:*` | MSAL token acquisition (token requests, cache hits, OBO) |
| `agents:jwt-middleware:*` | Incoming JWT validation |
| `agents:authConfiguration:*` | Auth configuration loading |

#### Adapter & request handling

| DEBUG filter | What it logs |
|---|---|
| `agents:cloud-adapter:*` | Incoming request processing, activity dispatch |
| `agents:base-adapter:*` | Base adapter lifecycle |
| `agents:connector-client:*` | Outbound calls to the Bot Connector service |
| `agents:user-token-client:*` | User token client requests |

#### Application & state

| DEBUG filter | What it logs |
|---|---|
| `agents:app:*` | AgentApplication routing and lifecycle |
| `agents:activity-handler:*` | ActivityHandler event dispatch |
| `agents:state:*` | State read/write operations |
| `agents:turnState:*` | Turn state access |
| `agents:memory-storage:*` | MemoryStorage read/write |
| `agents:middleware:*` | Middleware pipeline execution |
| `agents:proactive:*` | Proactive message sending to conversations |
| `agents:conversation-reference-builder:*` | Building and validating conversation references |

#### Streaming, attachments & transcripts

| DEBUG filter | What it logs |
|---|---|
| `agents:streamingResponse:*` | Streaming response lifecycle |
| `agents:attachmentDownloader:*` | Attachment download requests |
| `agents:M365AttachmentDownloader:*` | M365-specific attachment downloads |
| `agents:file-transcript-logger:*` | File transcript write operations |
| `agents:rest-client:*` | REST client calls (transcript middleware) |

#### Agent-to-agent

| DEBUG filter | What it logs |
|---|---|
| `agents:agent-client:*` | Outbound agent client calls and response handling |

#### Examples

```sh
# Show all auth and connection logs
DEBUG=agents:authorization:* node index.js

# Show everything
DEBUG=agents:* node index.js

# Show auth connections + MSAL
DEBUG=agents:authorization:connections:*,agents:msal:* node index.js
```

### Code Style

We are using `eslint` configured with [neostandard](https://github.com/neostandard/neostandard)

## Contributing

Before submitting a change, run:

```bash
npm run quality
```

`quality` runs the repository doctor, ESLint, dependency lint, build, tests, API compatibility checks, and sample build. It reports each check's status and duration, while printing command output only when that check fails. Successful compatibility checks still show a compact notice for packages needing review or outdated baselines.

`npm run compat` checks public TypeScript compatibility, builds declarations first, and analyzes packages in parallel. Run `npm run compat -- agents-hosting` for one package or `npm run compat -- --base origin/main` to retain a Git-reference comparison in the JSON report. Terminal findings compare against the working baseline; previously adopted changes are excluded from pending review. The compact output links directly to saved baseline/generated source lines, counts possible breaks, and marks harmless baseline drift as outdated. Detailed findings and finding IDs are in `compat/generated/report.json`. Possible breaks are warnings; outdated baselines and analysis errors fail the check. Use `--update` to adopt the current API, including possible breaks, and review the baseline diff before committing. See [API compatibility](docs/API-COMPATIBILITY.md) for the workflow and limitations.

Use `npm run quality -- --verbose` to print the complete captured output for every check after the concise report. GitHub Actions and Azure Pipelines retain command logs and compatibility reports in the `quality-logs` artifact. GitHub Actions also shows folded command logs and retains the artifact for seven days.

Local command logs remain in `scripts/logs/quality/` after execution; `QUALITY_LOG_DIR` can override that directory. Standalone compat build logs are in `scripts/logs/compat/build.log`. These folders are Git-ignored. Each run replaces its own logs and removes old logs for skipped checks.

For a structural, package, documentation, build-reference, or runtime-configuration change, you can run the focused doctor check directly:

```bash
npm run repo:doctor
```

The repository doctor reports file-oriented diagnostics with stable rule IDs and concrete fix instructions. It validates workspace discovery, build references, package metadata and exports, internal dependencies, catalogs and relative documentation links, API baselines, test-agent configuration and Docker lifecycles, supported Node runtimes, and disallowed npm lifecycle hooks.

Run `npm run repo:doctor -- --rules` to list every rule's check, rationale, and typical resolution in the terminal. Add one or more rule IDs after `--rules` to inspect selected rules.

Repository scripts must be explicit: do not add `pre*` or `post*` npm lifecycle wrappers. `npm --ignore-scripts` skips those hooks, so required work must be chained directly in the invoked command. Install-time hooks (`preinstall`, `install`, `postinstall`, and `prepare`) are also disallowed.

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
