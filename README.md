# Microsoft 365 Agents SDK - NodeJS /TypeScript

![Build Status](https://github.com/microsoft/Agents-for-js/actions/workflows/ci.yml/badge.svg)
![NPM Downloads](https://img.shields.io/npm/dw/%40microsoft%2Fagents-activity)


The Microsoft 365 Agent SDK simplifies building full stack, multichannel, trusted agents for platforms including M365, Teams, Copilot Studio, and Webchat. We also offer integrations with 3rd parties such as Facebook Messenger, Slack, or Twilio. The SDK provides developers with the building blocks to create agents that handle user interactions, orchestrate requests, reason responses, and collaborate with other agents.

The M365 Agent SDK is a comprehensive framework for building enterprise-grade agents, enabling developers to integrate components from the Azure AI Foundry SDK, Semantic Kernel, as well as AI components from other vendors.

For more information please see the parent project information here [Microsoft 365 Agents SDK](https://aka.ms/agents)

## Getting Started

The best way to get started with these packages is to look at the samples available in https://github.com/microsoft/Agents

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

`quality` runs the repository doctor, ESLint, dependency lint, build, tests, API compatibility checks, and sample build. It reports each check's status and duration, while printing command output when a check fails. Successful compatibility checks still show a compact notice for packages needing review or outdated baselines. When external link validation is enabled, its diagnostics are also shown after success so result counts and the detailed-log path remain visible.

Use `npm run quality -- --check-links` to add external documentation link validation alongside these checks. Build still depends only on the offline doctor. Add `--strict-links` to fail on unverified external URLs as well as confirmed broken links.

`quality` shows a dimmed external-link note beside the Repository doctor row. When disabled, the note shows `external links: off (enable: --check-links)`; when enabled, Documentation links appears directly below Repository doctor as an indented child row. Strict mode is noted beside that link check. `repo:doctor` combines its ON/OFF status and opt-in command on one line. Its compact link totals precede the final success or failure result. Local documentation paths and Markdown anchors are still checked by default.

`npm run compat` checks public TypeScript compatibility, builds declarations first, and analyzes packages in parallel. Run `npm run compat -- agents-hosting` for one package or `npm run compat -- --base origin/main` to retain a Git-reference comparison in the JSON report. Terminal findings compare against the working baseline; previously adopted changes are excluded from pending review. The compact output links directly to saved baseline/generated source lines, counts possible breaks, and marks harmless baseline drift as outdated. Detailed findings and finding IDs are in `compat/generated/report.json`. Possible breaks are warnings; outdated baselines and analysis errors fail the check. Use `--update` to adopt the current API, including possible breaks, and review the baseline diff before committing. See [API compatibility](docs/API-COMPATIBILITY.md) for the workflow and limitations.

Use `npm run quality -- --verbose` to print the complete captured output for every check after the concise report. GitHub Actions and Azure Pipelines retain command logs and compatibility reports in the `quality-logs` artifact. GitHub Actions also shows folded command logs and retains the artifact for seven days.

Local command logs remain in `scripts/logs/quality/` after execution; `QUALITY_LOG_DIR` can override that directory. Standalone compat build logs are in `scripts/logs/compat/build.log`. These folders are Git-ignored. Each run replaces its own logs and removes old logs for skipped checks.

For a structural, package, documentation, build-reference, or runtime-configuration change, you can run the focused doctor check directly:

```bash
npm run repo:doctor
```

The repository doctor reports file-oriented diagnostics with stable rule IDs and concrete fix instructions. It validates workspace discovery, build references, package metadata and exports, internal dependencies, catalogs and relative documentation links, API baselines, test-agent configuration and Docker lifecycles, supported Node runtimes, and disallowed npm lifecycle hooks.

Run `npm run repo:doctor -- --rules` to list every rule's check, rationale, and typical resolution in the terminal. Add one or more rule IDs after `--rules` to inspect selected rules.

The default doctor and quality suite never contact websites. Documentation checks cover local files, directories, exact filename casing, and Markdown heading or explicit HTML anchors. Links, images, reference links, GitHub-style autolinks, and literal HTML `a[href]`/`img[src]` attributes are parsed; code examples and comments are ignored. Generated, vendored, and test-folder documents retain the doctor's existing exclusions.

To additionally verify external HTTP/HTTPS destinations, run:

```bash
npm run repo:doctor -- --check-links
```

CI runs `npm run quality -- --check-links`, which schedules a separate documentation-link check alongside the existing quality checks. It shares the same dependency installation, progress report, and seven-day `quality-logs` artifact (`documentation-links.log`), and does not become a prerequisite for compilation. Confirmed HTTP and redirect failures are errors. Restricted access, rate limits, persistent server errors, DNS/TLS failures, and timeouts remain neutral `not verified` results after bounded retries. They do not produce per-link warnings or fail the command by default; use `--check-links --strict-links` to make them errors. A passing command means no validation errors, not that every external URL was verified. Routine skipped references are summarized as counts; skipped URLs and reasons remain available in the structured report. Errors retain source locations. HTTP request attempts appear only when external checks run, nested beneath `Links`. A dimmed `Details` line points to the detailed log.

External checks deduplicate URLs while preserving queries, limit concurrency to six requests and two per host, and enforce ten-second request, thirty-second URL, and three-minute overall budgets. They follow at most five redirects, confirm HEAD client failures using GET, and retry transient failures once. Local development, private infrastructure, unsupported schemes, and obvious template URLs are skipped. Successful HTTP responses do not validate remote headings, page content, or login flows; fragments in non-Markdown local files are counted as unsupported.

Enabled reports show the total HTTP request attempts, including redirect hops, GET fallbacks, and retries. Failed DNS lookups and connections count as attempts; duplicate references, skipped destinations, and URLs that never leave the queue do not add requests. This count is separate from the number of unique URLs and remains visible in the quality command's link diagnostics.

Each doctor CLI run overwrites `scripts/logs/repo-doctor/links.log` in the checked repository. The log survives command exit and quality cleanup; generated files under `scripts/logs/` are ignored by Git. When `QUALITY_LOG_DIR` is set, `links.log` is written directly inside that artifact directory instead. The log includes URL outcomes, reasons, HTTP statuses, final destinations, attempt counts, source locations, non-web skips, and local documentation findings. Offline runs log discovered URLs as not checked without making requests. Help and rule guides create no logs. A log-write failure exits with code 2 instead of displaying a nonexistent path.

If a specific external destination must be excluded, add an exact normalized URL to an optional root `repo-doctor.links.json` file:

```json
{
  "exceptions": [
    {
      "url": "https://portal.example.org/restricted",
      "reason": "This resource requires an organizational login.",
      "permanent": true
    }
  ]
}
```

Temporary entries must use `"expires": "YYYY-MM-DD"` instead of `"permanent": true`. Expiry dates use UTC and remain valid through the specified day. Expired entries fail local validation until removed or deliberately renewed. Broad host exceptions, fragments, credentials, duplicate URLs, and unexplained entries are rejected. No configuration file is needed when there are no exceptions. Exit codes are 0 for no errors (not-verified URLs may remain), 1 for validation errors, and 2 for configuration or internal failures.

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
