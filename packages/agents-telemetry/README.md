# @microsoft/agents-telemetry

## Overview

The `@microsoft/agents-telemetry` package provides OpenTelemetry instrumentation primitives used across the Microsoft Agents SDK. It enables distributed tracing, structured log emission, and stable metric naming so you can monitor agent interactions, connector calls, storage operations, authentication flows, and turn processing.

The package exports:

- `trace` — span creation with record tracking, custom actions, and lifecycle hooks
- `debug` — loggers that bridge the `debug` module with OpenTelemetry log records
- `metric` — histogram and counter creation via the OpenTelemetry Meter API
- `SpanNames` / `MetricNames` — stable name constants for observability across the SDK

This package supports both ESM and CommonJS consumers and requires Node.js 20 or later.

---

## For Agent Developers

This section covers how to enable and configure telemetry in your agent application. The SDK automatically instruments its components — you only need to wire up OpenTelemetry exporters and, optionally, tune which span categories are active.

### Peer Dependencies

Install the OpenTelemetry API packages in your agent for full integration:

```sh
npm install @opentelemetry/api @opentelemetry/api-logs
```

Both are optional. If missing, the SDK falls back to noop implementations and logs a warning. Installing the official packages is recommended for full tracing, metrics, and log export.

### Enabling Tracing

For traces to be exported, configure the OpenTelemetry SDK with an exporter. Console exporter for development:

```ts
import { NodeSDK } from '@opentelemetry/sdk-node'
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node'

const sdk = new NodeSDK({
  traceExporter: new ConsoleSpanExporter(),
  serviceName: 'my-agent-service',
})

sdk.start()
```

Once configured, all SDK components that use `trace(...)` will emit spans through the global tracer provider.

To export metrics referenced by `MetricNames`, configure a metric reader/exporter in your OpenTelemetry SDK as well.

#### Production Setup with OTLP Exporter

For production, use an OTLP exporter to send traces to your observability backend (Azure Monitor, Jaeger, Grafana, etc.):

```ts
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:4318/v1/traces', // Your OTLP endpoint
  }),
  serviceName: 'my-agent-service',
})

sdk.start()
```

### Enabling Logs (OTLP)

To export logs produced by `debug` loggers to an OTLP backend, add a logs processor during startup:

```ts
import { NodeSDK } from '@opentelemetry/sdk-node'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317'

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'my-agent-service',
    [ATTR_SERVICE_VERSION]: '1.0.0',
  }),
  logRecordProcessors: [
    new BatchLogRecordProcessor(new OTLPLogExporter({ url: otlpEndpoint })),
  ],
})

sdk.start()
```

### Disabling Span Categories

All built-in span categories are enabled by default. To disable one or more categories without changing code, set `AGENTS_TELEMETRY_DISABLED_SPAN_CATEGORIES` in your environment:

```env
AGENTS_TELEMETRY_DISABLED_SPAN_CATEGORIES=STORAGE,AUTHORIZATION

# or

AGENTS_TELEMETRY_DISABLED_SPAN_CATEGORIES=STORAGE AUTHORIZATION
```

Valid category names are:

- `STORAGE`
- `AUTHENTICATION`
- `AUTHORIZATION`
- `DIALOGS`

When a span category is disabled, instrumented code still runs normally with a noop context — no telemetry is emitted for those spans.

### Span and Metric Names

The SDK uses predefined constants for all span and metric names:

```ts
import { SpanNames, MetricNames } from '@microsoft/agents-telemetry'

// Example span names:
SpanNames.ADAPTER_PROCESS          // 'agents.adapter.process'
SpanNames.AGENTS_APP_RUN           // 'agents.app.run'
SpanNames.STORAGE_READ             // 'agents.storage.read'
SpanNames.CONNECTOR_REPLY_TO_ACTIVITY // 'agents.connector.reply_to_activity'

// Example metric names:
MetricNames.ACTIVITIES_RECEIVED        // 'agents.activities.received'
MetricNames.CONNECTOR_REQUEST_DURATION // 'agents.connector.request.duration'
MetricNames.TURN_DURATION              // 'agents.turn.duration'
MetricNames.AUTH_TOKEN_REQUEST_COUNT   // 'agents.auth.token.request.count'
// ... and more
```

---

## For SDK Contributors

This section covers internal APIs used to instrument SDK components. If you are contributing to the Agents SDK packages, use `trace`, `debug`, and `metric` to add observability to your code.

Although this package is published, it primarily serves as a shared telemetry layer for other Agents SDK packages. Some exported TypeScript types intentionally depend on OpenTelemetry packages even though runtime behavior still supports noop fallback when those optional peer dependencies are not installed.

### Using trace

Use `trace` to create validated spans. Every definition requires a `name` from `SpanNames`, a `record` object for tracking state, and an `end` hook called when the span finishes.

#### Callback mode

The span is started and ended automatically around the callback:

```ts
import { SpanNames, trace } from '@microsoft/agents-telemetry'

const result = await trace(
  {
    name: SpanNames.AGENTS_APP_ROUTE_HANDLER,
    record: { conversationId: '', messageCount: 0 },
    actions: ({ span }) => ({
      setAttribute: (key: string, value: string) => span.setAttribute(key, value),
    }),
    end: ({ span, record, duration, error }) => {
      span.setAttribute('conversation.id', record.conversationId)
      span.setAttribute('message.count', record.messageCount)
    },
  },
  async ({ record, actions }) => {
    record({ conversationId })
    actions.setAttribute('code.function', 'handleMessage')
    const result = await service.handleMessage(conversationId, text)
    record({ messageCount: result.count })
    return result
  }
)
```

