# Sidecar Auth Agent

A minimal sample that authenticates using the **Microsoft Entra Agent ID sidecar** auth
provider (`SidecarAuthProvider`) instead of MSAL. The agent is **credential-free**: it holds
no client secret, certificate, or federated credential. All token acquisition is delegated
over HTTP to the **Microsoft Entra Agent ID sidecar (agent container)** that runs alongside the
agent.

## How it works

The default connection is configured with `authType=EntraAuthSideCar`. When the SDK builds
the connection, it creates a `SidecarAuthProvider` (via the `MsalConnectionManager` /
`defaultAuthProviderFactory` dispatch) instead of an `MsalTokenProvider`. The provider calls
the sidecar's `GET /AuthorizationHeaderUnauthenticated/{serviceName}` endpoint to obtain
app-only and agentic tokens, and `GET /healthz` for health checks.

The sidecar performs the full agentic Blueprint → Instance → User token chain internally, so
no MSAL exchange happens in-process.

## Configuration

Copy `env.TEMPLATE` to `.env` and fill in the values:

| Setting | Description |
| --- | --- |
| `authType` | Must be `EntraAuthSideCar` to select the sidecar provider. |
| `clientId` | The agent (client) app id. No secret/cert is required. |
| `tenantId` | The tenant id. |
| `sidecarBaseUrl` | Base URL of the sidecar. Defaults to `http://localhost:5178`. The `SIDECAR_URL` env var, if set, takes precedence. The host must be loopback/private unless `bypassLocalNetworkRestriction` is `true`. |
| `serviceName` | Sidecar downstream API name for app/agent tokens. Defaults to `default`. |
| `blueprintServiceName` | Sidecar downstream API name for the Blueprint token. Defaults to `agenticblueprint`. |
| `requestTimeout` | Per-attempt HTTP timeout in ms. Defaults to `30000`. |
| `retryCount` | Retry attempts for transient failures. Defaults to `3`. |
| `bypassLocalNetworkRestriction` | UNSAFE. Allow a non-loopback/non-private sidecar URL. Defaults to `false`. |

## Run

The agent expects the Entra Agent ID sidecar (agent container) to be reachable at the configured
base URL.

```bash
npm install
npm start
```

## Commands

- `/help` — list commands.
- `/health` — check whether the sidecar is reachable (`GET /healthz`).
- `/token` — acquire an app-only token for Microsoft Graph from the sidecar.
- any other message — echoed back with a per-conversation counter.
