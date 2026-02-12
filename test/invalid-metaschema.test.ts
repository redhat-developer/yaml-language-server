/*---------------------------------------------------------------------------------------------
 *  Copyright (c) IBM Corp. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { assert } from 'chai';
import * as sinon from 'sinon';
import { Connection, RemoteClient } from 'vscode-languageserver/node';
import { JSONSchemaSelection } from '../src/languageserver/handlers/schemaSelectionHandlers';
import { YAMLSchemaService } from '../src/languageservice/services/yamlSchemaService';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';
import { setupSchemaIDTextDocument } from './utils/testHelper';

describe('unexpected meta schema', () => {
  const sandbox = sinon.createSandbox();
  const connection: Connection = {} as Connection;
  let service: YAMLSchemaService;
  let requestServiceMock: sinon.SinonSpy;

  beforeEach(() => {
    requestServiceMock = sandbox.fake.resolves('{ "$schema": "https://example.com/my-custom-meta-schema/v1", "type": "object" }');
    service = new YAMLSchemaService(requestServiceMock);
    connection.client = {} as RemoteClient;
    const onRequest = sandbox.fake();
    connection.onRequest = onRequest;
  });

  afterEach(() => {
    sandbox.restore();
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
