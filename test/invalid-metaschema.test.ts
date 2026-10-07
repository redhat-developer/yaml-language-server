/*---------------------------------------------------------------------------------------------
 *  Copyright (c) IBM Corp. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import type { Mock } from 'node:test';
import type { SchemaRequestService } from '../src/languageservice/yamlLanguageService.js';
import assert from 'node:assert/strict';
import type { Connection, RemoteClient } from 'vscode-languageserver/node';
import { JSONSchemaSelection } from '../src/languageserver/handlers/schemaSelectionHandlers.js';
import { YAMLSchemaService } from '../src/languageservice/services/yamlSchemaService.js';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings.js';
import { setupSchemaIDTextDocument } from './utils/testHelper.js';

describe('unexpected meta schema', () => {
  const connection: Connection = {} as Connection;
  let service: YAMLSchemaService;
  let requestServiceMock: Mock<SchemaRequestService>;

  beforeEach(() => {
    requestServiceMock = mock.fn(() =>
      Promise.resolve('{ "$schema": "https://example.com/my-custom-meta-schema/v1", "type": "object" }')
    );
    service = new YAMLSchemaService(requestServiceMock);
    connection.client = {} as RemoteClient;
    const onRequest = mock.fn();
    connection.onRequest = onRequest;
  });

  afterEach(() => {
    mock.reset();
  });

  it('should not throw when a non-standard meta schema is used', async () => {
    service.registerExternalSchema('https://some.com/some.json', ['*.yaml'], undefined, 'Schema name', 'Schema description');
    const settings = new SettingsState();
    const testTextDocument = setupSchemaIDTextDocument('');
    settings.documents = new TextDocumentTestManager();
    (settings.documents as TextDocumentTestManager).set(testTextDocument);
    const selection = new JSONSchemaSelection(service, settings, connection);

    try {
      await selection.getSchemas(testTextDocument.uri);
    } catch (e) {
      assert.fail('Unexpected exception: ' + e);
    }
  });
});
