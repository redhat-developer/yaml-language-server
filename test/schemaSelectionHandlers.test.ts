/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as sinon from 'sinon';
import * as chai from 'chai';
import * as sinonChai from 'sinon-chai';
import { JSONSchemaSelection } from '../src/languageserver/handlers/schemaSelectionHandlers';
import { YAMLSchemaService } from '../src/languageservice/services/yamlSchemaService';
import { Connection, RemoteClient } from 'vscode-languageserver/node';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';
import { SchemaSelectionRequests } from '../src/requestTypes';
import { SCHEMA_ID, setupSchemaIDTextDocument } from './utils/testHelper';

const expect = chai.expect;
chai.use(sinonChai);

describe('Schema Selection Handlers', () => {
  const sandbox = sinon.createSandbox();
  const connection: Connection = {} as Connection;
  let service: YAMLSchemaService;
  let requestServiceMock: sinon.SinonSpy;

  beforeEach(() => {
    requestServiceMock = sandbox.fake.resolves(undefined);
    service = new YAMLSchemaService(requestServiceMock);
    connection.client = {} as RemoteClient;
    const onRequest = sandbox.fake();
    connection.onRequest = onRequest;
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('add handler for "getSchema" and "getAllSchemas" requests', () => {
    new JSONSchemaSelection(service, new SettingsState(), connection);
    expect(connection.onRequest).calledWith(SchemaSelectionRequests.getSchema);
    expect(connection.onRequest).calledWith(SchemaSelectionRequests.getAllSchemas);
  });

  it('getAllSchemas should return all schemas', async () => {
    service.registerExternalSchema('https://some.com/some.json', ['foo.yaml'], undefined, 'Schema name', 'Schema description');
    const settings = new SettingsState();
    const testTextDocument = setupSchemaIDTextDocument('');
    settings.documents = new TextDocumentTestManager();
    (settings.documents as TextDocumentTestManager).set(testTextDocument);
    const selection = new JSONSchemaSelection(service, settings, connection);

    const result = await selection.getAllSchemas(testTextDocument.uri);

    expect(result).length(1);
    expect(result[0]).to.be.eqls({
      uri: 'https://some.com/some.json',
      fromStore: true,
      usedForCurrentFile: false,
      name: 'Schema name',
      description: 'Schema description',
      versions: undefined,
    });
  });

  it('getAllSchemas should return all schemas and mark used for current file', async () => {
    service.registerExternalSchema('https://some.com/some.json', [SCHEMA_ID], undefined, 'Schema name', 'Schema description');
    const settings = new SettingsState();
    const testTextDocument = setupSchemaIDTextDocument('');
    settings.documents = new TextDocumentTestManager();
    (settings.documents as TextDocumentTestManager).set(testTextDocument);
    const selection = new JSONSchemaSelection(service, settings, connection);

    const result = await selection.getAllSchemas(testTextDocument.uri);

    expect(result).length(1);
    expect(result[0]).to.be.eqls({
      uri: 'https://some.com/some.json',
      name: 'Schema name',
      description: 'Schema description',
      fromStore: false,
      usedForCurrentFile: true,
      versions: undefined,
    });
  });

  it('getSchemas should return all schemas', async () => {
    service.registerExternalSchema('https://some.com/some.json', [SCHEMA_ID], undefined, 'Schema name', 'Schema description');
    const settings = new SettingsState();
    const testTextDocument = setupSchemaIDTextDocument('');
    settings.documents = new TextDocumentTestManager();
    (settings.documents as TextDocumentTestManager).set(testTextDocument);
    const selection = new JSONSchemaSelection(service, settings, connection);

    const result = await selection.getSchemas(testTextDocument.uri);

    expect(result).length(1);
    expect(result[0]).to.be.eqls({
      uri: 'https://some.com/some.json',
      name: 'Schema name',
      description: 'Schema description',
      versions: undefined,
    });
  });

  it('getSchemas should handle empty schemas', async () => {
    const settings = new SettingsState();
    const testTextDocument = setupSchemaIDTextDocument('');
    settings.documents = new TextDocumentTestManager();
    (settings.documents as TextDocumentTestManager).set(testTextDocument);
    const selection = new JSONSchemaSelection(service, settings, connection);

    const result = await selection.getSchemas(testTextDocument.uri);

    expect(result).length(0);
  });
});
