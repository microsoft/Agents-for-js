# @microsoft/agents-hosting-runner

A pre-built host for an Agents SDK application. The `agent-runner` command loads
your compiled agent module and serves authenticated requests on
`http://127.0.0.1:<port>/api/messages`. Requires Node.js 22 or later.

## Agent module

Export an `AgentApplication` instance as the named export `agent`. Keep HTTP
startup in a separate entry point so importing the module does not start a server:

```typescript
import { AgentApplication, MemoryStorage } from '@microsoft/agents-hosting'

export const agent = new AgentApplication({ storage: new MemoryStorage() })

agent.onActivity('message', async (context) => {
  await context.sendActivity(`You said: ${context.activity.text}`)
})
```

For ordinary local development, a separate entry point can import `agent` and call
`startServer(agent)` from `@microsoft/agents-hosting-express`. The runner imports the
agent module instead of that entry point. It preserves the agent's adapter,
middleware, state, and outbound header propagation.

## Installation and startup

Install an exact published version of this package alongside your application's
SDK dependencies at image build time, using your approved package feed:

```powershell
npm install --save-exact @microsoft/agents-hosting-runner@PUBLISHED_VERSION
```

Build your application, then run the installed command:

```powershell
.\node_modules\.bin\agent-runner --agent-module .\dist\agent.js --port 3978
```

Both `--agent-module` and `--port` are required; the port must be an integer from
1 through 65535. `--help` (`-h`) and `--version` do not start a server. Paths may
contain spaces. ESM and CommonJS modules with a named `agent` export are supported.
Compile TypeScript before deployment; the runner does not include a transpiler.

Use the runner as the container entry point, with paths appropriate to the image.
Include the compiled application, its private dependencies, and the complete
installed runner dependency graph. Do not fetch packages at process startup or
copy only the command launcher. Retain the deployment's existing proxy/network
arrangement: the listener is intentionally loopback-only.

Use the same SDK release for the runner and application, installed in a shared
dependency graph so both resolve the same hosting package. Cross-major
compatibility is not guaranteed. Importing customer code executes it with host
privileges; this is **not a security sandbox**.

## Configuration and authentication

The runner loads optional `appsettings.json` beside the compiled agent module
**before importing the module**, using the SDK's configuration preloader.
Environment variables override file values. For example:

```json
{
  "Connections": {
    "ServiceConnection": {
      "Settings": {
        "ClientId": "11111111-1111-1111-1111-111111111111",
        "TenantId": "22222222-2222-2222-2222-222222222222"
      }
    }
  }
}
```

Or supply the required client and tenant GUIDs through environment variables:

```powershell
$env:Connections__ServiceConnection__Settings__ClientId = "<agent-client-id>"
$env:Connections__ServiceConnection__Settings__TenantId = "<agent-tenant-id>"
```

The CLI always runs in Production. `POST /api/messages` requires signed,
unexpired RS256 Azure Bot Service or Microsoft Entra tokens for the configured
client audience, even when the caller's environment is set to development.
Entra issuers are restricted to the configured tenant's v1/v2 issuers.
Additional trusted HTTPS issuers must be explicitly configured using
`AgentRunner:Authentication:AdditionalEntraIssuers` in the JSON file, or
`AgentRunner__Authentication__AdditionalEntraIssuers__0`, `__1`, etc. in the
environment. Environment values replace file entries at the same index.
Only trusted deployment policy should extend this allow-list.

Microsoft signing-key discovery requires network access to the relevant
Microsoft endpoints. Outbound authentication and other agent settings continue
to use the normal SDK configuration. Startup errors are reported to stderr with
a nonzero exit code.

## Programmatic hosting

`startAgentRunner({ agentModulePath, port })` returns a promise for the listening
Node.js HTTP server. Close it with `server.close()` when finished. Call it once
per process, before any other code consumes the SDK's process-level configuration.
Inbound authentication remains mandatory when using this API.
