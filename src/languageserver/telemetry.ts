/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Connection } from 'vscode-languageserver/lib/common/server';

/**
 * Doe to LSP limitation this object must be JSON serializable
 */
export interface TelemetryEvent {
  type?: string;
  name: string;
  properties?: unknown;
  measures?: unknown;
  traits?: unknown;
  context?: unknown;
}

export class Telemetry {
  constructor(private readonly connection: Connection) {}

  send(event: TelemetryEvent): void {
    this.connection.telemetry.logEvent(event);
  }

  sendError(name: string, properties: unknown): void {
    this.send({ name, type: 'track', properties });
  }

  sendTrack(name: string, properties: unknown): void {
    this.send({ name, type: 'track', properties });
  }
}
