# Package design documents for code contributors

These are design documents and implementation references for code contributors
to the Microsoft 365 Agents SDK, not the official documentation for building agents.
The official documentation is hosted on
[Microsoft Learn](https://learn.microsoft.com/microsoft-365/agents-sdk/).

These guides cover implementation examples, configuration details, security
boundaries, and migration notes. Package READMEs describe package scope,
prerequisites, and support status.

## Package guides

| Package | Guidance |
|---|---|
| [agents-activity](../packages/agents-activity/README.md) | Activity protocol and construction. See the [official Activity class reference](https://learn.microsoft.com/javascript/api/@microsoft/agents-activity/activity?view=agents-sdk-js-latest). |
| [agents-copilotstudio-client](packages/agents-copilotstudio-client.md) | Module/browser support, app registration, delegated/application permissions, OBO, agent publication, endpoint discovery, cloud selection, environment settings, and client creation. |
| [agents-hosting](packages/agents-hosting.md) | Framework-neutral hosting, delegated callbacks and authentication, configuration sources and precedence, JSON schema, direct-adapter proactive error handling, storage contracts, issuer validation, and outbound URL/DNS/redirect policy. |
| [agents-hosting-dialogs](packages/agents-hosting-dialogs.md) | Bot Framework migration context, dialog sets, waterfalls, component dialogs, conversation state, and continuing/starting dialogs. |
| [agents-hosting-directline-namedpipes](packages/agents-hosting-directline-namedpipes.md) | Windows support, local trust boundary, pipe names and validation, protocol/framing, lifecycle, service API, backpressure, App Service/DirectLineFlex, and the working test agent. |
| [agents-hosting-express](packages/agents-hosting-express.md) | Route-registration ordering, custom Express integration, adapter reuse, framework adaptation, and route-specific JWT middleware. |
| [agents-hosting-fastify](packages/agents-hosting-fastify.md) | Server/plugin/custom-handler integration, callback authentication, route-scoped auth/rate limits/body limits, JWT typing, and differences from Express. |
| [agents-hosting-extensions-msteams](packages/agents-hosting-extensions-msteams.md) | Message edit/delete/undelete handlers, explicit-recipient targeted messages, JavaScript quoted replies, selector-free query registration, and Teams API 2.1 migration. |
| [agents-hosting-extensions-slack](packages/agents-hosting-extensions-slack.md) | Extension setup, token precedence, Web API and official Slack SDK integration, routing, assistant APIs, streaming/task updates, chunk types, statuses, and helper functions. |
| [agents-hosting-extensions-teams](packages/agents-hosting-extensions-teams.md) | Legacy setup, meeting/screen-sharing/recording events, message handlers, message extensions, and task modules. See the README for support status and replacement guidance. |
| [agents-hosting-storage-blob](packages/agents-hosting-storage-blob.md) | Legacy/V2 result contracts, legacy state integration, Entra ID/RBAC, TTL writes, best-effort expiry cleanup, and Azure lifecycle policy boundaries. |
| [agents-hosting-storage-cosmos](packages/agents-hosting-storage-cosmos.md) | Legacy/V2 result contracts, V2 construction, and legacy conversation/user-state integration. |
| [agents-telemetry](packages/agents-telemetry.md) | OTLP trace/log exporter examples, optional-peer diagnostics, contributor build requirements, tracing modes/lifecycle/actions/records, logger methods, and metric factories. |

For logging namespaces and debugging controls, see [Debugging and logging](DEBUGGING.md).