#### Managed mode (no callback)

For long-lived operations where you need manual control over the span lifecycle:

```ts
import { SpanNames, trace } from '@microsoft/agents-telemetry'

const { record, actions, end, fail } = trace({
  name: SpanNames.ADAPTER_PROCESS,
  record: { status: 'pending' },
  end: ({ span, record, duration }) => {
    span.setAttribute('status', record.status)
  },
})

try {
  record({ status: 'processing' })
  await doWork()
  record({ status: 'done' })
  end()
} catch (error) {
  fail(error)
  end()
  throw error
}
```

#### Reusable definitions

Use `trace.define` to declare a trace definition with full type inference, without starting a span:

```ts
const storageReadTrace = trace.define({
  name: SpanNames.STORAGE_READ,
  record: { keys: 0 },
  end: ({ span, record }) => {
    span.setAttribute('storage.keys', record.keys)
  },
})

// Later:
trace(storageReadTrace, ({ record }) => {
  record({ keys: 5 })
  return storage.read(keys)
})
```

#### Behavior details

- On success, the span status is set to `OK`.
- On failure, the exception is recorded on the span, status is set to `ERROR`, and the error is rethrown.
- Non-Error thrown values are recorded with their type name and string representation.
- Unrecognized span names throw immediately.
- Disabled span categories run the callback with a noop context — no telemetry is emitted.
- The `end` hook receives `{ span, record, duration, error? }`.

### Using debug

Create loggers that emit to both the `debug` module and OpenTelemetry logs:

```ts
import { debug } from '@microsoft/agents-telemetry'

const logger = debug('agents:mycomponent')
logger.info('Processing request', { requestId })
logger.error('Failed to connect', error)
```

When `@opentelemetry/api-logs` is available, log records are emitted with severity and namespace attributes. Otherwise, only the `debug` output is produced.

### Using metric

Create OpenTelemetry instruments for recording measurements:

```ts
import { metric, MetricNames } from '@microsoft/agents-telemetry'

const duration = metric.histogram(MetricNames.TURN_DURATION)
const counter = metric.counter(MetricNames.ACTIVITIES_RECEIVED)

duration.record(elapsed, { 'activity.type': 'message' })
counter.add(1, { 'activity.type': 'message' })
```

When `@opentelemetry/api` is not available, the instruments are safe noops.

### Key Features

- **Automatic span lifecycle**: Spans are started and ended automatically in callback mode
- **Error recording**: Exceptions are recorded on the span with `ERROR` status
- **Span name validation**: Unknown span names are rejected early
- **Record tracking**: Accumulate structured data during a trace and access it in the `end` hook
- **Custom actions**: Define span-scoped helper functions via the `actions` factory
- **Category-based disabling**: Disable groups of spans via environment configuration
- **Noop fallback**: All instrumentation calls are safe no-ops when OpenTelemetry APIs are not installed

---

## API Reference

### `trace(definition)` — Managed mode

Starts a span and returns a managed context with `record`, `actions`, `end`, and `fail` methods.

| Parameter | Type | Description |
|-----------|------|-------------|
| `definition` | `TraceDefinition` | Trace definition object (see below). |

Returns: `{ record, actions, end, fail }`

### `trace(definition, callback)` — Callback mode

Runs `callback` inside an active span. The span is ended automatically when the callback returns or throws.

| Parameter | Type | Description |
|-----------|------|-------------|
| `definition` | `TraceDefinition` | Trace definition object (see below). |
| `callback` | `(context) => TReturn` | Callback receiving `{ record, actions }`. Return value (including a `Promise`) is forwarded. |

Returns: Whatever `callback` returns.

### `TraceDefinition`

| Property | Type | Description |
|----------|------|-------------|
| `name` | `SpanName` | Span name. Must be one of `SpanNames` values. |
| `record` | `object` | Initial record state. Updated via `record()` during the trace. |
| `actions` | `(ctx: { span }) => object` | *(Optional)* Factory that receives the span and returns action helpers. |
| `end` | `(ctx: { span, record, duration, error? }) => void` | Hook called when the span ends. Use it to set final attributes or record metrics. |

### `trace.define(definition)`

Returns the `definition` object as-is. Useful for declaring reusable trace definitions with full type inference.

### `debug(namespace)`

Creates a logger for the given namespace. When `@opentelemetry/api-logs` is available, the logger bridges the `debug` module with OpenTelemetry log emission. Otherwise, it creates a `debug`-only logger.

| Parameter | Type | Description |
|-----------|------|-------------|
| `namespace` | `string` | Logger namespace (e.g. `'agents:hosting'`). |

Returns: `{ info, warn, error, debug }` — each method accepts a message string and optional arguments.

### `metric`

Provides factory methods for creating OpenTelemetry instruments. When `@opentelemetry/api` is not available, returns noop instruments.

| Method | Description |
|--------|-------------|
| `metric.histogram(name)` | Creates a histogram instrument. |
| `metric.counter(name)` | Creates a counter instrument. |

### `SpanNames`

Provides stable span name constants used by Agents SDK components, including adapter, application, connector, storage, authentication, authorization, user token client, turn-processing, and Copilot Studio client operations.

### `MetricNames`

Provides stable metric name constants for counters and histograms used by Agents SDK components, including activity counts, request counts, turn counts, and duration metrics.

## License

MIT
