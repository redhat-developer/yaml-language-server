/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import type { Mock } from 'node:test';
import assert from 'node:assert/strict';

import * as chai from 'chai';
import request from 'request-light';
import type { Connection, RemoteClient, RemoteWorkspace } from 'vscode-languageserver';
import { CodeLensRefreshRequest } from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import type { LanguageService, LanguageSettings, SchemaConfiguration } from '../src/index.js';
import { SchemaPriority } from '../src/index.js';
import { SettingsHandler } from '../src/languageserver/handlers/settingsHandlers.js';
import type { ValidationHandler } from '../src/languageserver/handlers/validationHandlers.js';
import { EMPTY_SCHEMA_URL } from '../src/languageservice/utils/schemaUrls.js';
import type { Telemetry } from '../src/languageservice/telemetry.js';
import { SettingsState } from '../src/yamlSettings.js';
import {
  TestCustomSchemaProvider,
  setupLanguageService,
  setupSchemaIDTextDocument,
  setupTextDocument,
} from './utils/testHelper.js';

const expect = chai.expect;

describe('Settings Handlers Tests', () => {
  const connection: Connection = {} as Connection;
  let workspaceStub: { getConfiguration: Mock<RemoteWorkspace['getConfiguration']> };
  let register: Mock<RemoteClient['register']>;
  let languageService: LanguageService;
  let settingsState: SettingsState;
  let validationHandler: Pick<ValidationHandler, 'validate'>;
  let xhrStub: Mock<typeof request.xhr>;

  beforeEach(() => {
    workspaceStub = { getConfiguration: mock.fn() };
    connection.workspace = workspaceStub as unknown as RemoteWorkspace;
    connection.onDidChangeConfiguration = mock.fn();
    connection.client = {} as RemoteClient;
    register = mock.fn();
    connection.client.register = register;
    const languageServerSetup = setupLanguageService({});
    languageService = languageServerSetup.languageService;
    settingsState = new SettingsState();
    validationHandler = { validate: mock.fn() };
    xhrStub = mock.method(request, 'xhr', () => undefined);
    const sendRequest = mock.fn();
    connection.sendRequest = sendRequest;
  });

  afterEach(() => {
    mock.reset();
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
    assert.equal(register.mock.callCount(), 0);
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
    assert.equal(register.mock.callCount(), 1);
  });

  it('should request CodeLens refresh after schema settings update if client supports it', async () => {
    settingsState.hasCodeLensRefreshSupport = true;
    const sendRequest = mock.fn(() => Promise.resolve(undefined));
    connection.sendRequest = sendRequest;
    workspaceStub.getConfiguration.mock.mockImplementationOnce(
      () => Promise.resolve([{ schemaStore: { enable: false } }, {}, {}, {}, {}]),
      0
    );
    workspaceStub.getConfiguration.mock.mockImplementationOnce(
      () =>
        Promise.resolve([
          { schemas: { 'https://example.com/schema.json': 'test.yaml' }, schemaStore: { enable: false } },
          {},
          {},
          {},
          {},
        ]),
      1
    );
    const settingsHandler = new SettingsHandler(
      connection,
      languageService as unknown as LanguageService,
      settingsState,
      validationHandler as unknown as ValidationHandler,
      {} as Telemetry
    );
    await settingsHandler.pullConfiguration();
    await settingsHandler.pullConfiguration();
    assert.equal(sendRequest.mock.callCount(), 1);
    assert.deepEqual(sendRequest.mock.calls[0].arguments, [CodeLensRefreshRequest.type]);
  });

  it('should not request CodeLens refresh when only non-schema settings update', async () => {
    settingsState.hasCodeLensRefreshSupport = true;
    const sendRequest = mock.fn(() => Promise.resolve(undefined));
    connection.sendRequest = sendRequest;
    const yamlSettings = {
      schemas: { 'https://example.com/schema.json': 'test.yaml' },
      schemaStore: { enable: false },
    };
    workspaceStub.getConfiguration.mock.mockImplementationOnce(() => Promise.resolve([yamlSettings, {}, {}, {}, {}]), 0);
    workspaceStub.getConfiguration.mock.mockImplementationOnce(
      () => Promise.resolve([{ ...yamlSettings, keyOrdering: true }, {}, {}, {}, {}]),
      1
    );
    const settingsHandler = new SettingsHandler(
      connection,
      languageService as unknown as LanguageService,
      settingsState,
      validationHandler as unknown as ValidationHandler,
      {} as Telemetry
    );
    await settingsHandler.pullConfiguration();
    await settingsHandler.pullConfiguration();
    assert.equal(sendRequest.mock.callCount(), 0);
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
      workspaceStub.getConfiguration.mock.mockImplementation(() =>
        Promise.resolve([{ style: { flowMapping: 'forbid', flowSequence: 'forbid' } }, {}, {}, {}, {}])
      );

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
      workspaceStub.getConfiguration.mock.mockImplementation(() => Promise.resolve([{}, {}, {}, {}]));

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
      workspaceStub.getConfiguration.mock.mockImplementation(() => Promise.resolve([{ keyOrdering: true }, {}, {}, {}, {}]));

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
      workspaceStub.getConfiguration.mock.mockImplementation(() => Promise.resolve([{}, {}, {}, {}]));

      await settingsHandler.pullConfiguration();
      expect(settingsState.style).to.exist;
      expect(settingsState.keyOrdering).to.be.false;
    });
  });

  describe('Settings for Kubernetes version should ', () => {
    it('accepts versions with or without a v prefix', async () => {
      const settingsHandler = new SettingsHandler(
        connection,
        languageService as unknown as LanguageService,
        settingsState,
        validationHandler as unknown as ValidationHandler,
        {} as Telemetry
      );

      workspaceStub.getConfiguration.mock.mockImplementationOnce(
        () => Promise.resolve([{ kubernetesVersion: '1.36.1' }, {}, {}, {}, {}]),
        0
      );
      workspaceStub.getConfiguration.mock.mockImplementationOnce(
        () => Promise.resolve([{ kubernetesVersion: 'v1.37.2' }, {}, {}, {}, {}]),
        1
      );

      await settingsHandler.pullConfiguration();
      expect(settingsState.kubernetesVersion).to.equal('v1.36.1');

      await settingsHandler.pullConfiguration();
      expect(settingsState.kubernetesVersion).to.equal('v1.37.2');
    });

    it('resolves to undefined for invalid or removed values so the default version is used', async () => {
      const settingsHandler = new SettingsHandler(
        connection,
        languageService as unknown as LanguageService,
        settingsState,
        validationHandler as unknown as ValidationHandler,
        {} as Telemetry
      );
      workspaceStub.getConfiguration.mock.mockImplementationOnce(
        () => Promise.resolve([{ kubernetesVersion: '1.36.1' }, {}, {}, {}, {}]),
        0
      );
      workspaceStub.getConfiguration.mock.mockImplementationOnce(
        () => Promise.resolve([{ kubernetesVersion: 'invalid' }, {}, {}, {}, {}]),
        1
      );
      workspaceStub.getConfiguration.mock.mockImplementationOnce(() => Promise.resolve([{}, {}, {}, {}, {}]), 2);

      await settingsHandler.pullConfiguration();
      expect(settingsState.kubernetesVersion).to.equal('v1.36.1');

      await settingsHandler.pullConfiguration();
      expect(settingsState.kubernetesVersion).to.equal(undefined);

      await settingsHandler.pullConfiguration();
      expect(settingsState.kubernetesVersion).to.equal(undefined);
    });
  });

  describe('SchemaStore file-pattern filtering', () => {
    it('should include patterns with nonstandard extensions', async () => {
      const languageServerSetup = setupLanguageService({});
      const languageService = languageServerSetup.languageService;
      xhrStub.mock.mockImplementation(() =>
        Promise.resolve({
          status: 200,
          headers: {},
          body: undefined,
          responseText: `{"schemas": [
        {
          "name": "Butane config schema",
          "description": "Schema to validate butane files for Fedora CoreOS",
          "fileMatch": [
            "*.bu"
          ],
          "url": "https://raw.githubusercontent.com/Relativ-IT/Butane-Schemas/Release/Butane-Schema.json"
        }]}`,
        })
      );
      const settingsHandler = new SettingsHandler(
        connection,
        languageService as unknown as LanguageService,
        settingsState,
        validationHandler as unknown as ValidationHandler,
        {} as Telemetry
      );
      workspaceStub.getConfiguration.mock.mockImplementation(() => Promise.resolve([{}, {}, {}, {}]));
      const configureSpy = mock.method(languageService, 'configure', () => undefined);
      await settingsHandler.pullConfiguration();
      configureSpy.mock.restore();
      expect(settingsState.schemaStoreSettings).deep.include({
        uri: 'https://raw.githubusercontent.com/Relativ-IT/Butane-Schemas/Release/Butane-Schema.json',
        fileMatch: ['*.bu'],
        priority: SchemaPriority.SchemaStore,
        name: 'Butane config schema',
        description: 'Schema to validate butane files for Fedora CoreOS',
        versions: undefined,
      });
    });
    it('should include extensionless patterns', async () => {
      const languageServerSetup = setupLanguageService({});
      const languageService = languageServerSetup.languageService;
      xhrStub.mock.mockImplementation(() =>
        Promise.resolve({
          status: 200,
          headers: {},
          body: undefined,
          responseText: `{"schemas": [
        {
          "name": "clang-format (.clang-format)",
          "description": "yaml clang-format config",
          "fileMatch": [
            ".clang-format"
          ],
          "url": "https://www.schemastore.org/clang-format-21.x.json"
        }]}`,
        })
      );
      const settingsHandler = new SettingsHandler(
        connection,
        languageService as unknown as LanguageService,
        settingsState,
        validationHandler as unknown as ValidationHandler,
        {} as Telemetry
      );
      workspaceStub.getConfiguration.mock.mockImplementation(() => Promise.resolve([{}, {}, {}, {}]));
      const configureSpy = mock.method(languageService, 'configure', () => undefined);

      await settingsHandler.pullConfiguration();

      configureSpy.mock.restore();
      expect(settingsState.schemaStoreSettings).deep.include({
        uri: 'https://www.schemastore.org/clang-format-21.x.json',
        fileMatch: ['.clang-format'],
        priority: SchemaPriority.SchemaStore,
        name: 'clang-format (.clang-format)',
        description: 'yaml clang-format config',
        versions: undefined,
      });
    });
    it('should exclude JSON file extensions', async () => {
      const languageServerSetup = setupLanguageService({});
      const languageService = languageServerSetup.languageService;
      xhrStub.mock.mockImplementation(() =>
        Promise.resolve({
          status: 200,
          headers: {},
          body: undefined,
          responseText: `{"schemas": [
        {
          "name": "JSON config schema",
          "description": "Schema to validate JSON config files",
          "fileMatch": [
            "*.json",
            "*.jsonc",
            "*.json5"
          ],
          "url": "https://example.com/config.schema.json"
        }]}`,
        })
      );
      const settingsHandler = new SettingsHandler(
        connection,
        languageService as unknown as LanguageService,
        settingsState,
        validationHandler as unknown as ValidationHandler,
        {} as Telemetry
      );
      workspaceStub.getConfiguration.mock.mockImplementation(() => Promise.resolve([{}, {}, {}, {}]));
      const configureSpy = mock.method(languageService, 'configure', () => undefined);
      await settingsHandler.pullConfiguration();
      configureSpy.mock.restore();
      expect(settingsState.schemaStoreSettings.some((schema) => schema.uri === 'https://example.com/config.schema.json')).to.be
        .false;
    });
    it('SettingsHandler should include schemas without file matches as selectable schemas', async () => {
      const languageServerSetup = setupLanguageService({});
      const languageService = languageServerSetup.languageService;
      xhrStub.mock.mockImplementation(() =>
        Promise.resolve({
          status: 200,
          headers: {},
          body: undefined,
          responseText: `{"schemas": [
        {
          "name": "Traefik v3",
          "description": "Traefik v3 YAML configuration file",
          "url": "https://www.schemastore.org/traefik-v3.json"
        }]}`,
        })
      );
      const settingsHandler = new SettingsHandler(
        connection,
        languageService as unknown as LanguageService,
        settingsState,
        validationHandler as unknown as ValidationHandler,
        {} as Telemetry
      );
      workspaceStub.getConfiguration.mock.mockImplementation(() => Promise.resolve([{}, {}, {}, {}]));
      const configureSpy = mock.method(languageService, 'configure', () => undefined);
      await settingsHandler.pullConfiguration();
      configureSpy.mock.restore();
      expect(settingsState.schemaStoreSettings).deep.include({
        uri: 'https://www.schemastore.org/traefik-v3.json',
        fileMatch: [],
        priority: SchemaPriority.SchemaStore,
        name: 'Traefik v3',
        description: 'Traefik v3 YAML configuration file',
        versions: undefined,
      });
    });
  });

  it('SettingsHandler should not modify file match patterns', async () => {
    const languageServerSetup = setupLanguageService({});

    const languageService = languageServerSetup.languageService;

    xhrStub.mock.mockImplementation(() =>
      Promise.resolve({
        status: 200,
        headers: {},
        body: undefined,
        responseText: `{"schemas": [
      {
        "name": ".adonisrc.json",
        "description": "AdonisJS configuration file",
        "fileMatch": [
          ".adonisrc.yaml"
        ],
        "url": "https://raw.githubusercontent.com/adonisjs/application/master/adonisrc.schema.json"
      }]}`,
      })
    );
    const settingsHandler = new SettingsHandler(
      connection,
      languageService as unknown as LanguageService,
      settingsState,
      validationHandler as unknown as ValidationHandler,
      {} as Telemetry
    );
    workspaceStub.getConfiguration.mock.mockImplementation(() => Promise.resolve([{}, {}, {}, {}]));
    const configureSpy = mock.method(languageService, 'configure', () => undefined);
    await settingsHandler.pullConfiguration();
    configureSpy.mock.restore();
    expect(settingsState.schemaStoreSettings).deep.include({
      uri: 'https://raw.githubusercontent.com/adonisjs/application/master/adonisrc.schema.json',
      fileMatch: ['.adonisrc.yaml'],
      priority: SchemaPriority.SchemaStore,
      name: '.adonisrc.json',
      description: 'AdonisJS configuration file',
      versions: undefined,
    });
  });

  describe('Schema URI normalization', () => {
    const testSchemaFileMatch = ['foo/*.yml'];

    async function configureSchemaSettingsTest(): Promise<LanguageSettings> {
      const telemetry = { send: mock.fn(), sendError: mock.fn() } as unknown as Telemetry;
      const settingsHandler = new SettingsHandler(
        connection,
        languageService,
        settingsState,
        validationHandler as unknown as ValidationHandler,
        telemetry
      );
      const configureSpy = mock.method(languageService, 'configure');
      await settingsHandler.pullConfiguration();
      configureSpy.mock.restore();
      return configureSpy.mock.calls[0].arguments[0];
    }

    it('Schema Settings should normalize absolute local paths', async () => {
      xhrStub.mock.mockImplementation(() =>
        Promise.resolve({ status: 200, headers: {}, body: undefined, responseText: '{"schemas":[]}' })
      );
      const absoluteSchemaPath = '/Users/test/schemas/schema.json';
      const schemas = {};
      schemas[absoluteSchemaPath] = testSchemaFileMatch;
      workspaceStub.getConfiguration.mock.mockImplementation(() => Promise.resolve([{ schemas: schemas }, {}, {}, {}]));
      const configureSpy = await configureSchemaSettingsTest();

      expect(configureSpy.schemas).deep.include({
        uri: URI.file(absoluteSchemaPath).toString(),
        fileMatch: testSchemaFileMatch,
        schema: undefined,
        priority: SchemaPriority.Settings,
      });
    });

    it('Schema Settings should preserve fragments when normalizing absolute local paths', async () => {
      xhrStub.mock.mockImplementation(() =>
        Promise.resolve({ status: 200, headers: {}, body: undefined, responseText: '{"schemas":[]}' })
      );
      const absoluteSchemaPath = '/Users/test/schemas/schema.json';
      const schemaUri = `${absoluteSchemaPath}#/definitions/foo`;
      const schemas = {};
      schemas[schemaUri] = testSchemaFileMatch;
      workspaceStub.getConfiguration.mock.mockImplementation(() => Promise.resolve([{ schemas: schemas }, {}, {}, {}]));
      const configureSpy = await configureSchemaSettingsTest();

      expect(configureSpy.schemas).deep.include({
        uri: `${URI.file(absoluteSchemaPath).toString()}#/definitions/foo`,
        fileMatch: testSchemaFileMatch,
        schema: undefined,
        priority: SchemaPriority.Settings,
      });
    });

    it('Schema Settings should preserve remote schema URLs', async () => {
      xhrStub.mock.mockImplementation(() =>
        Promise.resolve({ status: 200, headers: {}, body: undefined, responseText: '{"schemas":[]}' })
      );
      const schemaUri = 'https://example.com/schemas/schema.json#/definitions/foo';
      const schemas = {};
      schemas[schemaUri] = testSchemaFileMatch;
      workspaceStub.getConfiguration.mock.mockImplementation(() => Promise.resolve([{ schemas: schemas }, {}, {}, {}]));
      const configureSpy = await configureSchemaSettingsTest();

      expect(configureSpy.schemas).deep.include({
        uri: schemaUri,
        fileMatch: testSchemaFileMatch,
        schema: undefined,
        priority: SchemaPriority.Settings,
      });
    });

    it('Schema Settings should treat direct Kubernetes standalone-strict/all.json URLs as Kubernetes associations', async () => {
      xhrStub.mock.mockImplementation(() =>
        Promise.resolve({ status: 200, headers: {}, body: undefined, responseText: '{"schemas":[]}' })
      );
      const schemaUri =
        'https://raw.githubusercontent.com/yannh/kubernetes-json-schema/master/v1.32.9-standalone-strict/all.json';
      const schemas = {};
      schemas[schemaUri] = ['*.yaml'];
      workspaceStub.getConfiguration.mock.mockImplementation(() => Promise.resolve([{ schemas }, {}, {}, {}]));
      const configureSpy = await configureSchemaSettingsTest();

      expect(configureSpy.schemas).deep.include({
        uri: schemaUri,
        fileMatch: ['*.yaml'],
        schema: undefined,
        priority: SchemaPriority.Settings,
      });
      expect(settingsState.specificValidatorPaths).deep.include('*.yaml');
    });

    it('Schema Settings should normalize multiple absolute local paths for the same file', async () => {
      xhrStub.mock.mockImplementation(() =>
        Promise.resolve({ status: 200, headers: {}, body: undefined, responseText: '{"schemas":[]}' })
      );
      const schemaPath1 = '/Users/test/schemas/schema1.json';
      const schemaPath2 = '/Users/test/schemas/schema2.json';
      const fileMatch = ['asdf.yaml'];
      const schemas = {};
      schemas[schemaPath1] = fileMatch;
      schemas[schemaPath2] = fileMatch;
      workspaceStub.getConfiguration.mock.mockImplementation(() => Promise.resolve([{ schemas }, {}, {}, {}]));
      const configureSpy = await configureSchemaSettingsTest();

      expect(configureSpy.schemas).deep.include({
        uri: URI.file(schemaPath1).toString(),
        fileMatch,
        schema: undefined,
        priority: SchemaPriority.Settings,
      });
      expect(configureSpy.schemas).deep.include({
        uri: URI.file(schemaPath2).toString(),
        fileMatch,
        schema: undefined,
        priority: SchemaPriority.Settings,
      });
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
      const configureSpy = mock.method(languageService, 'configure');
      await settingsHandler.pullConfiguration();
      configureSpy.mock.restore();
      return configureSpy.mock.calls[0].arguments[0];
    }

    it('Schema Settings should have a priority', async () => {
      xhrStub.mock.mockImplementation(() =>
        Promise.resolve({
          status: 200,
          headers: {},
          body: undefined,
          responseText: `{"schemas": [
      {
        "name": ".adonisrc.json",
        "description": "AdonisJS configuration file",
        "fileMatch": [
          ".adonisrc.yaml"
        ],
        "url": "https://raw.githubusercontent.com/adonisjs/application/master/adonisrc.schema.json"
      }]}`,
        })
      );
      const schemas = {};
      schemas[testSchemaURI] = testSchemaFileMatch;
      workspaceStub.getConfiguration.mock.mockImplementation(() => Promise.resolve([{ schemas: schemas }, {}, {}, {}]));
      const configureSpy = await configureSchemaPriorityTest();

      expect(configureSpy.schemas).deep.include({
        uri: testSchemaURI,
        fileMatch: testSchemaFileMatch,
        schema: undefined,
        priority: SchemaPriority.Settings,
      });
    });

    it('SchemaDetectionDisabled should have a priority', async () => {
      xhrStub.mock.mockImplementation(() =>
        Promise.resolve({
          status: 200,
          headers: {},
          body: undefined,
          responseText: `{"schemas": [
      {
        "name": ".adonisrc.json",
        "description": "AdonisJS configuration file",
        "fileMatch": [
          ".adonisrc.yaml"
        ],
        "url": "https://raw.githubusercontent.com/adonisjs/application/master/adonisrc.schema.json"
      }]}`,
        })
      );
      const disabledSchemaFileMatch = ['foo/*.yml'];
      workspaceStub.getConfiguration.mock.mockImplementation(() =>
        Promise.resolve([{ disableSchemaDetection: disabledSchemaFileMatch }, {}, {}, {}, {}])
      );
      const configureSpy = await configureSchemaPriorityTest();

      expect(configureSpy.schemas).deep.include({
        uri: EMPTY_SCHEMA_URL,
        fileMatch: disabledSchemaFileMatch,
        schema: true,
        priority: SchemaPriority.SchemaDetectionDisabled,
      });
    });

    it('SchemaDetectionDisabled should accept a single file match string', async () => {
      xhrStub.mock.mockImplementation(() =>
        Promise.resolve({
          status: 200,
          headers: {},
          body: undefined,
          responseText: `{"schemas": [
      {
        "name": ".adonisrc.json",
        "description": "AdonisJS configuration file",
        "fileMatch": [
          ".adonisrc.yaml"
        ],
        "url": "https://raw.githubusercontent.com/adonisjs/application/master/adonisrc.schema.json"
      }]}`,
        })
      );
      const disabledSchemaFileMatch = 'foo/*.yml';
      workspaceStub.getConfiguration.mock.mockImplementation(() =>
        Promise.resolve([{ disableSchemaDetection: disabledSchemaFileMatch }, {}, {}, {}, {}])
      );
      const configureSpy = await configureSchemaPriorityTest();

      expect(configureSpy.schemas).deep.include({
        uri: EMPTY_SCHEMA_URL,
        fileMatch: [disabledSchemaFileMatch],
        schema: true,
        priority: SchemaPriority.SchemaDetectionDisabled,
      });
    });

    it('Schema Associations should have a priority when schema association is an array', async () => {
      xhrStub.mock.mockImplementation(() =>
        Promise.resolve({
          status: 200,
          headers: {},
          body: undefined,
          responseText: `{"schemas": [
      {
        "name": ".adonisrc.json",
        "description": "AdonisJS configuration file",
        "fileMatch": [
          ".adonisrc.yaml"
        ],
        "url": "https://raw.githubusercontent.com/adonisjs/application/master/adonisrc.schema.json"
      }]}`,
        })
      );
      settingsState.schemaAssociations = [
        {
          fileMatch: testSchemaFileMatch,
          uri: testSchemaURI,
        },
      ] as SchemaConfiguration[];

      workspaceStub.getConfiguration.mock.mockImplementation(() => Promise.resolve([{}, {}, {}, {}]));
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
      workspaceStub.getConfiguration.mock.mockImplementation(() => Promise.resolve([{}, {}, {}, {}]));
      const configureSpy = await configureSchemaPriorityTest();

      expect(configureSpy.schemas).deep.include({
        uri: testSchemaURI,
        fileMatch: testSchemaFileMatch,
        priority: SchemaPriority.SchemaAssociation,
      });
    });
  });

  describe('Test disableSchemaDetection validation behavior', () => {
    const restrictiveSchema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        allowed: {
          type: 'string',
        },
      },
    };

    it('disableSchemaDetection should suppress yaml.schemas validation', async () => {
      const schemaUri = 'file:///schemas/schema-detection-disable-settings.json';
      const schemaProvider = TestCustomSchemaProvider.instance();
      schemaProvider.addSchemaWithUri('disableSchemaDetection-settings', schemaUri, restrictiveSchema);
      xhrStub.mock.mockImplementation(() =>
        Promise.resolve({ status: 200, headers: {}, body: undefined, responseText: '{"schemas":[]}' })
      );
      const schemas = {};
      schemas[schemaUri] = 'test.yaml';
      workspaceStub.getConfiguration.mock.mockImplementation(() =>
        Promise.resolve([{ disableSchemaDetection: ['test.yaml'], schemas }, {}, {}, {}, {}])
      );

      try {
        await new SettingsHandler(
          connection,
          languageService,
          settingsState,
          validationHandler as unknown as ValidationHandler,
          {} as Telemetry
        ).pullConfiguration();

        const result = await languageService.doValidation(setupTextDocument('foo: bar'), false);

        expect(result).length(0);
      } finally {
        schemaProvider.deleteSchema('disableSchemaDetection-settings');
      }
    });

    it('disableSchemaDetection should suppress SchemaStore validation', async () => {
      const schemaUri = 'file:///schemas/github-workflow.json';
      const githubWorkflowFileMatch = ['.github/workflows/*.yml'];
      const schemaProvider = TestCustomSchemaProvider.instance();
      schemaProvider.addSchemaWithUri('disableSchemaDetection-github-actions', schemaUri, restrictiveSchema);
      xhrStub.mock.mockImplementation(() =>
        Promise.resolve({
          status: 200,
          headers: {},
          body: undefined,
          responseText: JSON.stringify({
            schemas: [
              {
                name: 'GitHub Workflow',
                description: 'GitHub Actions workflow schema',
                fileMatch: githubWorkflowFileMatch,
                url: schemaUri,
              },
            ],
          }),
        })
      );
      workspaceStub.getConfiguration.mock.mockImplementation(() =>
        Promise.resolve([{ disableSchemaDetection: githubWorkflowFileMatch }, {}, {}, {}, {}])
      );

      try {
        await new SettingsHandler(
          connection,
          languageService,
          settingsState,
          validationHandler as unknown as ValidationHandler,
          {} as Telemetry
        ).pullConfiguration();

        const result = await languageService.doValidation(
          setupSchemaIDTextDocument('foo: bar', 'file:///workspace/.github/workflows/build.yml'),
          false
        );

        expect(result).length(0);
      } finally {
        schemaProvider.deleteSchema('disableSchemaDetection-github-actions');
      }
    });

    it('disableSchemaDetection should not suppress modeline validation', async () => {
      const schemaUri = 'file:///schemas/schema-detection-disable-modeline.json';
      const schemaProvider = TestCustomSchemaProvider.instance();
      schemaProvider.addSchemaWithUri('disableSchemaDetection-modeline', schemaUri, restrictiveSchema);
      xhrStub.mock.mockImplementation(() =>
        Promise.resolve({ status: 200, headers: {}, body: undefined, responseText: '{"schemas":[]}' })
      );
      workspaceStub.getConfiguration.mock.mockImplementation(() =>
        Promise.resolve([{ disableSchemaDetection: ['test.yaml'] }, {}, {}, {}, {}])
      );

      try {
        await new SettingsHandler(
          connection,
          languageService,
          settingsState,
          validationHandler as unknown as ValidationHandler,
          {} as Telemetry
        ).pullConfiguration();

        const result = await languageService.doValidation(
          setupTextDocument(`# yaml-language-server: $schema=${schemaUri}\nfoo: bar`),
          false
        );

        expect(result).length(1);
        expect(result[0].message).to.equal('Property foo is not allowed.');
      } finally {
        schemaProvider.deleteSchema('disableSchemaDetection-modeline');
      }
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
      workspaceStub.getConfiguration.mock.mockImplementation(() => Promise.resolve([{}, {}, {}, {}]));

      await settingsHandler.pullConfiguration();

      assert.equal(workspaceStub.getConfiguration.mock.callCount(), 1);
      assert.deepEqual(workspaceStub.getConfiguration.mock.calls[0].arguments.slice(0, 1), [
        [{ section: 'yaml' }, { section: 'http' }, { section: '[yaml]' }, { section: 'editor' }],
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

      workspaceStub.getConfiguration.mock.mockImplementation(() =>
        Promise.resolve([{ schemaStore: { enable: false, url: 'http://shouldnot.activate' } }, {}, {}, {}])
      );

      // const configureSpy = spy(languageService, 'configure');
      await settingsHandler.pullConfiguration();
      // configureSpy.mock.restore();
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
      workspaceStub.getConfiguration.mock.mockImplementation(() =>
        Promise.resolve([{}, {}, {}, { tabSize: 4, detectIndentation: false }])
      );
      await settingsHandler.pullConfiguration();

      assert.equal(workspaceStub.getConfiguration.mock.callCount(), 1);
      assert.deepEqual(workspaceStub.getConfiguration.mock.calls[0].arguments.slice(0, 1), [
        [{ section: 'yaml' }, { section: 'http' }, { section: '[yaml]' }, { section: 'editor' }],
      ]);
    });
  });
});
