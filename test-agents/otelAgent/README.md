# OTelAgent Sample (OpenTelemetry + Microsoft 365 Agents SDK)

This sample shows a simple Agent hosted as a Node.js web app instrumented end-to-end with OpenTelemetry (traces, metrics, and logs) exporting to the [.NET Aspire Dashboard](https://learn.microsoft.com/dotnet/aspire/fundamentals/dashboard/overview) as the telemetry backend.
It echoes user messages and demonstrates how to add custom spans, counters, histograms, and enrichment for inbound and outbound HTTP operations.

The sample helps you:
- Understand the Microsoft 365 Agents SDK messaging loop.
- Learn how to integrate OpenTelemetry in an Agent (configuration, custom telemetry, enrichment).
- Export telemetry data to the Aspire Dashboard for local visualization and debugging.

## Prerequisites

- [Node.js](https://nodejs.org/en) version 20 or higher
- (optional) [Docker](https://www.docker.com/get-started/) (to run the Aspire Dashboard container)
## (Optional) Setting up the Aspire Dashboard

The [.NET Aspire Dashboard](https://learn.microsoft.com/dotnet/aspire/fundamentals/dashboard/standalone) is a lightweight, standalone dashboard for viewing OpenTelemetry data. Run it locally with Docker:

```bash
docker run --rm -it \
  -p 18888:18888 \
  -p 4317:18889 \
  -d --name aspire-dashboard \
  mcr.microsoft.com/dotnet/aspire-dashboard:9.2
```

This exposes:
- **Dashboard UI** at [http://localhost:18888](http://localhost:18888) — browse traces, metrics, and logs.
- **OTLP gRPC endpoint** at `http://localhost:4317` — where the agent sends telemetry.

> Check the container logs (`docker logs aspire-dashboard`) for the dashboard login token.

For more details, see:
- [Aspire Dashboard overview](https://learn.microsoft.com/dotnet/aspire/fundamentals/dashboard/overview)
- [Standalone Aspire Dashboard](https://learn.microsoft.com/dotnet/aspire/fundamentals/dashboard/standalone)

## Configuring the Agent

1. Rename `env.TEMPLATE` to `.env`.

1. Set the OTLP endpoint to point to the Aspire Dashboard:

   ```bash
   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
   ```

   **NOTE: If you don't set `OTEL_EXPORTER_OTLP_ENDPOINT`, telemetry will be printed to the console instead.**

1. (Optional) Adjust the metrics and logs export intervals:

   ```bash
   OTEL_METRICS_EXPORT_INTERVAL=5000
   OTEL_LOGS_EXPORT_INTERVAL=5000
   ```

1. Configuring the authentication connection in the Agent settings
   > These instructions are for **SingleTenant, Client Secret**. For other auth type configuration, see [Configure authentication in a JavaScript agent](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/azure-bot-authentication-for-javascript).
   1. Find the `connections` section;  it should appear similar to this:
      ```bash
      connections__serviceConnection__settings__clientId={{clientId}} # this is the Client ID used for the connection.
      connections__serviceConnection__settings__clientSecret={{clientSecret}} # this is the Client Secret used for the connection.
      connections__serviceConnection__settings__tenantId={{tenantId}} # this is the tenant ID for the application.
      ```
   1. Replace all **{{clientId}}** with the App Registration Id.
   1. Replace all **{{tenantId}}** with the Tenant Id where your application is registered.
   1. Set the **{{clientSecret}}** to the Secret that was created on the App Registration.
   > Storing sensitive values in .env files is not recommended.  Follow 
   [Microsoft identity platform authentication](https://learn.microsoft.com/en-us/entra/identity-platform/authentication-vs-authorization) and [MSAL.js](https://learn.microsoft.com/azure/active-directory/develop/msal-overview) for best practices.

## Running the Agent

### QuickStart using Agents Playground

1. If you haven't done so already, install the Agents Playground:

   ```bash
   winget install agentsplayground
   ```

1. In the agent's root directory, install dependencies:

   ```bash
   npm install
   ```

1. Start the Agent:

   ```bash
   npm start
   ```

1. Start Agents Playground. At a command prompt: `agentsplayground`
   - The tool will open a web browser showing the Microsoft 365 Agents Playground, ready to send messages to your agent.

1. Interact with the Agent via the browser.

## Viewing Telemetry

1. Open the Aspire Dashboard at [http://localhost:18888](http://localhost:18888).
1. Send a few messages to the agent through the Agents Playground.
1. In the dashboard, explore:
   - **Traces** — see the full request lifecycle including custom spans.
   - **Metrics** — view counters, histograms, and other custom metrics.
   - **Structured Logs** — inspect log records emitted by the agent.

## Further reading

- [Microsoft 365 Agents SDK](https://github.com/microsoft/agents)
- [.NET Aspire Dashboard overview](https://learn.microsoft.com/dotnet/aspire/fundamentals/dashboard/overview)
- [Standalone Aspire Dashboard](https://learn.microsoft.com/dotnet/aspire/fundamentals/dashboard/standalone)
- [OpenTelemetry JS SDK](https://opentelemetry.io/docs/languages/js/)
