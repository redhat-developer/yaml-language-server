/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Connection, RequestType } from 'vscode-languageserver';
import { createConnection, BrowserMessageReader, BrowserMessageWriter } from 'vscode-languageserver/browser';
import { TelemetryImpl } from '../languageserver/telemetry';
import { schemaRequestHandler, workspaceContext } from '../languageservice/services/schemaRequestHandler';
import { YAMLServerInit } from '../yamlServerInit';
import { SettingsState } from '../yamlSettings';

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace FSReadFile {
  export const type: RequestType<string, string, unknown> = new RequestType('fs/readFile');
}

const messageReader = new BrowserMessageReader(globalThis);
const messageWriter = new BrowserMessageWriter(globalThis);

const connection = createConnection(messageReader, messageWriter);

const yamlSettings = new SettingsState();

const fileSystem = {
  readFile: (fsPath: string) => {
    return connection.sendRequest(FSReadFile.type, fsPath);
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

new YAMLServerInit(connection, yamlSettings, workspaceContext, schemaRequestService, telemetry).start();
