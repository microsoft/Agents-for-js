# Package design documents for code contributors

These are design documents and implementation references for code contributors
to the Microsoft 365 Agents SDK, not the official documentation for building agents.
The official documentation is hosted on
[Microsoft Learn](https://learn.microsoft.com/microsoft-365/agents-sdk/).

Package READMEs own package overviews, selection guidance, prerequisites, and support
status. The documents below retain additional implementation examples, configuration
details, security boundaries, and migration notes without repeating those summaries.

## Guides and coverage

| Package | Preserved guidance |
|---|---|
| [agents-activity](../packages/agents-activity/README.md) | No separate contributor guide: the README covers package scope and links to the protocol specification. Activity construction is covered by the [official Activity class reference](https://learn.microsoft.com/javascript/api/@microsoft/agents-activity/activity?view=agents-sdk-js-latest). |
| [agents-copilotstudio-client](packages/agents-copilotstudio-client.md) | Module/browser support, app registration, delegated/application permissions, OBO, agent publication, endpoint discovery, cloud selection, environment settings, and client creation. |
| [agents-hosting](packages/agents-hosting.md) | Framework-neutral hosting, delegated callbacks and authentication, configuration sources and precedence, JSON schema, application/handler examples, proactive error handling, storage contracts, issuer validation, and outbound URL/DNS/redirect policy. |
| [agents-hosting-dialogs](packages/agents-hosting-dialogs.md) | Bot Framework migration context, dialog sets, waterfalls, component dialogs, conversation state, and continuing/starting dialogs. |
| [agents-hosting-directline-namedpipes](packages/agents-hosting-directline-namedpipes.md) | Windows support, local trust boundary, pipe names and validation, protocol/framing, lifecycle, service API, backpressure, App Service/DirectLineFlex, and the working test agent. |
| [agents-hosting-express](packages/agents-hosting-express.md) | Server startup, route-registration ordering, custom Express integration, adapter reuse, framework adaptation, and route-specific JWT middleware. |
| [agents-hosting-fastify](packages/agents-hosting-fastify.md) | Server/plugin/custom-handler integration, callback authentication, route-scoped auth/rate limits/body limits, JWT typing, and differences from Express. |
| [agents-hosting-extensions-msteams](packages/agents-hosting-extensions-msteams.md) | Extension setup, meeting/message handlers, targeted messages, quoted replies, message extensions, task modules, and Teams API 2.1 migration. |
| [agents-hosting-extensions-slack](packages/agents-hosting-extensions-slack.md) | Extension setup, token precedence, Web API and official Slack SDK integration, routing, assistant APIs, streaming/task updates, chunk types, statuses, and helper functions. |
| [agents-hosting-extensions-teams](packages/agents-hosting-extensions-teams.md) | Legacy setup, meeting/screen-sharing/recording events, message handlers, message extensions, and task modules. Support status and replacement guidance remain in the README. |
| [agents-hosting-storage-blob](packages/agents-hosting-storage-blob.md) | Legacy/V2 result contracts, connection strings, Entra ID/RBAC, TTL writes, best-effort expiry cleanup, and Azure lifecycle policy boundaries. |
| [agents-hosting-storage-cosmos](packages/agents-hosting-storage-cosmos.md) | Legacy/V2 result contracts, Cosmos database/container/client configuration, and conversation/user-state integration. |
| [agents-telemetry](packages/agents-telemetry.md) | Optional APIs/no-op fallback, trace/log/metric export, parent-based sampling and deprecation, stable names, contributor build requirements, tracing modes/lifecycle/actions/records, logger bridging, and metric factories. |

For logging namespaces and debugging controls, see [Debugging and logging](DEBUGGING.md).

## Source and scope

These contributor references were extracted from the package READMEs at
[`main` at `257772ac448c585fcd1f605e32a27d74060a63e5`](https://github.com/microsoft/Agents-for-js/tree/257772ac448c585fcd1f605e32a27d74060a63e5/packages),
then trimmed to remove README-equivalent descriptions, package-selection notices,
and routine installation boilerplate. The standalone activity guide was removed
because its remaining construction example is covered by the official class reference.
Detailed configuration, API integration, lifecycle behavior, examples, compatibility
notes, and security caveats remain in the contributor references.

The examples retain their original scope: some are partial excerpts, not
standalone applications. These contributor references supplement, but do not replace,
the official documentation on Microsoft Learn. They provide a repository home for
the additional details rather than restoring them to npm package READMEs.
