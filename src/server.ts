/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Adam Voss. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs, existsSync } from 'fs';
import { Connection, createConnection, InitializeParams, ProposedFeatures } from 'vscode-languageserver/node';
import { TelemetryImpl } from './languageserver/telemetry';
import { schemaRequestHandler, workspaceContext } from './languageservice/services/schemaRequestHandler';
import { convertErrorToTelemetryMsg } from './languageservice/utils/objects';
import { YAMLServerInit } from './yamlServerInit';
import { SettingsState } from './yamlSettings';
import * as path from 'path';
import * as l10n from '@vscode/l10n';
import { URI } from 'vscode-uri';

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
  readFile: async (fsPath: string, encoding?: string) => {
    const b = await fs.readFile(fsPath, encoding as BufferEncoding);
    return b.toString();
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
const telemetry = new TelemetryImpl(connection);

async function setupl10nBundle(params: InitializeParams): Promise<void> {
  const __dirname = path.dirname(__filename);
  const l10nPath: string = params.initializationOptions?.l10nPath || path.join(__dirname, '../../../l10n');
  const locale: string = params.locale || 'en';
  if (l10nPath) {
    const bundleFile = !existsSync(path.join(l10nPath, `bundle.l10n.${locale}.json`))
      ? `bundle.l10n.json`
      : `bundle.l10n.${locale}.json`;
    const baseBundleFile = path.join(l10nPath, bundleFile);
    process.env.VSCODE_NLS_CONFIG = JSON.stringify({
      locale,
      _languagePackSupport: true,
    });
    await l10n.config({
      uri: URI.file(baseBundleFile).toString(),
    });
  }
}

new YAMLServerInit(connection, yamlSettings, workspaceContext, schemaRequestService, telemetry, setupl10nBundle).start();
