/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SettingsHandler } from '../src/languageserver/handlers/settingsHandlers';
import * as sinon from 'sinon';
import * as chai from 'chai';
import * as sinonChai from 'sinon-chai';
<<<<<<< HEAD
import { Connection, RemoteWorkspace } from 'vscode-languageserver';
=======
import { Connection } from 'vscode-languageserver';
>>>>>>> 101b734 (feat(prettier): Support doNotIndent and commentSpacesFromContent)
import { SettingsState } from '../src/yamlSettings';
import { ValidationHandler } from '../src/languageserver/handlers/validationHandlers';
import { LanguageService, LanguageSettings, SchemaConfiguration, SchemaPriority } from '../src';
import * as request from 'request-light';
import { setupLanguageService } from './utils/testHelper';
import { Telemetry } from '../src/languageserver/telemetry';
<<<<<<< HEAD
import { TestWorkspace } from './utils/testsTypes';
=======
>>>>>>> 101b734 (feat(prettier): Support doNotIndent and commentSpacesFromContent)

const expect = chai.expect;
chai.use(sinonChai);

describe('Settings Handlers Tests', () => {
  const sandbox = sinon.createSandbox();
<<<<<<< HEAD
  const connection: Connection = {} as Connection;
  let workspaceStub: sinon.SinonStubbedInstance<RemoteWorkspace>;
=======
  let connectionStub: sinon.SinonMockStatic;
>>>>>>> 101b734 (feat(prettier): Support doNotIndent and commentSpacesFromContent)
  let languageService: sinon.SinonMockStatic;
  let settingsState: SettingsState;
  let validationHandler: sinon.SinonMock;
  let xhrStub: sinon.SinonStub;

  beforeEach(() => {
<<<<<<< HEAD
    workspaceStub = sandbox.createStubInstance(TestWorkspace);
    connection.workspace = (workspaceStub as unknown) as RemoteWorkspace;
=======
    connectionStub = sandbox.mock();
>>>>>>> 101b734 (feat(prettier): Support doNotIndent and commentSpacesFromContent)
    languageService = sandbox.mock();
    settingsState = new SettingsState();
    validationHandler = sandbox.mock(ValidationHandler);
    xhrStub = sandbox.stub(request, 'xhr');
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('SettingsHandler should not modify file match patterns', async () => {
    xhrStub.resolves({
      responseText: `{"schemas": [
      {
        "name": ".adonisrc.json",
        "description": "AdonisJS configuration file",
        "fileMatch": [
          ".adonisrc.yaml"
        ],
        "url": "https://raw.githubusercontent.com/adonisjs/application/master/adonisrc.schema.json"
      }]}`,
    });
    const settingsHandler = new SettingsHandler(
<<<<<<< HEAD
      connection,
=======
      (connectionStub as unknown) as Connection,
>>>>>>> 101b734 (feat(prettier): Support doNotIndent and commentSpacesFromContent)
      (languageService as unknown) as LanguageService,
      settingsState,
      (validationHandler as unknown) as ValidationHandler,
      {} as Telemetry
    );

    sandbox.stub(settingsHandler, 'updateConfiguration').returns();

    await settingsHandler.setSchemaStoreSettingsIfNotSet();

    expect(settingsState.schemaStoreSettings).deep.include({
      uri: 'https://raw.githubusercontent.com/adonisjs/application/master/adonisrc.schema.json',
      fileMatch: ['.adonisrc.yaml'],
      priority: SchemaPriority.SchemaStore,
    });
  });

  describe('Test that schema priorities are available', () => {
    const testSchemaFileMatch = ['foo/*.yml'];
    const testSchemaURI = 'file://foo.json';

    function configureSchemaPriorityTest(): LanguageSettings {
      const languageServerSetup = setupLanguageService({});

      const languageService = languageServerSetup.languageService;
      const settingsHandler = new SettingsHandler(
<<<<<<< HEAD
        connection,
=======
        (connectionStub as unknown) as Connection,
>>>>>>> 101b734 (feat(prettier): Support doNotIndent and commentSpacesFromContent)
        languageService,
        settingsState,
        (validationHandler as unknown) as ValidationHandler,
        {} as Telemetry
      );

      const configureSpy = sinon.spy(languageService, 'configure');
      settingsHandler.updateConfiguration();

      // Check things here
      configureSpy.restore();
      return configureSpy.args[0][0];
    }

    it('Schema Settings should have a priority', async () => {
      settingsState.schemaConfigurationSettings = [
        {
          fileMatch: testSchemaFileMatch,
          uri: testSchemaURI,
        },
      ];

      const configureSpy = configureSchemaPriorityTest();

      expect(configureSpy.schemas).deep.include({
        uri: testSchemaURI,
        fileMatch: testSchemaFileMatch,
        schema: undefined,
        priority: SchemaPriority.Settings,
      });
    });

    it('Schema Associations should have a priority when schema association is an array', async () => {
      settingsState.schemaAssociations = [
        {
          fileMatch: testSchemaFileMatch,
          uri: testSchemaURI,
        },
      ] as SchemaConfiguration[];

      const configureSpy = configureSchemaPriorityTest();

      expect(configureSpy.schemas).deep.include({
        uri: testSchemaURI,
        fileMatch: testSchemaFileMatch,
        schema: undefined,
        priority: SchemaPriority.SchemaAssociation,
      });
    });

    it('Schema Associations should have a priority when schema association is a record', async () => {
      settingsState.schemaAssociations = {
        [testSchemaURI]: testSchemaFileMatch,
      } as Record<string, string[]>;

      const configureSpy = configureSchemaPriorityTest();

      expect(configureSpy.schemas).deep.include({
        uri: testSchemaURI,
        fileMatch: testSchemaFileMatch,
        priority: SchemaPriority.SchemaAssociation,
      });
    });
  });
<<<<<<< HEAD

  describe('Settings fetch', () => {
    it('should fetch preferences', async () => {
      const settingsHandler = new SettingsHandler(
        connection,
        (languageService as unknown) as LanguageService,
        settingsState,
        (validationHandler as unknown) as ValidationHandler,
        {} as Telemetry
      );
      workspaceStub.getConfiguration.resolves([{}, {}, {}, {}]);
      const setConfigurationStub = sandbox.stub(settingsHandler, 'setConfiguration');

      await settingsHandler.pullConfiguration();

      expect(workspaceStub.getConfiguration).calledOnceWith([
        { section: 'yaml' },
        { section: 'http.proxy' },
        { section: 'http.proxyStrictSSL' },
        { section: '[yaml]' },
      ]);

      expect(setConfigurationStub).calledOnce;
    });
  });
=======
>>>>>>> 101b734 (feat(prettier): Support doNotIndent and commentSpacesFromContent)
});
