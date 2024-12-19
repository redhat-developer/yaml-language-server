/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Connection } from 'vscode-languageserver';
import { TelemetryEvent, Telemetry } from '../languageservice/telemetry';
import { convertErrorToTelemetryMsg } from '../languageservice/utils/objects';

export class TelemetryImpl implements Telemetry {
  constructor(private readonly connection: Connection) {}

  send(event: TelemetryEvent): void {
    this.connection.telemetry.logEvent(event);
  }

  sendError(name: string, error: unknown): void {
    this.send({ name, type: 'track', properties: { error: convertErrorToTelemetryMsg(error) } });
  }

  sendTrack(name: string, properties: unknown): void {
    this.send({ name, type: 'track', properties: properties });
  }
}
