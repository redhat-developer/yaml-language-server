/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Adam Voss. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createConnection, Connection, ProposedFeatures } from 'vscode-languageserver/node';
import * as nls from 'vscode-nls';
import { schemaRequestHandler, workspaceContext } from './languageservice/services/schemaRequestHandler';
import { YAMLServerInit } from './yamlServerInit';
import { SettingsState } from './yamlSettings';
import { promises as fs } from 'fs';
import { convertErrorToTelemetryMsg } from './languageservice/utils/objects';
import { Telemetry } from './languageserver/telemetry';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
nls.config(process.env['VSCODE_NLS_CONFIG'] as any);

// Create a connection for the server.
let connection: Connection = null;

if (process.argv.indexOf('--stdio') === -1) {
  connection = createConnection(ProposedFeatures.all);
} else {
  connection = createConnection();
}

process.on('uncaughtException', (err: Error) => {
  // send all uncaught exception to telemetry with stack traces
  connection.console.error(convertErrorToTelemetryMsg(err));
});

console.log = connection.console.log.bind(connection.console);
console.error = connection.console.error.bind(connection.console);

//vscode-nls calls console.error(null) in some cases, so we put that in info, to predict sending "null" in to telemetry
console.error = (arg) => {
  if (arg === null) {
    connection.console.info(arg);
  } else {
    connection.console.error(arg);
  }
};

const yamlSettings = new SettingsState();

const fileSystem = {
  readFile: (fsPath: string, encoding?: string) => {
    return fs.readFile(fsPath, encoding).then((b) => b.toString());
  },
};

/**
 * Handles schema content requests given the schema URI
 * @param uri can be a local file, vscode request, http(s) request or a custom request
 */
const schemaRequestHandlerWrapper = (connection: Connection, uri: string): Promise<string> => {
  return schemaRequestHandler(
    connection,
    uri,
    yamlSettings.workspaceFolders,
    yamlSettings.workspaceRoot,
    yamlSettings.useVSCodeContentRequest,
    fileSystem
  );
};

const schemaRequestService = schemaRequestHandlerWrapper.bind(this, connection);
const telemetry = new Telemetry(connection);

new YAMLServerInit(connection, yamlSettings, workspaceContext, schemaRequestService, telemetry).start();
