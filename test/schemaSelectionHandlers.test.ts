/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import type { Mock } from 'node:test';
import type { SchemaRequestService } from '../src/languageservice/yamlLanguageService.js';
import { isDeepStrictEqual } from 'node:util';
import assert from 'node:assert/strict';
import * as chai from 'chai';
import { JSONSchemaSelection } from '../src/languageserver/handlers/schemaSelectionHandlers.js';
import { YAMLSchemaService } from '../src/languageservice/services/yamlSchemaService.js';
import type { Connection, RemoteClient } from 'vscode-languageserver/node';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings.js';
import { SchemaSelectionRequests } from '../src/requestTypes.js';
import { SCHEMA_ID, setupSchemaIDTextDocument } from './utils/testHelper.js';

const expect = chai.expect;

describe('Schema Selection Handlers', () => {
  const connection: Connection = {} as Connection;
  let service: YAMLSchemaService;
  let requestServiceMock: Mock<SchemaRequestService>;
  let onRequest: Mock<Connection['onRequest']>;

  beforeEach(() => {
    requestServiceMock = mock.fn(() => Promise.resolve(undefined));
    service = new YAMLSchemaService(requestServiceMock);
    connection.client = {} as RemoteClient;
    onRequest = mock.fn();
    connection.onRequest = onRequest;
  });

  afterEach(() => {
    mock.reset();
  });

  it('add handler for "getSchema" and "getAllSchemas" requests', () => {
    new JSONSchemaSelection(service, new SettingsState(), connection);
    assert.ok(
      onRequest.mock.calls.some((call) => isDeepStrictEqual(call.arguments.slice(0, 1), [SchemaSelectionRequests.getSchema]))
    );
    assert.ok(
      onRequest.mock.calls.some((call) => isDeepStrictEqual(call.arguments.slice(0, 1), [SchemaSelectionRequests.getAllSchemas]))
    );
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
    requestServiceMock = mock.fn((uri: string) => {
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
    assert.equal(requestServiceMock.mock.callCount(), 1);
    assert.deepEqual(requestServiceMock.mock.calls[0].arguments.slice(0, 1), [schemaUri]);
  });

  it('getSchemas should not resolve schema references', async () => {
    requestServiceMock = mock.fn((uri: string) => {
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
    assert.equal(requestServiceMock.mock.callCount(), 1);
    assert.deepEqual(requestServiceMock.mock.calls[0].arguments.slice(0, 1), ['https://some.com/some.json']);
    assert.equal(
      requestServiceMock.mock.calls.some((call) => isDeepStrictEqual(call.arguments.slice(0, 1), ['https://some.com/ref.json'])),
      false
    );
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
    assert.equal(requestServiceMock.mock.callCount(), 0);
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
