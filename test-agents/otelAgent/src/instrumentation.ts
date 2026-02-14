// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node'
import { AzureMonitorMetricExporter, AzureMonitorTraceExporter } from '@azure/monitor-opentelemetry-exporter'
import {
  PeriodicExportingMetricReader,
  ConsoleMetricExporter,
  PushMetricExporter,
} from '@opentelemetry/sdk-metrics'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'
import { ParentBasedSampler, AlwaysOnSampler, SpanExporter } from '@opentelemetry/sdk-trace-base'

const connectionString = process.env['APPLICATIONINSIGHTS_CONNECTION_STRING'] || ''
let traceExporter: SpanExporter
let metricExporter: PushMetricExporter

// Use Azure Monitor Exporter if connection string is provided, otherwise use Console Exporter.
if (connectionString.trim() !== '') {
  traceExporter = new AzureMonitorTraceExporter({
    connectionString,
  })
  metricExporter = new AzureMonitorMetricExporter({ connectionString })
} else {
  traceExporter = new ConsoleSpanExporter()
  metricExporter = new ConsoleMetricExporter()
}

const rawMetricsExportInterval = Number(process.env.OTEL_METRICS_EXPORT_INTERVAL)
const metricsExportInterval =
  Number.isFinite(rawMetricsExportInterval) && rawMetricsExportInterval > 0
    ? rawMetricsExportInterval
    : 5000
const metricReaderOptions = { exporter: metricExporter, exportIntervalMillis: metricsExportInterval }

// configure the SDK to export telemetry data.
const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'OTelAgent',
    [ATTR_SERVICE_VERSION]: '1.0.0'
  }),
  instrumentations: [getNodeAutoInstrumentations()],
  traceExporter,
  metricReader: new PeriodicExportingMetricReader(metricReaderOptions),
  sampler: new ParentBasedSampler({
    root: new AlwaysOnSampler(),
    remoteParentNotSampled: new AlwaysOnSampler(),
  }),

})

sdk.start()

process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('OTel SDK shut down successfully'))
    .catch((error) => {
      console.error('Error shutting down OTel SDK', error)
      process.exitCode = 1
    })
})
