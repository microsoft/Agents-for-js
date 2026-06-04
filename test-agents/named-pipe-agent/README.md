# NamedPipeAgent Sample

This sample demonstrates a **pipe-only** agent — it accepts activities exclusively over named pipes via the `@microsoft/agents-hosting-directline-namedpipes` package. It is the canonical shape used when deploying behind the **DirectLine App Service extension** (DirectLineFlex), where the sidecar relays traffic to the agent over a named pipe instead of HTTP.

## What's Different from EmptyAgent

Compared to [empty-agent](../empty-agent/README.md), this sample:

- **Uses** `createLocalAdapter()` instead of `CloudAdapter` — no credentials needed.
- **Uses** `startNamedPipeServer()` instead of `startServer()` — no HTTP endpoint.
- **Omits** Express, `.env` auth config, and JWT middleware entirely.

## Prerequisites

- [Node.js 20+](https://nodejs.org/)
- **Windows** — `@microsoft/agents-hosting-directline-namedpipes` is Windows-only. Running this sample on macOS or Linux will throw `PipePlatformNotSupported` (-180019) at startup. See the [package README](../../packages/agents-hosting-directline-namedpipes/README.md#platform-support) for details.
- The repo built (`npm run build` from root)

## Running Locally

```powershell
# From the repo root
npm run build

# From this directory
Copy-Item env.TEMPLATE .env  # edit if needed
npm start
```

When the process starts, the agent:

- **Does not** expose an HTTP endpoint (no Express, no `/api/messages`).
- **Does not** require Azure/Entra authentication configuration.
- Creates the named-pipe server pair (`{WEBSITE_SITE_NAME}.directline.incoming` / `{WEBSITE_SITE_NAME}.directline.outgoing`) and waits for a client to connect.

To exercise the agent locally, you need a process on the same machine that connects as the named-pipe client (the role normally played by the DirectLine App Service extension sidecar).

### Custom Pipe Name

 > **Note:** The DirectLine App Service extension uses the pipe name `{WEBSITE_SITE_NAME}.directline`. See the library [README](../../libraries/Hosting/DirectLine.NamedPipes/README.md#pipe-name) for details.

```powershell
$env:PIPE_NAME='{WEBSITE_SITE_NAME}.directline'; npm start
```

## Architecture

```
┌──────────────────────┐              ┌─────────────────────┐
│  DirectLineFlex      │──named pipe──│  NamedPipeAgent     │
│  Sidecar (client)    │              │  (this sample)      │
└──────────────────────┘              └─────────────────────┘
     Handles:                              Handles:
     - External auth (JWT)                 - Activity processing
     - TLS termination                     - Echo responses
     - WebSocket ↔ Pipe relay              - State management
```

The pipe is a trusted channel — the sidecar handles external authentication, so no JWT token validation is needed on the agent side.

## Key APIs Used

| API | Purpose |
|-----|---------|
| `createLocalAdapter()` | Creates a `CloudAdapter` configured for pipe-only use (no credentials) |
| `startNamedPipeServer(adapter, logic, options)` | Starts the pipe server with auto-reconnect |
| `service.ready` | Promise that resolves when the first connection is established |
| `service.stop()` | Graceful shutdown |

## Deployment to Azure App Service

When deployed to Azure App Service with the DirectLine App Service extension enabled:

1. The App Service sidecar connects to your agent over the named pipe pair.
2. External traffic, authentication, and TLS are handled by the sidecar.
3. The pipe connection is treated as trusted; no JWT validation is performed on the pipe.
4. Set the pipe name via `PIPE_NAME` env var to match the platform expectation.

## Further Reading

- [Microsoft 365 Agents SDK](https://github.com/microsoft/agents)
- [`@microsoft/agents-hosting-directline-namedpipes` README](../../packages/agents-hosting-directline-namedpipes/README.md)
- [empty-agent Sample](../empty-agent/README.md) — HTTP-based agent sample
