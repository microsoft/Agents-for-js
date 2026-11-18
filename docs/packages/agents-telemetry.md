# @microsoft/agents-telemetry

Start with the [Microsoft 365 Agents SDK documentation](https://learn.microsoft.com/microsoft-365/agents-sdk/)
for primary developer guidance. The examples below are excerpts; surrounding
application setup, variables, or imports may be omitted.

See the [package guide index](../PACKAGE-GUIDES.md) for related contributor guides.

For basic setup, sampling, span and metric names, log records, and general span
error handling, see the
[JavaScript telemetry reference](https://learn.microsoft.com/microsoft-365/agents-sdk/agent-telemetry?pivots=nodejs).

## Application exporter examples

### Tracing with OTLP

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

---

## For SDK Contributors

This section covers internal APIs used to instrument SDK components. If you are contributing to the Agents SDK packages, use `trace`, `debug`, and `metric` to add observability to your code.

Although this package is published, it primarily serves as a shared telemetry layer for other Agents SDK packages. Some exported TypeScript types intentionally depend on OpenTelemetry packages even though runtime behavior still supports noop fallback when those optional peer dependencies are not installed.

When optional OpenTelemetry APIs are missing, the SDK uses its fallback implementations and logs a warning.

This package supports both ESM and CommonJS consumers and requires Node.js 22 or later.

The `build:esm` command also bundles the ESM-only `@noble/hashes` dependency into the CommonJS redaction module. Run the complete `npm run build` before consuming the package; TypeScript compilation alone does not produce the final CommonJS artifact. This preserves Node.js 22.0+ and browser support without requiring Node's `require(esm)` feature.

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

const { record, actions, child, end, fail } = trace({
  name: SpanNames.ADAPTER_PROCESS,
  record: { status: 'pending' },
  end: ({ span, record, duration }) => {
    span.setAttribute('status', record.status)
  },
})

try {
  record({ status: 'processing' })
  const keys = ['conversation']
  await child(
    {
      name: SpanNames.STORAGE_READ,
      record: { keys: 0 },
      end: ({ span, record }) => {
        span.setAttribute('storage.keys', record.keys)
      },
    },
    async ({ record }) => {
      record({ keys: 5 })
      await storage.read(keys)
    }
  )
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

- Non-Error thrown values are recorded with their type name and string representation.
- Unrecognized span names throw immediately.
- The deprecated disabled-span categories run the callback with a noop context — no telemetry is emitted.
- Managed spans can start parented spans with `child(definition)` or `child(definition, callback)`.
- Record updates recursively merge plain objects; arrays are copied and replaced.
- The `end` hook receives `{ span, record, duration, error? }`.

### Using debug

```ts
import { debug } from '@microsoft/agents-telemetry'

const logger = debug('agents:mycomponent')
logger.info('Processing request', { requestId })
logger.error('Failed to connect', error)
```

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
- **Span name validation**: Unknown span names are rejected early
- **Record tracking**: Accumulate structured data during a trace and access it in the `end` hook
- **Managed child spans**: Start child spans from a managed trace context when a manual parent span stays open
- **Custom actions**: Define span-scoped helper functions via the `actions` factory
- **Noop fallback**: All instrumentation calls are safe no-ops when OpenTelemetry APIs are not installed

---

## API Reference

### `trace(definition)` — Managed mode

Starts a span and returns a managed context with `record`, `actions`, `child`, `end`, and `fail` methods.

| Parameter | Type | Description |
|-----------|------|-------------|
| `definition` | `TraceDefinition` | Trace definition object (see below). |

Returns: `{ record, actions, child, end, fail }`

### `managed.child(definition[, callback])`

Starts a span parented to an open managed span. Without a callback, it returns another managed context. With a callback, the child span follows callback-mode lifecycle behavior.

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

## License

MIT
