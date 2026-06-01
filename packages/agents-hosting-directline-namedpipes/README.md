# @microsoft/agents-hosting-directline-namedpipes

DirectLine Named Pipes transport for the Microsoft 365 Agents SDK for JavaScript/TypeScript.

Enables agents to communicate over named pipes, used in Azure App Service and DirectLineFlex scenarios. Compatible with the .NET Agents SDK named pipe protocol.

## Installation

```bash
npm install @microsoft/agents-hosting-directline-namedpipes
```

## Usage

```typescript
import { AgentApplication, TurnState } from '@microsoft/agents-hosting'
import { createLocalAdapter, startNamedPipeServer } from '@microsoft/agents-hosting-directline-namedpipes'

// createLocalAdapter() provides a CloudAdapter configured for pipe-only use.
// No Azure/Entra credentials needed — the pipe is a trusted local channel.
const adapter = createLocalAdapter()

const agent = new AgentApplication<TurnState>()
agent.onActivity('message', async (context) => {
  await context.sendActivity(`Echo: ${context.activity.text}`)
})

const service = await startNamedPipeServer(adapter, (ctx) => agent.run(ctx), {
  pipeName: 'bfv4.pipes', // default
  autoReconnect: true      // default
})

// Wait for first connection (optional)
await service.ready

// Later, to stop:
await service.stop()
```

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `pipeName` | `'bfv4.pipes'` | Name of the pipe. Must match the client/connector configuration. Allowed characters: letters, numbers, `.`, `_`, and `-`; maximum 78 characters. |
| `autoReconnect` | `true` | Automatically reconnect on disconnection. |

### Custom Pipe Name

Set the pipe name to match your deployment configuration:

```typescript
await startNamedPipeServer(adapter, logic, { pipeName: 'my-custom.pipes' })
```

Pipe names are validated before any OS path is created. Names containing path separators, consecutive dots, control characters, whitespace padding, or unsupported characters are rejected.

## Cross-Platform Support

The transport works on both Windows and Linux/macOS:

| Platform | Pipe path |
|----------|-----------|
| Windows | `\\.\pipe\{pipeName}.incoming` / `\\.\pipe\{pipeName}.outgoing` |
| Linux/macOS | `/tmp/CoreFxPipe_{pipeName}.incoming` / `/tmp/CoreFxPipe_{pipeName}.outgoing` |

The Unix path format matches the .NET runtime convention (`System.IO.Pipes`), ensuring interoperability with the .NET Agents SDK.

## Security Considerations

Named pipes are local IPC. This package does not add HTTP or Entra authentication on top of the pipe; the local OS pipe/socket boundary is the trust boundary.

- Use a unique pipe name for each app or deployment slot to avoid collisions.
- Treat any process that can connect to the pipe as trusted.
- On Linux/macOS, sockets use the .NET-compatible `/tmp/CoreFxPipe_*` path. The server rejects unsafe pipe names, refuses to unlink non-socket files, removes stale socket files only when no listener is accepting connections, creates sockets with a restrictive umask, and applies owner-only permissions after bind.
- Linux enforces pathname socket permissions for peer connections. Other Unix variants can differ; on macOS/BSD, use named pipes only on single-user machines or where every local user is trusted.
- Run production agents under a dedicated OS user where possible. Do not use shared pipe names on multi-user machines.
- The wire protocol remains compatible with the .NET Agents SDK; malformed or abusive peers may be disconnected to protect the process.

## Architecture

The package implements the Bot Framework named pipe framing protocol, wire-compatible with `Microsoft.Agents.Hosting.DirectLine.NamedPipes` from the .NET SDK:

- **48-byte ASCII header** framing: `{Type}.{Length:6}.{Id:36}.{End}\n`
- **Dual pipes**: `.incoming` for reading, `.outgoing` for writing
- **Multi-frame streaming**: Request/response bodies sent as separate Stream (`S`) frames
- **Request correlation**: GUID-based matching of requests to responses
- **Automatic reconnection** on disconnect

### Protocol Flow

1. Server listens on `{pipeName}.incoming` and `{pipeName}.outgoing`
2. Client connects to both pipes
3. Inbound activities arrive as Request frame + Stream frame(s) → deserialized → routed to `CloudAdapter.process()`
4. Outbound requests (connector calls) are sent via the pipe protocol
5. Bodies >999,999 bytes are automatically chunked across multiple Stream frames

## API Reference

### `createLocalAdapter()`

Creates a `CloudAdapter` configured for local named-pipe communication. Bypasses authentication requirements — suitable for pipe-only agents where the pipe itself is the trust boundary.

### `startNamedPipeServer(adapter, logic, options?)`

Creates and starts a named pipe server. Returns immediately without waiting for a connection.

- `adapter` — `CloudAdapter` instance (use `createLocalAdapter()` for pipe-only agents)
- `logic` — Agent turn handler function
- `options` — Optional `NamedPipeServerOptions`
- Returns `Promise<NamedPipeService>`

### `NamedPipeService`

| Property/Method | Description |
|----------------|-------------|
| `ready` | Promise that resolves on first connection; rejects if `stop()` is called first or a non-retriable startup failure occurs |
| `isConnected` | Whether the pipe is currently connected |
| `messageHandler` | Handler for routing outbound requests via pipe |
| `start()` | Starts the server (called automatically by `startNamedPipeServer`) |
| `stop()` | Stops the server and disconnects |

### Exported Types

- `NamedPipeResponse` — Response model with factory functions (`ok()`, `accepted()`, `notFound()`, `internalServerError()`)
- `NamedPipeMessageHandler` — Bidirectional message handler interface

Low-level request and attachment protocol models are intentionally not exported from the package root. The supported public surface is scoped to starting the named-pipe service, creating a local adapter, and returning named-pipe responses.

### Outbound send backpressure

Outbound activities are sent fire-and-forget to avoid deadlocks with DirectLineFlex turn processing. The adapter still applies bounded local backpressure: if the in-memory send queue is full, `sendActivities()` throws instead of silently dropping activities.

## Azure App Service / DirectLineFlex

When deploying to Azure App Service with DirectLineFlex, the connector communicates with your agent via named pipes. Configure the pipe name to match the platform expectation (default `bfv4.pipes`).

```typescript
import { AgentApplication, TurnState } from '@microsoft/agents-hosting'
import { createLocalAdapter, startNamedPipeServer } from '@microsoft/agents-hosting-directline-namedpipes'

const adapter = createLocalAdapter()
const app = new AgentApplication<TurnState>()
app.onActivity('message', async (context) => {
  await context.sendActivity(`Echo: ${context.activity.text}`)
})

await startNamedPipeServer(adapter, (ctx) => app.run(ctx))
```

## Sample

See [`test-agents/named-pipe-agent`](../../test-agents/named-pipe-agent/README.md) for a complete working example.
