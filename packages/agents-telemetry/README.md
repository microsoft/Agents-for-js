# @microsoft/agents-telemetry

## Overview

Shared OpenTelemetry instrumentation for the Microsoft 365 Agents SDK for JavaScript
and TypeScript. Provides distributed tracing, structured logging, metrics, and
consistent span and metric names for observing agent and SDK operations.

## Important considerations

Exporting telemetry requires application-configured OpenTelemetry providers and
exporters. This package supplies instrumentation, not a telemetry backend.
Without the optional OpenTelemetry APIs, the corresponding instrumentation falls
back to no-op behavior; debug logging remains available.

## Documentation

- [Microsoft 365 Agents SDK documentation](https://learn.microsoft.com/microsoft-365/agents-sdk/)
- [Telemetry setup and instrumentation guide](https://github.com/microsoft/Agents-for-js/blob/main/docs/packages/agents-telemetry.md)
- [API reference](https://learn.microsoft.com/javascript/api/@microsoft/agents-telemetry?view=agents-sdk-js-latest)
- [Release notes](https://github.com/microsoft/Agents-for-js/releases)
