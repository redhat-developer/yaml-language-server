/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as l10n from '@vscode/l10n';
import * as assert from 'assert';
import * as path from 'path';
import { Connection, createConnection } from 'vscode-languageserver/node';
import { schemaRequestHandler, workspaceContext } from '../src/languageservice/services/schemaRequestHandler';
import { setupl10nBundle } from '../src/nodeTranslationSetup';
import { YAMLServerInit } from '../src/yamlServerInit';
import { SettingsState } from '../src/yamlSettings';
import { TestCustomSchemaProvider, testFileSystem } from './utils/testHelper';
import { TestTelemetry } from './utils/testsTypes';

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
        testFileSystem,
        false
      );
    };
    const schemaRequestService = schemaRequestHandlerWrapper.bind(this, connection);
    const telemetry = new TestTelemetry(connection);
    serverInit = new YAMLServerInit(connection, yamlSettings, workspaceContext, schemaRequestService, telemetry, setupl10nBundle);
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
      assert.equal(l10n.t('Default value'), 'Valeur par défaut');
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
      assert.equal(l10n.t('Default value'), 'Default value');
    });
  });
});
