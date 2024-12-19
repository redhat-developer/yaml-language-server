/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Due to LSP limitation this object must be JSON serializable
 */
export interface TelemetryEvent {
  name: string;
  type?: string;
  properties?: unknown;
  measures?: unknown;
  traits?: unknown;
  context?: unknown;
}

export interface Telemetry {
  send(event: TelemetryEvent): void;

  sendError(name: string, error: unknown): void;

  sendTrack(name: string, properties: unknown): void;
}
