/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as chai from 'chai';
import * as request from 'request-light';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import { Connection, RemoteClient, RemoteWorkspace } from 'vscode-languageserver';
import { LanguageService, LanguageSettings, SchemaConfiguration, SchemaPriority } from '../src';
import { SettingsHandler } from '../src/languageserver/handlers/settingsHandlers';
import { ValidationHandler } from '../src/languageserver/handlers/validationHandlers';
import { Telemetry } from '../src/languageservice/telemetry';
import { SettingsState } from '../src/yamlSettings';
import { setupLanguageService } from './utils/testHelper';
import { TestWorkspace } from './utils/testsTypes';

const expect = chai.expect;
chai.use(sinonChai);

describe('Settings Handlers Tests', () => {
  const sandbox = sinon.createSandbox();
  const connection: Connection = {} as Connection;
  let workspaceStub: sinon.SinonStubbedInstance<RemoteWorkspace>;
  let languageService: LanguageService;
  let settingsState: SettingsState;
  let validationHandler: sinon.SinonMock;
  let xhrStub: sinon.SinonStub;

  beforeEach(() => {
    workspaceStub = sandbox.createStubInstance(TestWorkspace);
    connection.workspace = workspaceStub as unknown as RemoteWorkspace;
    connection.onDidChangeConfiguration = sandbox.mock();
    connection.client = {} as RemoteClient;
    connection.client.register = sandbox.mock();
    const languageServerSetup = setupLanguageService({});
    languageService = languageServerSetup.languageService;
    settingsState = new SettingsState();
    validationHandler = sandbox.mock(ValidationHandler);
    xhrStub = sandbox.stub(request, 'xhr');
    const sendRequest = sandbox.fake();
    connection.sendRequest = sendRequest;
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should not register configuration notification handler if client not supports dynamic handlers', () => {
    settingsState.clientDynamicRegisterSupport = false;
    settingsState.hasConfigurationCapability = false;
    const settingsHandler = new SettingsHandler(
      connection,
      languageService as unknown as LanguageService,
      settingsState,
      validationHandler as unknown as ValidationHandler,
      {} as Telemetry
    );

    settingsHandler.registerHandlers();
    expect(connection.client.register).not.called;
  });

  it('should register configuration notification handler only if client supports dynamic handlers', () => {
    settingsState.clientDynamicRegisterSupport = true;
    settingsState.hasConfigurationCapability = true;
    const settingsHandler = new SettingsHandler(
      connection,
      languageService as unknown as LanguageService,
      settingsState,
      validationHandler as unknown as ValidationHandler,
      {} as Telemetry
    );

    settingsHandler.registerHandlers();
    expect(connection.client.register).calledOnce;
  });

  describe('Settings for YAML style should ', () => {
    it(' reflect to the settings ', async () => {
      const settingsHandler = new SettingsHandler(
        connection,
        languageService as unknown as LanguageService,
        settingsState,
        validationHandler as unknown as ValidationHandler,
        {} as Telemetry
      );
      workspaceStub.getConfiguration.resolves([{ style: { flowMapping: 'forbid', flowSequence: 'forbid' } }, {}, {}, {}, {}]);

      await settingsHandler.pullConfiguration();
      expect(settingsState.style).to.exist;
      expect(settingsState.style.flowMapping).to.eqls('forbid');
      expect(settingsState.style.flowSequence).to.eqls('forbid');
    });
    it(' reflect default values if no settings given', async () => {
      const settingsHandler = new SettingsHandler(
        connection,
        languageService as unknown as LanguageService,
        settingsState,
        validationHandler as unknown as ValidationHandler,
        {} as Telemetry
      );
      workspaceStub.getConfiguration.resolves([{}, {}, {}, {}, {}]);

      await settingsHandler.pullConfiguration();
      expect(settingsState.style).to.exist;
      expect(settingsState.style.flowMapping).to.eqls('allow');
      expect(settingsState.style.flowSequence).to.eqls('allow');
    });
  });

  describe('Settings for key ordering should ', () => {
    it(' reflect to the settings ', async () => {
      const settingsHandler = new SettingsHandler(
        connection,
        languageService as unknown as LanguageService,
        settingsState,
        validationHandler as unknown as ValidationHandler,
        {} as Telemetry
      );
      workspaceStub.getConfiguration.resolves([{ keyOrdering: true }, {}, {}, {}, {}]);

      await settingsHandler.pullConfiguration();
      expect(settingsState.keyOrdering).to.exist;
      expect(settingsState.keyOrdering).to.be.true;
    });
    it(' reflect default values if no settings given', async () => {
      const settingsHandler = new SettingsHandler(
        connection,
        languageService as unknown as LanguageService,
        settingsState,
        validationHandler as unknown as ValidationHandler,
        {} as Telemetry
      );
      workspaceStub.getConfiguration.resolves([{}, {}, {}, {}, {}]);

      await settingsHandler.pullConfiguration();
      expect(settingsState.style).to.exist;
      expect(settingsState.keyOrdering).to.be.false;
    });
  });

  describe('Settings for file associations should ', () => {
    it('reflect to settings state', async () => {
      const settingsHandler = new SettingsHandler(
        connection,
        languageService as unknown as LanguageService,
        settingsState,
        validationHandler as unknown as ValidationHandler,
        {} as Telemetry
      );
      workspaceStub.getConfiguration.resolves([{}, {}, {}, {}, { associations: { '*.bu': 'yaml' } }]);

      await settingsHandler.pullConfiguration();
      expect(settingsState.fileExtensions).to.include('*.bu');
      expect(settingsState.fileExtensions).to.include('.yml');
      expect(settingsState.fileExtensions).to.include('.yaml');
    });
    it('SettingsHandler should match patterns from file associations', async () => {
      const languageServerSetup = setupLanguageService({});
      const languageService = languageServerSetup.languageService;
      xhrStub.resolves({
        responseText: `{"schemas": [
        {
          "name": "Butane config schema",
          "description": "Schema to validate butane files for Fedora CoreOS",
          "fileMatch": [
            "*.bu"
          ],
          "url": "https://raw.githubusercontent.com/Relativ-IT/Butane-Schemas/Release/Butane-Schema.json"
        }]}`,
      });
      settingsState.fileExtensions.push('*.bu');
      const settingsHandler = new SettingsHandler(
        connection,
        languageService as unknown as LanguageService,
        settingsState,
        validationHandler as unknown as ValidationHandler,
        {} as Telemetry
      );
      workspaceStub.getConfiguration.resolves([{}, {}, {}, {}]);
      const configureSpy = sinon.stub(languageService, 'configure');
      await settingsHandler.pullConfiguration();
      configureSpy.restore();
      expect(settingsState.schemaStoreSettings).deep.include({
        uri: 'https://raw.githubusercontent.com/Relativ-IT/Butane-Schemas/Release/Butane-Schema.json',
        fileMatch: ['*.bu'],
        priority: SchemaPriority.SchemaStore,
        name: 'Butane config schema',
        description: 'Schema to validate butane files for Fedora CoreOS',
        versions: undefined,
      });
    });
    it('SettingsHandler should not match non-yaml files if there is no file assosication', async () => {
      const languageServerSetup = setupLanguageService({});
      const languageService = languageServerSetup.languageService;
      xhrStub.resolves({
        responseText: `{"schemas": [
        {
          "name": "Butane config schema",
          "description": "Schema to validate butane files for Fedora CoreOS",
          "fileMatch": [
            "*.bu"
          ],
          "url": "https://raw.githubusercontent.com/Relativ-IT/Butane-Schemas/Release/Butane-Schema.json"
        }]}`,
      });
      const settingsHandler = new SettingsHandler(
        connection,
        languageService as unknown as LanguageService,
        settingsState,
        validationHandler as unknown as ValidationHandler,
        {} as Telemetry
      );
      workspaceStub.getConfiguration.resolves([{}, {}, {}, {}]);
      const configureSpy = sinon.stub(languageService, 'configure');
      await settingsHandler.pullConfiguration();
      configureSpy.restore();
      expect(settingsState.schemaStoreSettings).not.deep.include({
        uri: 'https://raw.githubusercontent.com/Relativ-IT/Butane-Schemas/Release/Butane-Schema.json',
        fileMatch: ['*.bu'],
        priority: SchemaPriority.SchemaStore,
        name: 'Butane config schema',
        description: 'Schema to validate butane files for Fedora CoreOS',
        versions: undefined,
      });
    });
  });

  it('SettingsHandler should not modify file match patterns', async () => {
    const languageServerSetup = setupLanguageService({});

    const languageService = languageServerSetup.languageService;

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
      connection,
      languageService as unknown as LanguageService,
      settingsState,
      validationHandler as unknown as ValidationHandler,
      {} as Telemetry
    );
    workspaceStub.getConfiguration.resolves([{}, {}, {}, {}]);
    const configureSpy = sinon.stub(languageService, 'configure');
    await settingsHandler.pullConfiguration();
    configureSpy.restore();
    expect(settingsState.schemaStoreSettings).deep.include({
      uri: 'https://raw.githubusercontent.com/adonisjs/application/master/adonisrc.schema.json',
      fileMatch: ['.adonisrc.yaml'],
      priority: SchemaPriority.SchemaStore,
      name: '.adonisrc.json',
      description: 'AdonisJS configuration file',
      versions: undefined,
    });
  });

  describe('Test that schema priorities are available', async () => {
    const testSchemaFileMatch = ['foo/*.yml'];
    const testSchemaURI = 'file://foo.json';

    async function configureSchemaPriorityTest(): Promise<LanguageSettings> {
      const settingsHandler = new SettingsHandler(
        connection,
        languageService,
        settingsState,
        validationHandler as unknown as ValidationHandler,
        {} as Telemetry
      );
      const configureSpy = sinon.spy(languageService, 'configure');
      await settingsHandler.pullConfiguration();
      configureSpy.restore();
      return configureSpy.args[0][0];
    }

    it('Schema Settings should have a priority', async () => {
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
      const schemas = {};
      schemas[testSchemaURI] = testSchemaFileMatch;
      workspaceStub.getConfiguration.resolves([{ schemas: schemas }, {}, {}, {}]);
      const configureSpy = await configureSchemaPriorityTest();

      expect(configureSpy.schemas).deep.include({
        uri: testSchemaURI,
        fileMatch: testSchemaFileMatch,
        schema: undefined,
        priority: SchemaPriority.Settings,
      });
    });

    it('Schema Associations should have a priority when schema association is an array', async () => {
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
      settingsState.schemaAssociations = [
        {
          fileMatch: testSchemaFileMatch,
          uri: testSchemaURI,
        },
      ] as SchemaConfiguration[];

      workspaceStub.getConfiguration.resolves([{}, {}, {}, {}]);
      const configureSpy = await configureSchemaPriorityTest();

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
      workspaceStub.getConfiguration.resolves([{}, {}, {}, {}]);
      const configureSpy = await configureSchemaPriorityTest();

      expect(configureSpy.schemas).deep.include({
        uri: testSchemaURI,
        fileMatch: testSchemaFileMatch,
        priority: SchemaPriority.SchemaAssociation,
      });
    });
  });

  describe('Settings fetch', () => {
    it('should fetch preferences', async () => {
      const settingsHandler = new SettingsHandler(
        connection,
        languageService as unknown as LanguageService,
        settingsState,
        validationHandler as unknown as ValidationHandler,
        {} as Telemetry
      );
      workspaceStub.getConfiguration.resolves([{}, {}, {}, {}, {}]);

      await settingsHandler.pullConfiguration();

      expect(workspaceStub.getConfiguration).calledOnceWith([
        { section: 'yaml' },
        { section: 'http' },
        { section: '[yaml]' },
        { section: 'editor' },
        { section: 'files' },
      ]);
    });
    it('should set schemaStoreSettings to empty when schemaStore is disabled', async () => {
      const languageServerSetup = setupLanguageService({});

      const languageService = languageServerSetup.languageService;
      settingsState.schemaStoreEnabled = true;
      const settingsHandler = new SettingsHandler(
        connection,
        languageService as unknown as LanguageService,
        settingsState,
        validationHandler as unknown as ValidationHandler,
        {} as Telemetry
      );

      workspaceStub.getConfiguration.resolves([{ schemaStore: { enable: false, url: 'http://shouldnot.activate' } }, {}, {}, {}]);

      // const configureSpy = sinon.spy(languageService, 'configure');
      await settingsHandler.pullConfiguration();
      // configureSpy.restore();
      expect(settingsState.schemaStoreEnabled).to.be.false;
      expect(settingsState.schemaStoreSettings).to.be.empty;
    });
    it('detect indentation settings change', async () => {
      const settingsHandler = new SettingsHandler(
        connection,
        languageService as unknown as LanguageService,
        settingsState,
        validationHandler as unknown as ValidationHandler,
        {} as Telemetry
      );
      workspaceStub.getConfiguration.resolves([{}, {}, {}, { tabSize: 4, detectIndentation: false }]);
      await settingsHandler.pullConfiguration();

      expect(workspaceStub.getConfiguration).calledOnceWith([
        { section: 'yaml' },
        { section: 'http' },
        { section: '[yaml]' },
        { section: 'editor' },
        { section: 'files' },
      ]);
    });
  });
});
