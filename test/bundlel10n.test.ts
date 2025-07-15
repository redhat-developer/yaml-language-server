/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { SettingsState } from '../src/yamlSettings';
import { TestCustomSchemaProvider, testFileSystem } from './utils/testHelper';
import { createConnection, Connection } from 'vscode-languageserver/node';
import { schemaRequestHandler, workspaceContext } from '../src/languageservice/services/schemaRequestHandler';
import { TestTelemetry } from './utils/testsTypes';
import { YAMLServerInit } from '../src/yamlServerInit';
import * as l10n from '@vscode/l10n';
import * as path from 'path';

describe('Bundle l10n Test', () => {
  let serverInit: YAMLServerInit;

  before(() => {
    const yamlSettings = new SettingsState();
    process.argv.push('--node-ipc');
    const connection = createConnection();
    const schemaRequestHandlerWrapper = (connection: Connection, uri: string): Promise<string> => {
      const testSchemaProvider = TestCustomSchemaProvider.instance();
      const testSchema = testSchemaProvider.getContentForSchema(uri);
      if (testSchema) {
        return Promise.resolve(testSchema);
      }
      return schemaRequestHandler(
        connection,
        uri,
        yamlSettings.workspaceFolders,
        yamlSettings.workspaceRoot,
        yamlSettings.useVSCodeContentRequest,
        testFileSystem
      );
    };
    const schemaRequestService = schemaRequestHandlerWrapper.bind(this, connection);
    const telemetry = new TestTelemetry(connection);
    serverInit = new YAMLServerInit(connection, yamlSettings, workspaceContext, schemaRequestService, telemetry);
  });

  after(async () => {
    await serverInit.setupl10nBundle({
      locale: 'en',
      processId: 0,
      rootUri: '',
      capabilities: undefined,
      initializationOptions: {
        l10nPath: path.join(__dirname, '../l10n'),
      },
    });
  });

  describe('l10n bundle test', function () {
    it('check french locale', async () => {
      await serverInit.setupl10nBundle({
        locale: 'fr',
        processId: 0,
        rootUri: '',
        capabilities: undefined,
        initializationOptions: {
          l10nPath: path.join(__dirname, '../l10n'),
        },
      });
      assert.equal(l10n.t('Default Value'), 'Valeur par défaut');
    });

    it('un configured locale should return in english', async () => {
      await serverInit.setupl10nBundle({
        locale: 'pt-br',
        processId: 0,
        rootUri: '',
        capabilities: undefined,
        initializationOptions: {
          l10nPath: path.join(__dirname, '../l10n'),
        },
      });
      assert.equal(l10n.t('Default Value'), 'Default value');
    });
  });
});
