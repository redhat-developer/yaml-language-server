/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as sinon from 'sinon';
import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import { JSONSchemaSelection } from '../src/languageserver/handlers/schemaSelectionHandlers';
import { YAMLSchemaService } from '../src/languageservice/services/yamlSchemaService';
import type { Connection, RemoteClient } from 'vscode-languageserver/node';
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

  it('getSchemas should return an inline $schema', async () => {
    const schemaUri = 'https://some.com/inline.json';
    requestServiceMock = sandbox.fake((uri: string) => {
      if (uri === schemaUri) {
        return Promise.resolve(
          JSON.stringify({
            title: 'Schema name',
            type: 'object',
            properties: {
              $schema: {
                type: 'string',
              },
              firstName: {
                type: 'string',
              },
            },
            required: ['firstName'],
            additionalProperties: false,
          })
        );
      }
      return Promise.reject(`Resource ${uri} not found.`);
    });
    service = new YAMLSchemaService(requestServiceMock);
    const settings = new SettingsState();
    const testTextDocument = setupSchemaIDTextDocument(`firstName: John\n$schema: ${schemaUri}`);
    settings.documents = new TextDocumentTestManager();
    (settings.documents as TextDocumentTestManager).set(testTextDocument);
    const selection = new JSONSchemaSelection(service, settings, connection);

    const result = await selection.getSchemas(testTextDocument.uri);

    expect(result).to.eql([
      {
        uri: schemaUri,
        name: 'Schema name',
        description: undefined,
        versions: undefined,
      },
    ]);
    expect(requestServiceMock).calledOnceWith(schemaUri);
  });

  it('getSchemas should not resolve schema references', async () => {
    requestServiceMock = sandbox.fake((uri: string) => {
      if (uri === 'https://some.com/some.json') {
        return Promise.resolve(
          JSON.stringify({
            title: 'Schema name',
            description: 'Schema description',
            properties: {
              child: {
                $ref: 'https://some.com/ref.json',
              },
            },
          })
        );
      }
      return Promise.reject(`Resource ${uri} not found.`);
    });
    service = new YAMLSchemaService(requestServiceMock);
    service.registerExternalSchema('https://some.com/some.json', [SCHEMA_ID]);
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
    expect(requestServiceMock).calledOnceWith('https://some.com/some.json');
    expect(requestServiceMock).not.calledWith('https://some.com/ref.json');
  });

  it('getSchemas should use registered schema metadata without loading schema content', async () => {
    const versions = {
      '1.0.0': 'https://some.com/some-1.0.0.json',
      '2.0.0': 'https://some.com/some-2.0.0.json',
    };
    service.registerExternalSchema(
      'https://some.com/some.json',
      [SCHEMA_ID],
      undefined,
      'Schema name',
      'Schema description',
      versions
    );
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
      versions,
    });
    expect(requestServiceMock).not.called;
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
