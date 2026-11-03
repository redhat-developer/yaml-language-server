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
import { YAMLHover } from '../src/languageservice/services/yamlHover.js';
import { YAMLValidation } from '../src/languageservice/services/yamlValidation.js';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings.js';
import { setupSchemaIDTextDocument } from './utils/testHelper.js';
import { StringTypeError } from './utils/errorMessages.js';

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

  it('still validates strings when the declared meta-schema cannot be loaded', async () => {
    const schemaUri = 'https://example.com/string.schema.json';
    const metaSchemaUri = 'https://ibm.com/schemas/zosconfig/v0/meta/zos_meta.schema.json';
    service.registerExternalSchema(schemaUri, undefined, {
      $id: schemaUri,
      $schema: metaSchemaUri,
      type: 'string',
    });
    requestServiceMock.mock.mockImplementation(async () => {
      throw '<!DOCTYPE html><html>404 Not Found<script>JSON.parse(data)</script></html>';
    });
    const validation = new YAMLValidation(service);
    validation.configure({ validate: true, customTags: [], yamlVersion: '1.2' });
    const hover = new YAMLHover(service);
    hover.configure({ hover: true });

    const stringDocument = setupSchemaIDTextDocument(`# yaml-language-server: $schema=${schemaUri}\nhello`);
    assert.deepEqual(await validation.doValidation(stringDocument), []);
    await assert.doesNotReject(() => hover.doHover(stringDocument, { line: 1, character: 1 }));

    const mappingDocument = setupSchemaIDTextDocument(`# yaml-language-server: $schema=${schemaUri}\nroot:\n  content: words`);
    const diagnostics = await validation.doValidation(mappingDocument);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].message, StringTypeError);
    await assert.doesNotReject(() => hover.doHover(mappingDocument, { line: 2, character: 4 }));
    assert.deepEqual(
      requestServiceMock.mock.calls.map((call) => call.arguments),
      [[metaSchemaUri]]
    );
  });
});
