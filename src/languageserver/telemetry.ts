/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Connection } from 'vscode-languageserver';
import { TelemetryEvent, Telemetry as TelemetryType } from '../languageservice/telemetry';

export class Telemetry implements TelemetryType {
  constructor(private readonly connection: Connection) {}

  send(event: TelemetryEvent): void {
    this.connection.telemetry.logEvent(event);
  }

  sendError(name: string, properties: unknown): void {
    this.send({ name, type: 'track', properties: properties });
  }

  sendTrack(name: string, properties: unknown): void {
    this.send({ name, type: 'track', properties: properties });
  }
}
