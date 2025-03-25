/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Defines the level of severity for the event.
 */
export enum Severity {
  Verbose = 0,
  Information = 1,
  Warning = 2,
  Error = 3,
  Critical = 4,
}

/**
 * Key used to store and fetch a AgentTelemetryClientKey from TurnContextStateCollection
 */
export const AgentTelemetryClientKey = 'AgentTelemetryClient'

export interface AgentTelemetryClient {
  trackDependency(telemetry: TelemetryDependency);
  trackEvent(telemetry: TelemetryEvent);
  trackException(telemetry: TelemetryException);
  trackTrace(telemetry: TelemetryTrace);
  flush();
}

export interface AgentPageViewTelemetryClient {
  trackPageView(telemetry: TelemetryPageView);
}

export interface TelemetryDependency {
  dependencyTypeName: string;
  target: string;
  name: string;
  data: string;
  duration: number;
  success: boolean;
  resultCode: number;
}

export interface TelemetryEvent {
  name: string;
  properties?: { [key: string]: any };
  metrics?: { [key: string]: number };
}

export interface TelemetryException {
  exception: Error;
  handledAt?: string;
  properties?: { [key: string]: string };
  measurements?: { [key: string]: number };
  severityLevel?: Severity;
}

export interface TelemetryTrace {
  message: string;
  properties?: { [key: string]: string };
  severityLevel?: Severity;
}

export interface TelemetryPageView {
  name: string;
  properties?: { [key: string]: string };
  metrics?: { [key: string]: number };
}

/**
 * A null telemetry client that implements AgentTelemetryClient.
 */
export class NullTelemetryClient implements AgentTelemetryClient, AgentPageViewTelemetryClient {
  /**
     * Logs an Application Insights page view.
     *
     * @param _telemetry An object implementing TelemetryPageView.
     */
  trackPageView (_telemetry: TelemetryPageView) {
    // noop
  }

  /**
     * Sends information about an external dependency (outgoing call) in the application.
     *
     * @param _telemetry An object implementing TelemetryDependency.
     */
  trackDependency (_telemetry: TelemetryDependency) {
    // noop
  }

  /**
     * Logs custom events with extensible named fields.
     *
     * @param _telemetry An object implementing TelemetryEvent.
     */
  trackEvent (_telemetry: TelemetryEvent) {
    // noop
  }

  /**
     * Logs a system exception.
     *
     * @param _telemetry An object implementing TelemetryException.
     */
  trackException (_telemetry: TelemetryException) {
    // noop
  }

  /**
     * Sends a trace message.
     *
     * @param _telemetry An object implementing TelemetryTrace.
     */
  trackTrace (_telemetry: TelemetryTrace) {
    // noop
  }

  /**
     * Flushes the in-memory buffer and any metrics being pre-aggregated.
     */
  flush () {
    // noop
  }
}

/**
 * Logs a DialogView using the AgentTelemetryClient.trackPageView method on the AgentTelemetryClient if AgentPageViewTelemetryClient has been implemented.
 * Alternatively logs the information out via TrackTrace.
 *
 * @param telemetryClient TelemetryClient that implements AgentTelemetryClient.
 * @param dialogName Name of the dialog to log the entry / start for.
 * @param properties Named string values you can use to search and classify events.
 * @param metrics Measurements associated with this event.
 */
export function telemetryTrackDialogView (
  telemetryClient: AgentTelemetryClient,
  dialogName: string,
  properties?: { [key: string]: any },
  metrics?: { [key: string]: number }
): void {
  if (!clientSupportsTrackDialogView(telemetryClient)) {
    throw new TypeError('"telemetryClient" parameter does not have methods trackPageView() or trackTrace()')
  }
  if (instanceOfAgentPageViewTelemetryClient(telemetryClient)) {
    telemetryClient.trackPageView({ name: dialogName, properties, metrics })
  } else {
    telemetryClient.trackTrace({ message: 'Dialog View: ' + dialogName, severityLevel: Severity.Information })
  }
}

function instanceOfAgentPageViewTelemetryClient (object: any): object is AgentPageViewTelemetryClient {
  return 'trackPageView' in object
}

function clientSupportsTrackDialogView (client: any): boolean {
  if (!client) {
    return false
  }
  if (typeof client.trackPageView !== 'function' && typeof client.trackTrace !== 'function') {
    return false
  }
  return true
}
