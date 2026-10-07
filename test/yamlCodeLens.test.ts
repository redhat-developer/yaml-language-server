/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import type { Mock } from 'node:test';
import assert from 'node:assert/strict';
import * as chai from 'chai';
import { YamlCodeLens } from '../src/languageservice/services/yamlCodeLens.js';
import type { YAMLSchemaService } from '../src/languageservice/services/yamlSchemaService.js';
import { setupTextDocument } from './utils/testHelper.js';
import type { JSONSchema } from '../src/languageservice/jsonSchema.js';
import type { Command } from 'vscode-languageserver-protocol';
import { CodeLens, Range } from 'vscode-languageserver-protocol';
import type { Connection } from 'vscode-languageserver';
import { YamlCommands } from '../src/commands.js';
import type { Telemetry } from '../src/languageservice/telemetry.js';
import { LanguageHandlers } from '../src/languageserver/handlers/languageHandlers.js';
import type { ValidationHandler } from '../src/languageserver/handlers/validationHandlers.js';
import type { LanguageService } from '../src/languageservice/yamlLanguageService.js';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings.js';
import type { SingleYAMLDocument } from '../src/languageservice/parser/yaml-documents.js';

const expect = chai.expect;

describe('YAML CodeLens', () => {
  let yamlSchemaService: { getSchemaForResource: Mock<YAMLSchemaService['getSchemaForResource']> };
  let telemetry: Telemetry;

  beforeEach(() => {
    yamlSchemaService = { getSchemaForResource: mock.fn() };
    telemetry = { send: mock.fn(), sendError: mock.fn(), sendTrack: mock.fn() };
  });

  afterEach(() => {
    mock.reset();
  });

  function createCommand(title: string, command: string, arg: string): Command {
    return {
      title,
      command,
      arguments: [arg],
    };
  }

  function createCodeLens(title: string, command: string, arg: string, line = 0): CodeLens {
    const lens = CodeLens.create(Range.create(line, 0, line, 0));
    lens.command = createCommand(title, command, arg);
    return lens;
  }

  function createResolvedSchema(schema: JSONSchema): Awaited<ReturnType<YAMLSchemaService['getSchemaForResource']>> {
    return { schema } as Awaited<ReturnType<YAMLSchemaService['getSchemaForResource']>>;
  }

  it('should provides CodeLens with jumpToSchema command', async () => {
    const doc = setupTextDocument('foo: bar');
    const schema: JSONSchema = {
      url: 'some://url/to/schema.json',
    };
    yamlSchemaService.getSchemaForResource.mock.mockImplementation(() => Promise.resolve(createResolvedSchema(schema)));
    const codeLens = new YamlCodeLens(yamlSchemaService as unknown as YAMLSchemaService, telemetry);
    const result = await codeLens.getCodeLens(doc);
    expect(result).is.not.empty;
    expect(result[0].command).is.not.undefined;
    expect(result[0].command).is.deep.equal(
      createCommand('schema.json', YamlCommands.JUMP_TO_SCHEMA, 'some://url/to/schema.json')
    );
  });

  it('should place CodeLens at beginning of the file and it has command', async () => {
    const doc = setupTextDocument('foo: bar');
    const schema: JSONSchema = {
      url: 'some://url/to/schema.json',
    };
    yamlSchemaService.getSchemaForResource.mock.mockImplementation(() => Promise.resolve(createResolvedSchema(schema)));
    const codeLens = new YamlCodeLens(yamlSchemaService as unknown as YAMLSchemaService, telemetry);
    const result = await codeLens.getCodeLens(doc);
    expect(result[0].range).is.deep.equal(Range.create(0, 0, 0, 0));
    expect(result[0].command).is.deep.equal(
      createCommand('schema.json', YamlCommands.JUMP_TO_SCHEMA, 'some://url/to/schema.json')
    );
  });

  it('should wait for configuration update before providing CodeLens', async () => {
    const doc = setupTextDocument('foo: bar');
    const expected = createCodeLens('schema.json', YamlCommands.JUMP_TO_SCHEMA, 'some://url/to/schema.json');
    const yamlSettings = new SettingsState();
    yamlSettings.documents = new TextDocumentTestManager();
    (yamlSettings.documents as TextDocumentTestManager).set(doc);

    let resolveConfiguration: () => void = () => undefined;
    yamlSettings.configurationPullPromise = new Promise<void>((resolve) => {
      resolveConfiguration = resolve;
    });

    const getCodeLensStub = mock.fn(() => [expected]);
    const languageService = {
      getCodeLens: getCodeLensStub,
    } as unknown as LanguageService;
    const codeLensHandler = new LanguageHandlers({} as Connection, languageService, yamlSettings, {} as ValidationHandler);

    const response = Promise.resolve(
      codeLensHandler.codeLensHandler({
        textDocument: { uri: doc.uri },
      })
    );
    let settled = false;
    response.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).to.be.false;
    assert.equal(getCodeLensStub.mock.callCount(), 0);

    resolveConfiguration();
    const result = await response;
    assert.equal(getCodeLensStub.mock.callCount(), 1);
    assert.deepEqual(getCodeLensStub.mock.calls[0].arguments, [doc]);
    expect(result).deep.equal([expected]);
  });

  it('should place a CodeLens at the beginning of each document', async () => {
    const doc = setupTextDocument('foo: bar\n---\nfoo: bar');
    const schema: JSONSchema = {
      url: 'some://url/to/schema.json',
    };
    yamlSchemaService.getSchemaForResource.mock.mockImplementation(() => Promise.resolve(createResolvedSchema(schema)));
    const codeLens = new YamlCodeLens(yamlSchemaService as unknown as YAMLSchemaService, telemetry);
    const result = await codeLens.getCodeLens(doc);
    expect(result.length).to.eq(2);
    expect(result[0].range).is.deep.equal(Range.create(0, 0, 0, 0));
    expect(result[1].range).is.deep.equal(Range.create(2, 0, 2, 0));
    expect(result[0].command).is.deep.equal(
      createCommand('schema.json', YamlCommands.JUMP_TO_SCHEMA, 'some://url/to/schema.json')
    );
    expect(result[1].command).is.deep.equal(
      createCommand('schema.json', YamlCommands.JUMP_TO_SCHEMA, 'some://url/to/schema.json')
    );
  });

  it('should place a CodeLens after the separator for a trailing empty document', async () => {
    const doc = setupTextDocument('foo: bar\n---\nfoo: bar\n---\n');
    const schema: JSONSchema = {
      url: 'some://url/to/schema.json',
    };
    yamlSchemaService.getSchemaForResource.mock.mockImplementation(() => Promise.resolve(createResolvedSchema(schema)));

    const codeLens = new YamlCodeLens(yamlSchemaService as unknown as YAMLSchemaService, telemetry);
    const result = await codeLens.getCodeLens(doc);

    expect(result).to.have.length(3);
    expect(result[2].range).to.deep.equal(Range.create(4, 0, 4, 0));
  });

  it('should show document-specific Kubernetes schemas in document order', async () => {
    const doc = setupTextDocument(
      'apiVersion: v1\nkind: Pod\n---\napiVersion: admissionregistration.k8s.io/v1\nkind: MutatingAdmissionPolicy'
    );
    const podSchemaUrl = 'https://example.com/v1.36.1-standalone-strict/_definitions.json#/definitions/io.k8s.api.core.v1.Pod';
    const policySchemaUrl =
      'https://example.com/v1.36.1-standalone-strict/_definitions.json#/definitions/io.k8s.api.admissionregistration.v1.MutatingAdmissionPolicy';
    yamlSchemaService.getSchemaForResource.mock.mockImplementationOnce(
      () => Promise.resolve(createResolvedSchema({ url: podSchemaUrl })),
      0
    );
    yamlSchemaService.getSchemaForResource.mock.mockImplementationOnce(
      () => Promise.resolve(createResolvedSchema({ url: policySchemaUrl })),
      1
    );

    const codeLens = new YamlCodeLens(yamlSchemaService as unknown as YAMLSchemaService, telemetry);
    const result = await codeLens.getCodeLens(doc);

    expect(result).is.deep.equal([
      createCodeLens('Pod (Kubernetes v1.36.1)', YamlCommands.JUMP_TO_SCHEMA, podSchemaUrl),
      createCodeLens('MutatingAdmissionPolicy (Kubernetes v1.36.1)', YamlCommands.JUMP_TO_SCHEMA, policySchemaUrl, 3),
    ]);
    expect((yamlSchemaService.getSchemaForResource.mock.calls[0].arguments[1] as SingleYAMLDocument).currentDocIndex).to.eq(0);
    expect((yamlSchemaService.getSchemaForResource.mock.calls[1].arguments[1] as SingleYAMLDocument).currentDocIndex).to.eq(1);
  });

  it('should show the Kubernetes version for the generic all.json schema', async () => {
    const doc = setupTextDocument('apiVersion: v1\nkind: UnknownCoreResource');
    const schemaUrl = 'https://example.com/v1.36.1-standalone-strict/all.json';
    yamlSchemaService.getSchemaForResource.mock.mockImplementation(() =>
      Promise.resolve(createResolvedSchema({ url: schemaUrl }))
    );
    const codeLens = new YamlCodeLens(yamlSchemaService as unknown as YAMLSchemaService, telemetry);
    const result = await codeLens.getCodeLens(doc);
    expect(result).is.deep.equal([createCodeLens('Kubernetes v1.36.1', YamlCommands.JUMP_TO_SCHEMA, schemaUrl)]);
  });

  it('command name should contains schema title', async () => {
    const doc = setupTextDocument('foo: bar');
    const schema = {
      url: 'some://url/to/schema.json',
      title: 'fooBar',
    } as JSONSchema;
    yamlSchemaService.getSchemaForResource.mock.mockImplementation(() => Promise.resolve(createResolvedSchema(schema)));
    const codeLens = new YamlCodeLens(yamlSchemaService as unknown as YAMLSchemaService, telemetry);
    const result = await codeLens.getCodeLens(doc);
    expect(result[0].command).is.deep.equal(
      createCommand('fooBar (schema.json)', YamlCommands.JUMP_TO_SCHEMA, 'some://url/to/schema.json')
    );
  });

  it('command name should contains schema title and description', async () => {
    const doc = setupTextDocument('foo: bar');
    const schema = {
      url: 'some://url/to/schema.json',
      title: 'fooBar',
      description: 'fooBarDescription',
    } as JSONSchema;
    yamlSchemaService.getSchemaForResource.mock.mockImplementation(() => Promise.resolve(createResolvedSchema(schema)));
    const codeLens = new YamlCodeLens(yamlSchemaService as unknown as YAMLSchemaService, telemetry);
    const result = await codeLens.getCodeLens(doc);
    expect(result[0].command).is.deep.equal(
      createCommand('fooBar - fooBarDescription (schema.json)', YamlCommands.JUMP_TO_SCHEMA, 'some://url/to/schema.json')
    );
  });

  it('should not add a file extension to an extensionless schema URI', async () => {
    const doc = setupTextDocument('foo: bar');
    const schema = {
      url: 'https://json-schema.org/draft/2020-12/schema',
      title: 'JSON Schema Draft 2020-12',
    } as JSONSchema;
    yamlSchemaService.getSchemaForResource.mock.mockImplementation(() => Promise.resolve(createResolvedSchema(schema)));

    const codeLens = new YamlCodeLens(yamlSchemaService as unknown as YAMLSchemaService, telemetry);
    const result = await codeLens.getCodeLens(doc);

    expect(result[0].command).is.deep.equal(
      createCommand(
        'JSON Schema Draft 2020-12 (schema)',
        YamlCommands.JUMP_TO_SCHEMA,
        'https://json-schema.org/draft/2020-12/schema'
      )
    );
  });

  it('should provide lens for oneOf schemas', async () => {
    const doc = setupTextDocument('foo: bar');
    const schema = {
      oneOf: [
        {
          url: 'some://url/schema1.json',
        },
        {
          url: 'some://url/schema2.json',
        },
      ],
    } as JSONSchema;
    yamlSchemaService.getSchemaForResource.mock.mockImplementation(() => Promise.resolve(createResolvedSchema(schema)));
    const codeLens = new YamlCodeLens(yamlSchemaService as unknown as YAMLSchemaService, telemetry);
    const result = await codeLens.getCodeLens(doc);
    expect(result).has.length(2);
    expect(result).is.deep.equal([
      createCodeLens('schema1.json', YamlCommands.JUMP_TO_SCHEMA, 'some://url/schema1.json'),
      createCodeLens('schema2.json', YamlCommands.JUMP_TO_SCHEMA, 'some://url/schema2.json'),
    ]);
  });

  it('should provide lens for allOf schemas', async () => {
    const doc = setupTextDocument('foo: bar');
    const schema = {
      allOf: [
        {
          url: 'some://url/schema1.json',
        },
        {
          url: 'some://url/schema2.json',
        },
      ],
    } as JSONSchema;
    yamlSchemaService.getSchemaForResource.mock.mockImplementation(() => Promise.resolve(createResolvedSchema(schema)));
    const codeLens = new YamlCodeLens(yamlSchemaService as unknown as YAMLSchemaService, telemetry);
    const result = await codeLens.getCodeLens(doc);
    expect(result).has.length(2);
    expect(result).is.deep.equal([
      createCodeLens('schema1.json', YamlCommands.JUMP_TO_SCHEMA, 'some://url/schema1.json'),
      createCodeLens('schema2.json', YamlCommands.JUMP_TO_SCHEMA, 'some://url/schema2.json'),
    ]);
  });

  it('should provide lens for anyOf schemas', async () => {
    const doc = setupTextDocument('foo: bar');
    const schema = {
      anyOf: [
        {
          url: 'some://url/schema1.json',
        },
        {
          url: 'some://url/schema2.json',
        },
      ],
    } as JSONSchema;
    yamlSchemaService.getSchemaForResource.mock.mockImplementation(() => Promise.resolve(createResolvedSchema(schema)));
    const codeLens = new YamlCodeLens(yamlSchemaService as unknown as YAMLSchemaService, telemetry);
    const result = await codeLens.getCodeLens(doc);
    expect(result).has.length(2);
    expect(result).is.deep.equal([
      createCodeLens('schema1.json', YamlCommands.JUMP_TO_SCHEMA, 'some://url/schema1.json'),
      createCodeLens('schema2.json', YamlCommands.JUMP_TO_SCHEMA, 'some://url/schema2.json'),
    ]);
  });
});
