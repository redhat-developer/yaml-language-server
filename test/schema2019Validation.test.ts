/*---------------------------------------------------------------------------------------------
 *  Copyright (c) IBM Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { SCHEMA_ID, TestCustomSchemaProvider, setupLanguageService, setupSchemaIDTextDocument } from './utils/testHelper';
import { ServiceSetup } from './utils/serviceSetup';
import { Diagnostic } from 'vscode-languageserver-types';
import { expect } from 'chai';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';
import { ValidationHandler } from '../src/languageserver/handlers/validationHandlers';
import { KUBERNETES_SCHEMA_URL } from '../src/languageservice/utils/schemaUrls';
import { JSONSchema } from '../src/languageservice/jsonSchema';

describe('Validation Tests', () => {
  let languageSettingsSetup: ServiceSetup;
  let validationHandler: ValidationHandler;
  let yamlSettings: SettingsState;
  let schemaProvider: TestCustomSchemaProvider;

  const toContent = (data: unknown): string => JSON.stringify(data, null, 2);

  before(() => {
    languageSettingsSetup = new ServiceSetup()
      .withValidate()
      .withCompletion()
      .withCustomTags(['!Test', '!Ref sequence'])
      .withSchemaFileMatch({ uri: KUBERNETES_SCHEMA_URL, fileMatch: ['.drone.yml'] })
      .withSchemaFileMatch({ uri: 'https://json.schemastore.org/drone', fileMatch: ['.drone.yml'] })
      .withSchemaFileMatch({ uri: KUBERNETES_SCHEMA_URL, fileMatch: ['test.yml'] })
      .withSchemaFileMatch({
        uri: 'https://raw.githubusercontent.com/composer/composer/master/res/composer-schema.json',
        fileMatch: ['test.yml'],
      });
    const {
      validationHandler: valHandler,
      yamlSettings: settings,
      schemaProvider: testSchemaProvider,
    } = setupLanguageService(languageSettingsSetup.languageSettings);
    validationHandler = valHandler;
    yamlSettings = settings;
    schemaProvider = testSchemaProvider;
  });

  function parseSetup(content: string, customSchemaID?: string): Promise<Diagnostic[]> {
    const testTextDocument = setupSchemaIDTextDocument(content, customSchemaID);
    yamlSettings.documents = new TextDocumentTestManager();
    (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
    return validationHandler.validateTextDocument(testTextDocument);
  }

  afterEach(() => {
    schemaProvider.deleteSchema(SCHEMA_ID);
  });

  describe('$anchor resolution', () => {
    it('resolves $ref "#name" via $anchor in same document', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        $defs: {
          Name: {
            $anchor: 'name',
            type: 'string',
            minLength: 2,
          },
        },
        $ref: '#name',
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = `A`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('String is shorter than the minimum length of 2.');
    });

    it('resolves external $ref to a root $anchor', async () => {
      const rootSchema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        $anchor: 'rootThing',
        type: 'object',
        properties: {
          x: {
            type: 'number',
          },
        },
        required: ['x'],
      };
      const useRootSchema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        $ref: 'file:///root.schema.json#rootThing',
      };
      schemaProvider.addSchemaWithUri(SCHEMA_ID, 'file:///root.schema.json', rootSchema);
      schemaProvider.addSchemaWithUri(SCHEMA_ID, 'file:///use-root.schema.json', useRootSchema);
      const content = `# yaml-language-server: $schema=file:///use-root.schema.json\n{}`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Missing property');
    });

    it('resolves external $ref to $anchor in another schema', async () => {
      const typesSchema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        $defs: {
          Port: {
            $anchor: 'port',
            type: 'integer',
            minimum: 1,
            maximum: 65535,
          },
        },
      };
      const serverSchema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          port: { $ref: 'file:///types.schema.json#port' },
        },
      };
      schemaProvider.addSchemaWithUri(SCHEMA_ID, 'file:///types.schema.json', typesSchema);
      schemaProvider.addSchemaWithUri(SCHEMA_ID, 'file:///server.schema.json', serverSchema);
      const content = `# yaml-language-server: $schema=file:///server.schema.json\nport: 70000`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Value is above the maximum of 65535.');
    });
  });

  describe('keyword: unevaluatedProperties', () => {
    it('unevaluatedProperties as schema validates remaining property values', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          known: { type: 'string' },
        },
        unevaluatedProperties: { type: 'number' },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = `known: ok\nextra: hi`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Incorrect type.');
      expect(result[0].message).to.include('number');
    });

    it('unevaluatedProperties=false sees evaluated props across allOf', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        allOf: [
          { type: 'object', properties: { a: { type: 'string' } } },
          { type: 'object', properties: { b: { type: 'number' } } },
        ],
        unevaluatedProperties: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);

      const content = `a: ok\nb: 1\nc: 2`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property c is not allowed');
    });

    it('unevaluatedProperties sees properties defined across $ref', async () => {
      const baseSchema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          a: { type: 'string' },
        },
      };
      const strictSchema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        allOf: [{ $ref: 'file:///base-uneval.schema.json' }],
        unevaluatedProperties: false,
      };
      schemaProvider.addSchemaWithUri(SCHEMA_ID, 'file:///base-uneval.schema.json', baseSchema);
      schemaProvider.addSchemaWithUri(SCHEMA_ID, 'file:///strict-uneval.schema.json', strictSchema);
      const content = `# yaml-language-server: $schema=file:///strict-uneval.schema.json\na: ok\nc: nope`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property c is not allowed');
    });

    it('unevaluatedProperties true', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        unevaluatedProperties: true,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(toContent({}))).to.be.empty;
      expect(await parseSetup(toContent({ foo: 'foo' }))).to.be.empty;
    });

    it('unevaluatedProperties schema', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        unevaluatedProperties: {
          type: 'string',
          minLength: 3,
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(toContent({}))).to.be.empty;
      expect(await parseSetup(toContent({ foo: 'foo' }))).to.be.empty;
      const result = await parseSetup(toContent({ foo: 'fo' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('String is shorter than the minimum length of 3.');
    });

    it('unevaluatedProperties false', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        unevaluatedProperties: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(toContent({}))).to.be.empty;
      const result = await parseSetup(toContent({ foo: 'foo' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property foo is not allowed.');
    });

    it('unevaluatedProperties with adjacent properties', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          foo: { type: 'string' },
        },
        unevaluatedProperties: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(toContent({ foo: 'foo' }))).to.be.empty;
      const result = await parseSetup(toContent({ foo: 'foo', bar: 'bar' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property bar is not allowed.');
    });

    it('unevaluatedProperties with adjacent patternProperties', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        patternProperties: {
          '^foo': { type: 'string' },
        },
        unevaluatedProperties: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(toContent({ foo: 'foo' }))).to.be.empty;
      const result = await parseSetup(toContent({ foo: 'foo', bar: 'bar' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property bar is not allowed.');
    });

    it('unevaluatedProperties with adjacent additionalProperties', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          foo: { type: 'string' },
        },
        additionalProperties: true,
        unevaluatedProperties: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(toContent({ foo: 'foo' }))).to.be.empty;
      expect(await parseSetup(toContent({ foo: 'foo', bar: 'bar' }))).to.be.empty;
    });

    it('unevaluatedProperties with nested properties', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          foo: { type: 'string' },
        },
        allOf: [
          {
            properties: {
              bar: { type: 'string' },
            },
          },
        ],
        unevaluatedProperties: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(toContent({ foo: 'foo', bar: 'bar' }))).to.be.empty;
      const result = await parseSetup(toContent({ foo: 'foo', bar: 'bar', baz: 'baz' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property baz is not allowed.');
    });

    it('unevaluatedProperties with nested patternProperties', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          foo: { type: 'string' },
        },
        allOf: [
          {
            patternProperties: {
              '^bar': { type: 'string' },
            },
          },
        ],
        unevaluatedProperties: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(toContent({ foo: 'foo', bar: 'bar' }))).to.be.empty;
      const result = await parseSetup(toContent({ foo: 'foo', bar: 'bar', baz: 'baz' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property baz is not allowed.');
    });

    it('unevaluatedProperties with nested additionalProperties', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          foo: { type: 'string' },
        },
        allOf: [
          {
            additionalProperties: true,
          },
        ],
        unevaluatedProperties: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(toContent({ foo: 'foo' }))).to.be.empty;
      expect(await parseSetup(toContent({ foo: 'foo', bar: 'bar' }))).to.be.empty;
    });

    it('unevaluatedProperties with nested unevaluatedProperties', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          foo: { type: 'string' },
        },
        allOf: [
          {
            unevaluatedProperties: true,
          },
        ],
        unevaluatedProperties: {
          type: 'string',
          maxLength: 2,
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(toContent({ foo: 'foo' }))).to.be.empty;
      expect(await parseSetup(toContent({ foo: 'foo', bar: 'bar' }))).to.be.empty;
    });

    it('unevaluatedProperties with anyOf', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          foo: { type: 'string' },
        },
        anyOf: [
          {
            properties: {
              bar: { const: 'bar' },
            },
            required: ['bar'],
          },
          {
            properties: {
              baz: { const: 'baz' },
            },
            required: ['baz'],
          },
          {
            properties: {
              quux: { const: 'quux' },
            },
            required: ['quux'],
          },
        ],
        unevaluatedProperties: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(toContent({ foo: 'foo', bar: 'bar' }))).to.be.empty;
      let result = await parseSetup(toContent({ foo: 'foo', bar: 'bar', baz: 'not-baz' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property baz is not allowed.');
      expect(await parseSetup(toContent({ foo: 'foo', bar: 'bar', baz: 'baz' }))).to.be.empty;
      result = await parseSetup(toContent({ foo: 'foo', bar: 'bar', baz: 'baz', quux: 'not-quux' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property quux is not allowed.');
    });

    it('unevaluatedProperties with oneOf', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          foo: { type: 'string' },
        },
        oneOf: [
          {
            properties: {
              bar: { const: 'bar' },
            },
            required: ['bar'],
          },
          {
            properties: {
              baz: { const: 'baz' },
            },
            required: ['baz'],
          },
        ],
        unevaluatedProperties: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(toContent({ foo: 'foo', bar: 'bar' }))).to.be.empty;
      const result = await parseSetup(toContent({ foo: 'foo', bar: 'bar', quux: 'quux' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property quux is not allowed.');
    });

    it('unevaluatedProperties with not', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          foo: { type: 'string' },
        },
        not: {
          not: {
            properties: {
              bar: { const: 'bar' },
            },
            required: ['bar'],
          },
        },
        unevaluatedProperties: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const result = await parseSetup(toContent({ foo: 'foo', bar: 'bar' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property bar is not allowed.');
    });

    it('unevaluatedProperties with if/then/else', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        if: {
          properties: {
            foo: { const: 'then' },
          },
          required: ['foo'],
        },
        then: {
          properties: {
            bar: { type: 'string' },
          },
          required: ['bar'],
        },
        else: {
          properties: {
            baz: { type: 'string' },
          },
          required: ['baz'],
        },
        unevaluatedProperties: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(toContent({ foo: 'then', bar: 'bar' }))).to.be.empty;
      let result = await parseSetup(toContent({ foo: 'then', bar: 'bar', baz: 'baz' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property baz is not allowed.');
      expect(await parseSetup(toContent({ baz: 'baz' }))).to.be.empty;
      result = await parseSetup(toContent({ foo: 'else', baz: 'baz' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property foo is not allowed.');
    });

    it('unevaluatedProperties with if/then/else, then not defined', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        if: {
          properties: {
            foo: { const: 'then' },
          },
          required: ['foo'],
        },
        else: {
          properties: {
            baz: { type: 'string' },
          },
          required: ['baz'],
        },
        unevaluatedProperties: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(toContent({ foo: 'then' }))).to.be.empty;
      let result = await parseSetup(toContent({ foo: 'then', bar: 'bar' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property bar is not allowed.');
      expect(await parseSetup(toContent({ baz: 'baz' }))).to.be.empty;
      result = await parseSetup(toContent({ foo: 'else', baz: 'baz' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property foo is not allowed.');
    });

    it('unevaluatedProperties with if/then/else, else not defined', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        if: {
          properties: {
            foo: { const: 'then' },
          },
          required: ['foo'],
        },
        then: {
          properties: {
            bar: { type: 'string' },
          },
          required: ['bar'],
        },
        unevaluatedProperties: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(toContent({ foo: 'then', bar: 'bar' }))).to.be.empty;
      let result = await parseSetup(toContent({ foo: 'then', bar: 'bar', baz: 'baz' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property baz is not allowed.');
      result = await parseSetup(toContent({ baz: 'baz' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property baz is not allowed.');
      result = await parseSetup(toContent({ foo: 'else', baz: 'baz' }));
      expect(result).to.have.length(2);
      const messages = result.map((entry) => entry.message).join(' | ');
      expect(messages).to.include('Property foo is not allowed.');
      expect(messages).to.include('Property baz is not allowed.');
    });

    it('unevaluatedProperties with dependentSchemas', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          foo: { type: 'string' },
        },
        dependentSchemas: {
          foo: {
            properties: {
              bar: { const: 'bar' },
            },
            required: ['bar'],
          },
        },
        unevaluatedProperties: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(toContent({ foo: 'foo', bar: 'bar' }))).to.be.empty;
      const result = await parseSetup(toContent({ bar: 'bar' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property bar is not allowed.');
    });

    it('unevaluatedProperties with boolean schemas', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          foo: { type: 'string' },
        },
        allOf: [true],
        unevaluatedProperties: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(toContent({ foo: 'foo' }))).to.be.empty;
      const result = await parseSetup(toContent({ bar: 'bar' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property bar is not allowed.');
    });

    it('unevaluatedProperties with $ref', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        $ref: '#/$defs/bar',
        properties: {
          foo: { type: 'string' },
        },
        unevaluatedProperties: false,
        $defs: {
          bar: {
            properties: {
              bar: { type: 'string' },
            },
          },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(toContent({ foo: 'foo', bar: 'bar' }))).to.be.empty;
      const result = await parseSetup(toContent({ foo: 'foo', bar: 'bar', baz: 'baz' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property baz is not allowed.');
    });

    it('unevaluatedProperties before $ref', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        unevaluatedProperties: false,
        properties: {
          foo: { type: 'string' },
        },
        $ref: '#/$defs/bar',
        $defs: {
          bar: {
            properties: {
              bar: { type: 'string' },
            },
          },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(toContent({ foo: 'foo', bar: 'bar' }))).to.be.empty;
      const result = await parseSetup(toContent({ foo: 'foo', bar: 'bar', baz: 'baz' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property baz is not allowed.');
    });

    it('unevaluatedProperties with $recursiveRef', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        $id: 'https://example.com/unevaluated-properties-with-recursive-ref/extended-tree',
        $recursiveAnchor: true,
        $ref: './tree',
        properties: {
          name: { type: 'string' },
        },
        $defs: {
          tree: {
            $id: './tree',
            $recursiveAnchor: true,
            type: 'object',
            properties: {
              node: true,
              branches: {
                $comment:
                  "unevaluatedProperties comes first so it's more likely to bugs errors with implementations that are sensitive to keyword ordering",
                unevaluatedProperties: false,
                $recursiveRef: '#',
              },
            },
            required: ['node'],
          },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(
        await parseSetup(
          toContent({
            name: 'a',
            node: 1,
            branches: {
              name: 'b',
              node: 2,
            },
          })
        )
      ).to.be.empty;
      const result = await parseSetup(
        toContent({
          name: 'a',
          node: 1,
          branches: {
            foo: 'b',
            node: 2,
          },
        })
      );
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property foo is not allowed.');
    });

    it("unevaluatedProperties can't see inside cousins", async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        allOf: [
          {
            properties: {
              foo: true,
            },
          },
          {
            unevaluatedProperties: false,
          },
        ],
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const result = await parseSetup(toContent({ foo: 1 }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property foo is not allowed.');
    });

    it("unevaluatedProperties can't see inside cousins (reverse order)", async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        allOf: [
          {
            unevaluatedProperties: false,
          },
          {
            properties: {
              foo: true,
            },
          },
        ],
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const result = await parseSetup(toContent({ foo: 1 }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property foo is not allowed.');
    });

    it('nested unevaluatedProperties, outer false, inner true, properties outside', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          foo: { type: 'string' },
        },
        allOf: [
          {
            unevaluatedProperties: true,
          },
        ],
        unevaluatedProperties: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(toContent({ foo: 'foo' }))).to.be.empty;
      expect(await parseSetup(toContent({ foo: 'foo', bar: 'bar' }))).to.be.empty;
    });

    it('nested unevaluatedProperties, outer false, inner true, properties inside', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        allOf: [
          {
            properties: {
              foo: { type: 'string' },
            },
            unevaluatedProperties: true,
          },
        ],
        unevaluatedProperties: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);

      expect(await parseSetup(toContent({ foo: 'foo' }))).to.be.empty;
      expect(await parseSetup(toContent({ foo: 'foo', bar: 'bar' }))).to.be.empty;
    });

    it('nested unevaluatedProperties, outer true, inner false, properties outside', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          foo: { type: 'string' },
        },
        allOf: [
          {
            unevaluatedProperties: false,
          },
        ],
        unevaluatedProperties: true,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);

      const result1 = await parseSetup(toContent({ foo: 'foo' }));
      expect(result1).to.have.length(1);
      expect(result1[0].message).to.include('Property foo is not allowed.');

      const result2 = await parseSetup(toContent({ foo: 'foo', bar: 'bar' }));
      expect(result2).to.have.length(2);
      const messages = result2.map((entry) => entry.message).join(' | ');
      expect(messages).to.include('Property foo is not allowed.');
      expect(messages).to.include('Property bar is not allowed.');
    });

    it('nested unevaluatedProperties, outer true, inner false, properties inside', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        allOf: [
          {
            properties: {
              foo: { type: 'string' },
            },
            unevaluatedProperties: false,
          },
        ],
        unevaluatedProperties: true,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);

      expect(await parseSetup(toContent({ foo: 'foo' }))).to.be.empty;

      const result = await parseSetup(toContent({ foo: 'foo', bar: 'bar' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property bar is not allowed.');
    });

    it('cousin unevaluatedProperties, true and false, true with properties', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        allOf: [
          {
            properties: {
              foo: { type: 'string' },
            },
            unevaluatedProperties: true,
          },
          {
            unevaluatedProperties: false,
          },
        ],
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);

      const result1 = await parseSetup(toContent({ foo: 'foo' }));
      expect(result1).to.have.length(1);
      expect(result1[0].message).to.include('Property foo is not allowed.');

      const result2 = await parseSetup(toContent({ foo: 'foo', bar: 'bar' }));
      expect(result2).to.have.length(2);
      const messages = result2.map((entry) => entry.message).join(' | ');
      expect(messages).to.include('Property foo is not allowed.');
      expect(messages).to.include('Property bar is not allowed.');
    });

    it('cousin unevaluatedProperties, true and false, false with properties', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        allOf: [
          {
            unevaluatedProperties: true,
          },
          {
            properties: {
              foo: { type: 'string' },
            },
            unevaluatedProperties: false,
          },
        ],
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(toContent({ foo: 'foo' }))).to.be.empty;

      const result = await parseSetup(toContent({ foo: 'foo', bar: 'bar' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property bar is not allowed.');
    });

    it('property is evaluated in an uncle schema to unevaluatedProperties', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          foo: {
            type: 'object',
            properties: {
              bar: {
                type: 'string',
              },
            },
            unevaluatedProperties: false,
          },
        },
        anyOf: [
          {
            properties: {
              foo: {
                properties: {
                  faz: {
                    type: 'string',
                  },
                },
              },
            },
          },
        ],
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(toContent({ foo: { bar: 'test' } }))).to.be.empty;

      const result = await parseSetup(toContent({ foo: { bar: 'test', faz: 'test' } }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property faz is not allowed.');
    });

    describe('in-place applicator siblings, allOf has unevaluated', () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        allOf: [
          {
            properties: {
              foo: true,
            },
            unevaluatedProperties: false,
          },
        ],
        anyOf: [
          {
            properties: {
              bar: true,
            },
          },
        ],
      };

      beforeEach(() => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
      });

      it('base case: both properties present', async () => {
        const result = await parseSetup(toContent({ foo: 1, bar: 1 }));
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Property bar is not allowed.');
      });

      it('in place applicator siblings, bar is missing', async () => {
        expect(await parseSetup(toContent({ foo: 1 }))).to.be.empty;
      });

      it('in place applicator siblings, foo is missing', async () => {
        const result = await parseSetup(toContent({ bar: 1 }));
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Property bar is not allowed.');
      });
    });

    describe('in-place applicator siblings, anyOf has unevaluated', () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        allOf: [
          {
            properties: {
              foo: true,
            },
          },
        ],
        anyOf: [
          {
            properties: {
              bar: true,
            },
            unevaluatedProperties: false,
          },
        ],
      };

      beforeEach(() => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
      });

      it('base case: both properties present', async () => {
        const result = await parseSetup(toContent({ foo: 1, bar: 1 }));
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Property foo is not allowed.');
      });

      it('in place applicator siblings, bar is missing', async () => {
        const result = await parseSetup(toContent({ foo: 1 }));
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Property foo is not allowed.');
      });

      it('in place applicator siblings, foo is missing', async () => {
        expect(await parseSetup(toContent({ bar: 1 }))).to.be.empty;
      });
    });

    describe('unevaluatedProperties + single cyclic ref', () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          x: { $ref: '#' },
        },
        unevaluatedProperties: false,
      };

      beforeEach(() => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
      });

      it('Empty is valid', async () => {
        expect(await parseSetup(toContent({}))).to.be.empty;
      });

      it('Single is valid', async () => {
        expect(await parseSetup(toContent({ x: {} }))).to.be.empty;
      });

      it('Unevaluated on 1st level is invalid', async () => {
        const result = await parseSetup(toContent({ x: {}, y: {} }));
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Property y is not allowed.');
      });

      it('Nested is valid', async () => {
        expect(await parseSetup(toContent({ x: { x: {} } }))).to.be.empty;
      });

      it('Unevaluated on 2nd level is invalid', async () => {
        const result = await parseSetup(toContent({ x: { x: {}, y: {} } }));
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Property y is not allowed.');
      });

      it('Deep nested is valid', async () => {
        expect(await parseSetup(toContent({ x: { x: { x: {} } } }))).to.be.empty;
      });

      it('Unevaluated on 3rd level is invalid', async () => {
        const result = await parseSetup(toContent({ x: { x: { x: {}, y: {} } } }));
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Property y is not allowed.');
      });
    });

    describe('unevaluatedProperties + ref inside allOf / oneOf', () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        $defs: {
          one: {
            properties: { a: true },
          },
          two: {
            required: ['x'],
            properties: { x: true },
          },
        },
        allOf: [
          { $ref: '#/$defs/one' },
          { properties: { b: true } },
          {
            oneOf: [
              { $ref: '#/$defs/two' },
              {
                required: ['y'],
                properties: { y: true },
              },
            ],
          },
        ],
        unevaluatedProperties: false,
      };

      beforeEach(() => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
      });

      it('Empty is invalid (no x or y)', async () => {
        const result = await parseSetup(toContent({}));
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Missing property');
        expect(result[0].message).to.include('x');
      });

      it('a and b are invalid (no x or y)', async () => {
        const result = await parseSetup(toContent({ a: 1, b: 1 }));
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Missing property');
        expect(result[0].message).to.include('x');
      });

      it('x and y are invalid', async () => {
        const result = await parseSetup(toContent({ x: 1, y: 1 }));
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Matches multiple schemas when only one must validate.');
      });

      it('a and x are valid', async () => {
        expect(await parseSetup(toContent({ a: 1, x: 1 }))).to.be.empty;
      });

      it('a and y are valid', async () => {
        expect(await parseSetup(toContent({ a: 1, y: 1 }))).to.be.empty;
      });

      it('a and b and x are valid', async () => {
        expect(await parseSetup(toContent({ a: 1, b: 1, x: 1 }))).to.be.empty;
      });

      it('a and b and y are valid', async () => {
        expect(await parseSetup(toContent({ a: 1, b: 1, y: 1 }))).to.be.empty;
      });

      it('a and b and x and y are invalid', async () => {
        const result = await parseSetup(toContent({ a: 1, b: 1, x: 1, y: 1 }));
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Matches multiple schemas when only one must validate.');
      });
    });

    describe('dynamic evalation inside nested refs', () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        $defs: {
          one: {
            oneOf: [
              { $ref: '#/$defs/two' },
              { required: ['b'], properties: { b: true } },
              { required: ['xx'], patternProperties: { x: true } },
              { required: ['all'], unevaluatedProperties: true },
            ],
          },
          two: {
            oneOf: [
              { required: ['c'], properties: { c: true } },
              { required: ['d'], properties: { d: true } },
            ],
          },
        },
        oneOf: [{ $ref: '#/$defs/one' }, { required: ['a'], properties: { a: true } }],
        unevaluatedProperties: false,
      };
      beforeEach(() => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
      });

      it('Empty is invalid', async () => {
        const result = await parseSetup(toContent({}));
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Missing property');
      });

      it('a is valid', async () => {
        expect(await parseSetup(toContent({ a: 1 }))).to.be.empty;
      });

      it('b is valid', async () => {
        expect(await parseSetup(toContent({ b: 1 }))).to.be.empty;
      });

      it('c is valid', async () => {
        expect(await parseSetup(toContent({ c: 1 }))).to.be.empty;
      });

      it('d is valid', async () => {
        expect(await parseSetup(toContent({ d: 1 }))).to.be.empty;
      });

      it('a + b is invalid', async () => {
        const result = await parseSetup(toContent({ a: 1, b: 1 }));
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Matches multiple schemas when only one must validate.');
      });

      it('a + c is invalid', async () => {
        const result = await parseSetup(toContent({ a: 1, c: 1 }));
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Matches multiple schemas when only one must validate.');
      });

      it('a + d is invalid', async () => {
        const result = await parseSetup(toContent({ a: 1, d: 1 }));
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Matches multiple schemas when only one must validate.');
      });

      it('b + c is invalid', async () => {
        const result = await parseSetup(toContent({ b: 1, c: 1 }));
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Matches multiple schemas when only one must validate.');
      });

      it('b + d is invalid', async () => {
        const result = await parseSetup(toContent({ b: 1, d: 1 }));
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Matches multiple schemas when only one must validate.');
      });

      it('c + d is invalid', async () => {
        const result = await parseSetup(toContent({ c: 1, d: 1 }));
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Matches multiple schemas when only one must validate.');
      });

      it('xx is valid', async () => {
        expect(await parseSetup(toContent({ xx: 1 }))).to.be.empty;
      });

      it('xx + foox is valid', async () => {
        expect(await parseSetup(toContent({ xx: 1, foox: 1 }))).to.be.empty;
      });

      it('xx + foo is invalid', async () => {
        const result = await parseSetup(toContent({ xx: 1, foo: 1 }));
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Property foo is not allowed.');
      });

      it('xx + a is invalid', async () => {
        const result = await parseSetup(toContent({ xx: 1, a: 1 }));
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Matches multiple schemas when only one must validate.');
      });

      it('xx + b is invalid', async () => {
        const result = await parseSetup(toContent({ xx: 1, b: 1 }));
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Matches multiple schemas when only one must validate.');
      });

      it('xx + c is invalid', async () => {
        const result = await parseSetup(toContent({ xx: 1, c: 1 }));
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Matches multiple schemas when only one must validate.');
      });

      it('xx + d is invalid', async () => {
        const result = await parseSetup(toContent({ xx: 1, d: 1 }));
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Matches multiple schemas when only one must validate.');
      });

      it('all is valid', async () => {
        expect(await parseSetup(toContent({ all: 1 }))).to.be.empty;
      });

      it('all + foo is valid', async () => {
        expect(await parseSetup(toContent({ all: 1, foo: 1 }))).to.be.empty;
      });

      it('all + a is invalid', async () => {
        const result = await parseSetup(toContent({ all: 1, a: 1 }));
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Matches multiple schemas when only one must validate.');
      });
    });

    it('non-object instances are valid', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        unevaluatedProperties: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);

      expect(await parseSetup(toContent(true))).to.be.empty;
      expect(await parseSetup(toContent(123))).to.be.empty;
      expect(await parseSetup(toContent(1.0))).to.be.empty;
      expect(await parseSetup(toContent([]))).to.be.empty;
      expect(await parseSetup(toContent('foo'))).to.be.empty;
      expect(await parseSetup(toContent(null))).to.be.empty;
    });

    it('unevaluatedProperties with null valued instance properties', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        unevaluatedProperties: {
          type: 'null',
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(toContent({ foo: null }))).to.be.empty;
    });

    it('unevaluatedProperties not affected by propertyNames', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        propertyNames: { maxLength: 1 },
        unevaluatedProperties: {
          type: 'number',
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);

      expect(await parseSetup(toContent({ a: 1 }))).to.be.empty;

      const result = await parseSetup(toContent({ a: 'b' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Incorrect type');
      expect(result[0].message).to.include('number');
    });

    it('unevaluatedProperties can see annotations from if without then and else', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        if: {
          patternProperties: {
            foo: {
              type: 'string',
            },
          },
        },
        unevaluatedProperties: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(toContent({ foo: 'a' }))).to.be.empty;

      const result = await parseSetup(toContent({ bar: 'a' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property bar is not allowed.');
    });

    it('dependentSchemas with unevaluatedProperties', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        properties: { foo2: {} },
        dependentSchemas: {
          foo: {},
          foo2: {
            properties: {
              bar: {},
            },
          },
        },
        unevaluatedProperties: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const result1 = await parseSetup(toContent({ foo: '' }));
      expect(result1).to.have.length(1);
      expect(result1[0].message).to.include('Property foo is not allowed.');

      const result2 = await parseSetup(toContent({ bar: '' }));
      expect(result2).to.have.length(1);
      expect(result2[0].message).to.include('Property bar is not allowed.');

      expect(await parseSetup(toContent({ foo2: '', bar: '' }))).to.be.empty;
    });

    it('Evaluated properties collection needs to consider instance location', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        properties: {
          foo: {
            properties: {
              bar: { type: 'string' },
            },
          },
        },
        unevaluatedProperties: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const result = await parseSetup(toContent({ foo: { bar: 'foo' }, bar: 'bar' }));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Property bar is not allowed.');
    });
  });

  describe('keyword: unevaluatedItems', () => {
    it('unevaluatedItems true', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        unevaluatedItems: true,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(`[]`)).to.be.empty;
      expect(await parseSetup(`- foo`)).to.be.empty;
    });

    it('unevaluatedItems false', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        unevaluatedItems: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(`[]`)).to.be.empty;

      const content = `- foo`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too many items according to schema. Expected 0 or fewer.');
    });

    it('unevaluatedItems as schema', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        unevaluatedItems: { type: 'string' },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(`[]`)).to.be.empty;

      expect(await parseSetup(`- foo`)).to.be.empty;

      const result = await parseSetup(`- 42`);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Incorrect type. Expected');
      expect(result[0].message).to.include('string');
    });

    it('unevaluatedItems with uniform items', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        items: { type: 'string' },
        unevaluatedItems: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = `- foo\n- bar`;
      const result = await parseSetup(content);
      expect(result).to.be.empty;
    });

    it('unevaluatedItems with tuple', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        items: [{ type: 'string' }],
        unevaluatedItems: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(`- foo`)).to.be.empty;

      const content = `- foo\n- bar`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too many items according to schema. Expected 1 or fewer.');
    });

    it('unevaluatedItems with items and additionalItems', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        items: [{ type: 'string' }],
        additionalItems: true,
        unevaluatedItems: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = `- foo\n- 42`;
      const result = await parseSetup(content);
      expect(result).to.be.empty;
    });

    it('unevaluatedItems with ignored additionalItems', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        additionalItems: { type: 'number' },
        unevaluatedItems: { type: 'string' },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = `- foo\n- 1`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Incorrect type. Expected');
      expect(result[0].message).to.include('string');

      expect(await parseSetup(`- foo\n- bar\n- baz`)).to.be.empty;
    });

    it('unevaluatedItems with ignored applicator additionalItems', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        allOf: [{ additionalItems: { type: 'number' } }],
        unevaluatedItems: { type: 'string' },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = `- foo\n- 1`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Incorrect type. Expected');
      expect(result[0].message).to.include('string');

      expect(await parseSetup(`- foo\n- bar\n- baz`)).to.be.empty;
    });

    it('unevaluatedItems with nested tuple', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        items: [{ type: 'string' }],
        allOf: [
          {
            items: [true, { type: 'number' }],
          },
        ],
        unevaluatedItems: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(`- foo\n- 42`)).to.be.empty;

      const content = `- foo\n- 42\n- true`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too many items according to schema. Expected 2 or fewer.');
    });

    it('unevaluatedItems with nested items', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        unevaluatedItems: { type: 'boolean' },
        anyOf: [{ items: { type: 'string' } }, true],
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content1 = `- true\n- false`;
      const result1 = await parseSetup(content1);
      expect(result1).to.be.empty;

      const content2 = `- "yes"\n- false`;
      const result2 = await parseSetup(content2);
      expect(result2).to.have.length(1);
      expect(result2[0].message).to.include('Incorrect type.');

      const content3 = `- "yes"\n- "no"`;
      const result3 = await parseSetup(content3);
      expect(result3).to.be.empty;
    });

    it('unevaluatedItems with nested items and additionalItems', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        allOf: [
          {
            items: [{ type: 'string' }],
            additionalItems: true,
          },
        ],
        unevaluatedItems: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(`- foo`)).to.be.empty;
      expect(await parseSetup(`- foo\n- 42\n- true`)).to.be.empty;
    });

    it('unevaluatedItems with nested unevaluatedItems', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        allOf: [
          {
            items: [{ type: 'string' }],
          },
          { unevaluatedItems: true },
        ],
        unevaluatedItems: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(`- foo`)).to.be.empty;

      const content = `- foo\n- 42\n- true`;
      const result = await parseSetup(content);
      expect(result).to.be.empty;
    });

    it('unevaluatedItems with anyOf', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        items: [{ const: 'foo' }],
        anyOf: [
          {
            items: [true, { const: 'bar' }],
          },
          {
            items: [true, true, { const: 'baz' }],
          },
        ],
        unevaluatedItems: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content1 = `- foo\n- bar`;
      const result1 = await parseSetup(content1);
      expect(result1).to.be.empty;

      const content2 = `- foo\n- bar\n- 42`;
      const result2 = await parseSetup(content2);
      expect(result2).to.have.length(1);
      expect(result2[0].message).to.include('Array has too many items according to schema. Expected 2 or fewer.');

      const content3 = `- foo\n- bar\n- baz`;
      const result3 = await parseSetup(content3);
      expect(result3).to.be.empty;

      const content4 = `- foo\n- bar\n- baz\n- 42`;
      const result4 = await parseSetup(content4);
      expect(result4).to.have.length(1);
      expect(result4[0].message).to.include('Array has too many items according to schema. Expected 3 or fewer.');
    });

    it('unevaluatedItems with oneOf', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        items: [{ const: 'foo' }],
        oneOf: [
          {
            items: [true, { const: 'bar' }],
          },
          {
            items: [true, { const: 'baz' }],
          },
        ],
        unevaluatedItems: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(`- foo\n- bar`)).to.be.empty;

      const content = `- foo\n- bar\n- 42`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too many items according to schema. Expected 2 or fewer.');
    });

    it('unevaluatedItems with not', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        items: [{ const: 'foo' }],
        not: {
          not: {
            items: [true, { const: 'bar' }],
          },
        },
        unevaluatedItems: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = `- foo\n- bar`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too many items according to schema. Expected 1 or fewer.');
    });

    it('unevaluatedItems with if/then/else', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        items: [{ const: 'foo' }],
        if: {
          items: [true, { const: 'bar' }],
        },
        then: {
          items: [true, true, { const: 'then' }],
        },
        else: {
          items: [true, true, true, { const: 'else' }],
        },
        unevaluatedItems: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const result1 = await parseSetup(`- foo\n- bar\n- then`);
      expect(result1).to.be.empty;

      const result2 = await parseSetup(`- foo\n- bar\n- then\n- else`);
      expect(result2).to.have.length(1);
      expect(result2[0].message).to.include('Array has too many items according to schema. Expected 3 or fewer.');

      const result3 = await parseSetup(`- foo\n- 42\n- 42\n- else`);
      expect(result3).to.be.empty;

      const result = await parseSetup(`- foo\n- 42\n- 42\n- else\n- 42`);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too many items according to schema. Expected 4 or fewer.');
    });

    it('unevaluatedItems with boolean schemas', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        allOf: [true],
        unevaluatedItems: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(`[]`)).to.be.empty;

      const content = `- foo`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too many items according to schema. Expected 0 or fewer.');
    });

    it('unevaluatedItems with $ref', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        $ref: '#/$defs/bar',
        items: [{ type: 'string' }],
        unevaluatedItems: false,
        $defs: {
          bar: {
            items: [true, { type: 'string' }],
          },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(`- foo\n- bar`)).to.be.empty;

      const content = `- foo\n- bar\n- baz`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too many items according to schema. Expected 2 or fewer.');
    });

    it('unevaluatedItems before $ref', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        unevaluatedItems: false,
        items: [{ type: 'string' }],
        $ref: '#/$defs/bar',
        $defs: {
          bar: {
            items: [true, { type: 'string' }],
          },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(`- foo\n- bar`)).to.be.empty;

      const content = `- foo\n- bar\n- baz`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too many items according to schema. Expected 2 or fewer.');
    });

    it('unevaluatedItems with $recursiveRef', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        $id: 'https://example.com/unevaluated-items-with-recursive-ref/extended-tree',
        $recursiveAnchor: true,
        $ref: './tree',
        items: [true, true, { type: 'string' }],
        $defs: {
          tree: {
            $id: './tree',
            $recursiveAnchor: true,
            type: 'array',
            items: [
              { type: 'number' },
              {
                unevaluatedItems: false,
                $recursiveRef: '#',
              },
            ],
          },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(`- 1\n- - 2\n  - []\n  - b\n- a`)).to.be.empty;

      const content = `- 1\n- - 2\n  - []\n  - b\n  - too many\n- a`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too many items according to schema. Expected 3 or fewer.');
    });

    it("unevaluatedItems can't see inside cousins", async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        allOf: [{ items: [true] }, { unevaluatedItems: false }],
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = `- 1`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too many items according to schema. Expected 0 or fewer.');
    });

    it('item is evaluated in an uncle schema to unevaluatedItems', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        properties: {
          foo: {
            items: [{ type: 'string' }],
            unevaluatedItems: false,
          },
        },
        anyOf: [
          {
            properties: {
              foo: {
                items: [true, { type: 'string' }],
              },
            },
          },
        ],
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(`foo:\n  - test`)).to.be.empty;

      const content = `foo:\n  - test\n  - test`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too many items according to schema. Expected 1 or fewer.');
    });

    describe('non-array instances are valid', () => {
      it('', async () => {
        const schema: JSONSchema = {
          $schema: 'https://json-schema.org/draft/2019-09/schema',
          unevaluatedItems: false,
        };
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = `true`;
        const result = await parseSetup(content);
        expect(result).to.be.empty;
      });

      it('ignores integers', async () => {
        const schema: JSONSchema = {
          $schema: 'https://json-schema.org/draft/2019-09/schema',
          unevaluatedItems: false,
        };
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = `123`;
        const result = await parseSetup(content);
        expect(result).to.be.empty;
      });

      it('ignores floats', async () => {
        const schema: JSONSchema = {
          $schema: 'https://json-schema.org/draft/2019-09/schema',
          unevaluatedItems: false,
        };
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = `1.0`;
        const result = await parseSetup(content);
        expect(result).to.be.empty;
      });

      it('ignores objects', async () => {
        const schema: JSONSchema = {
          $schema: 'https://json-schema.org/draft/2019-09/schema',
          unevaluatedItems: false,
        };
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = `{}`;
        const result = await parseSetup(content);
        expect(result).to.be.empty;
      });

      it('ignores strings', async () => {
        const schema: JSONSchema = {
          $schema: 'https://json-schema.org/draft/2019-09/schema',
          unevaluatedItems: false,
        };
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = `foo`;
        const result = await parseSetup(content);
        expect(result).to.be.empty;
      });

      it('ignores null', async () => {
        const schema: JSONSchema = {
          $schema: 'https://json-schema.org/draft/2019-09/schema',
          unevaluatedItems: false,
        };
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = `null`;
        const result = await parseSetup(content);
        expect(result).to.be.empty;
      });
    });

    it('unevaluatedItems with null instance elements', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        unevaluatedItems: {
          type: 'null',
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = `- null`;
      const result = await parseSetup(content);
      expect(result).to.be.empty;
    });

    it('unevaluatedItems can see annotations from if without then and else', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        if: {
          items: [{ const: 'a' }],
        },
        unevaluatedItems: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      expect(await parseSetup(`- a`)).to.be.empty;

      const content = `- b`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too many items according to schema. Expected 0 or fewer.');
    });

    it('Evaluated items collection needs to consider instance location', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        items: [
          {
            items: [true, { type: 'string' }],
          },
        ],
        unevaluatedItems: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = `- - foo\n  - bar\n- bar`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too many items according to schema. Expected 1 or fewer.');
    });
  });

  describe('keyword: contains + minContains/maxContains', () => {
    it('minContains fails when too few items match contains subschema', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'array',
        contains: {
          type: 'object',
          properties: {
            kind: { const: 'ok' },
            id: { type: 'number' },
          },
          required: ['kind', 'id'],
        },
        minContains: 2,
      } as JSONSchema);

      const content = `- kind: ok\n  id: 1\n- kind: ok\n  id: "2"\n- kind: nope\n  id: 3`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too few items matching');
      expect(result[0].message).to.include('contains');
      expect(result[0].message).to.include('Expected 2 or more.');
    });

    it('maxContains fails when too many items match contains subschema', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'array',
        contains: {
          type: 'object',
          properties: {
            kind: { const: 'ok' },
            id: { type: 'number' },
          },
          required: ['kind', 'id'],
        },
        maxContains: 3,
      } as JSONSchema);

      const content = `- kind: ok\n  id: 1\n- kind: ok\n  id: 2\n- kind: ok\n  id: 3\n- kind: ok\n  id: 4`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too many items matching');
      expect(result[0].message).to.include('contains');
      expect(result[0].message).to.include('Expected 3 or fewer.');
    });

    it('minContains/maxContains passes when match count is within bounds', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'array',
        contains: {
          type: 'object',
          properties: {
            kind: { const: 'ok' },
            id: { type: 'number' },
          },
          required: ['kind', 'id'],
        },
        minContains: 2,
        maxContains: 3,
      } as JSONSchema);
      const content = `
- kind: ok
  id: 1
- kind: ok
  id: 2
- kind: nope
  id: 3
`;
      const result = await parseSetup(content);
      expect(result).to.be.empty;
    });

    it('contains matching is based on subschema, not just item type', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'array',
        contains: {
          type: 'object',
          required: ['tag'],
          properties: {
            tag: { const: 'match' },
          },
        },
        minContains: 1,
      } as JSONSchema);
      const okYaml = `
- tag: other
- tag: match
- nope: 1
`;
      let result = await parseSetup(okYaml);
      expect(result).to.be.empty;
      const badYaml = `
- tag: other
- tag: nope
- nope: 1`;
      result = await parseSetup(badYaml);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too few items matching');
      expect(result[0].message).to.include('contains');
      expect(result[0].message).to.include('Expected 1 or more.');
    });
  });

  describe('keyword: dependentRequired', () => {
    beforeEach(() => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          billing_address: { type: 'string' },
          credit_card: { type: 'string' },
        },
        dependentRequired: {
          billing_address: ['credit_card'],
        },
      } as JSONSchema);
    });
    it('requires dependent properties when the trigger property is present', async () => {
      const content = `billing_address: "123 King St"`;
      const result = await parseSetup(content);

      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Object is missing property credit_card required by property billing_address.');
    });
    it('passes when required dependent properties are present', async () => {
      const content = `billing_address: "123 King St"\ncredit_card: "4111-1111"`;
      const result = await parseSetup(content);

      expect(result).to.be.empty;
    });
  });

  describe('keyword: dependentSchemas', () => {
    it('does not apply when the trigger property is absent', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          kind: { type: 'string' },
          port: { type: 'number' },
        },
        dependentSchemas: {
          kind: { required: ['port'] },
        },
      } as JSONSchema);
      const content = `port: 8080`;
      const result = await parseSetup(content);
      expect(result).to.be.empty;
    });
    it('applies dependent schema when the trigger property is present', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          kind: { type: 'string' },
          port: { type: 'number' },
        },
        dependentSchemas: {
          kind: { required: ['port'] },
        },
      } as JSONSchema);
      const content = `kind: service`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Missing property');
      expect(result[0].message).to.include('port');
    });
    it('can enforce additional constraints from the dependent schema', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          tls: { type: 'boolean' },
          port: { type: 'number' },
        },
        dependentSchemas: {
          tls: {
            required: ['port'],
            properties: {
              port: { minimum: 1024 },
            },
          },
        },
      } as JSONSchema);
      const content = `tls: true\nport: 80`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Value is below the minimum of 1024.');
    });
    it('applies multiple dependentSchemas when multiple triggers are present', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          kind: { type: 'string' },
          tls: { type: 'boolean' },
          port: { type: 'number' },
        },
        dependentSchemas: {
          kind: { required: ['port'] },
          tls: {
            required: ['port'],
            properties: { port: { minimum: 1024 } },
          },
        },
      } as JSONSchema);
      const content = `kind: service\ntls: true\nport: 80`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Value is below the minimum of 1024.');
    });
  });

  describe('keyword: dependencies (backward compatibility)', () => {
    describe('property dependencies tests', () => {
      beforeEach(() => {
        schemaProvider.addSchema(SCHEMA_ID, {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            credit_card: { type: 'string' },
            billing_address: { type: 'string' },
          },
          dependencies: {
            credit_card: ['billing_address'],
          },
        } as JSONSchema);
      });
      it('requires dependent properties when the trigger property is present', async () => {
        const content = `credit_card: "4111-1111-1111-1111"`;
        const result = await parseSetup(content);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Object is missing property billing_address required by property credit_card.');
      });
      it('does not apply when the trigger property is absent', async () => {
        const content = `billing_address: "123 Main St"`;
        const result = await parseSetup(content);
        expect(result).to.be.empty;
      });
    });
    describe('schema dependencies tests', () => {
      beforeEach(() => {
        schemaProvider.addSchema(SCHEMA_ID, {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            mode: { type: 'string' },
            port: { type: 'number' },
          },
          dependencies: {
            mode: {
              required: ['port'],
              properties: {
                port: { minimum: 1024 },
              },
            },
          },
        } as JSONSchema);
      });
      it('enforces dependent schema constraints when trigger property is present', async () => {
        const content = `mode: "server"\nport: 80`;
        const result = await parseSetup(content);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Value is below the minimum of 1024.');
      });
      it('enforces dependent schema required properties when trigger property is present', async () => {
        const content = `mode: "server"`;
        const result = await parseSetup(content);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Missing property');
        expect(result[0].message).to.include('port');
      });
      it('does not apply the dependent schema when trigger property is absent', async () => {
        const content = `port: 80`;
        const result = await parseSetup(content);
        expect(result).to.be.empty;
      });
    });
  });

  describe('$ref resolution should support sibling keywords', () => {
    it('should apply sibling keywords next to $ref', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          value: {
            $ref: '#/$defs/A',
            type: 'number',
          },
        },
        $defs: {
          A: { type: 'string' },
        },
      } as JSONSchema);
      // both should fail: must be both string and number
      expect((await parseSetup(`value: hello`)).length).to.be.greaterThan(0);
      expect((await parseSetup(`value: 1`)).length).to.be.greaterThan(0);
    });
    it('should apply sibling keywords next to $ref (top level)', async () => {
      const schema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        definitions: {
          obj1: {
            type: 'object',
            properties: {
              value: { type: 'string' },
            },
            required: ['value'],
          },
        },
        $ref: '#/definitions/obj1',
        additionalProperties: false,
        properties: {
          value: {},
          extra: { type: 'number' },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = `value: hello
extra: notANumber
unknown: 1
`;
      const result = await parseSetup(content);
      expect(result[0].message).to.include('Incorrect type. Expected');
      expect(result[0].message).to.include('number');
      expect(result[1].message).to.include('Property unknown is not allowed.');
    });
  });

  describe('$id resolution', () => {
    it('should resolve embedded resource $id for relative $ref without external load', async () => {
      const root: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          x: { $ref: 'other.json#bar' },
        },
        required: ['x'],
        $defs: {
          B: {
            $id: 'other.json',
            $defs: {
              X: {
                $anchor: 'bar',
                type: 'string',
                minLength: 2,
              },
            },
          },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, root);
      const yaml = `x: A`;
      const result = await parseSetup(yaml);
      expect(result.some((d) => /Problems loading reference/i.test(d.message))).to.eq(false);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('String is shorter than the minimum length of 2.');
    });

    it('should handle $id changing base URI for nested $anchor resolution', async () => {
      const root: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          address: { $ref: 'schemas/address.json#USAddress' },
        },
        $defs: {
          addressSchema: {
            $id: 'schemas/address.json',
            $defs: {
              us: {
                $anchor: 'USAddress',
                type: 'object',
                properties: {
                  zipCode: { type: 'string', minLength: 5 },
                },
                required: ['zipCode'],
              },
            },
          },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, root);
      const yaml = `address:\n  zipCode: "123"`;
      const result = await parseSetup(yaml);
      expect(result.some((d) => /Problems loading reference/i.test(d.message))).to.eq(false);
      expect(result[0].message).to.include('String is shorter than the minimum length of 5.');
    });
  });

  describe('$recursiveAnchor and $recursiveRef resolution', () => {
    describe('$recursiveRef without $recursiveAnchor works like $ref', () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        properties: {
          foo: { $recursiveRef: '#' },
        },
        additionalProperties: false,
      };

      beforeEach(() => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
      });

      it('match', async () => {
        expect(await parseSetup('foo: false')).to.be.empty;
      });

      it('recursive match', async () => {
        expect(
          await parseSetup(`foo:
  foo: false`)
        ).to.be.empty;
      });

      it('mismatch', async () => {
        const result = await parseSetup('bar: false');
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Property bar is not allowed.');
      });

      it('recursive mismatch', async () => {
        const result = await parseSetup(`foo:
  bar: false`);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Property bar is not allowed.');
      });
    });

    describe('$recursiveRef without using nesting', () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        $id: 'http://localhost:4242/draft2019-09/recursiveRef2/schema.json',
        $defs: {
          myobject: {
            $id: 'myobject.json',
            $recursiveAnchor: true,
            anyOf: [
              { type: 'string' },
              {
                type: 'object',
                additionalProperties: { $recursiveRef: '#' },
              },
            ],
          },
        },
        anyOf: [{ type: 'integer' }, { $ref: '#/$defs/myobject' }],
      };

      beforeEach(() => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
      });

      it('integer matches at the outer level', async () => {
        expect(await parseSetup(`1`)).to.be.empty;
      });

      it('single level match', async () => {
        expect(await parseSetup(`foo: hi`)).to.be.empty;
      });

      it('integer does not match as a property value', async () => {
        const result = await parseSetup(`foo: 1`);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Incorrect type.');
        expect(result[0].message).to.include('string | object');
      });

      it('two levels, properties match with inner definition', async () => {
        expect(
          await parseSetup(`foo:
  bar: hi`)
        ).to.be.empty;
      });

      it('two levels, no match', async () => {
        const result = await parseSetup(`foo:
  bar: 1`);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Incorrect type.');
        expect(result[0].message).to.include('string | object');
      });
    });

    describe('$recursiveRef with nesting', () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        $id: 'http://localhost:4242/draft2019-09/recursiveRef3/schema.json',
        $recursiveAnchor: true,
        $defs: {
          myobject: {
            $id: 'myobject.json',
            $recursiveAnchor: true,
            anyOf: [
              { type: 'string' },
              {
                type: 'object',
                additionalProperties: { $recursiveRef: '#' },
              },
            ],
          },
        },
        anyOf: [{ type: 'integer' }, { $ref: '#/$defs/myobject' }],
      };

      beforeEach(() => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
      });

      it('integer matches at the outer level', async () => {
        expect(await parseSetup(`1`)).to.be.empty;
      });

      it('single level match', async () => {
        expect(await parseSetup(`foo: hi`)).to.be.empty;
      });

      it('integer now matches as a property value', async () => {
        expect(await parseSetup(`foo: 1`)).to.be.empty;
      });

      it('two levels, properties match with inner definition', async () => {
        expect(
          await parseSetup(`foo:
  bar: hi`)
        ).to.be.empty;
      });

      it('two levels, properties match with $recursiveRef', async () => {
        expect(
          await parseSetup(`foo:
  bar: 1`)
        ).to.be.empty;
      });
    });

    describe('$recursiveRef with $recursiveAnchor: false works like $ref', () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        $id: 'http://localhost:4242/draft2019-09/recursiveRef4/schema.json',
        $recursiveAnchor: false,
        $defs: {
          myobject: {
            $id: 'myobject.json',
            $recursiveAnchor: false,
            anyOf: [
              { type: 'string' },
              {
                type: 'object',
                additionalProperties: { $recursiveRef: '#' },
              },
            ],
          },
        },
        anyOf: [{ type: 'integer' }, { $ref: '#/$defs/myobject' }],
      };

      beforeEach(() => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
      });

      it('integer matches at the outer level', async () => {
        expect(await parseSetup(`1`)).to.be.empty;
      });

      it('single level match', async () => {
        expect(await parseSetup(`foo: hi`)).to.be.empty;
      });

      it('integer does not match as a property value', async () => {
        const result = await parseSetup(`foo: 1`);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Incorrect type.');
        expect(result[0].message).to.include('string | object');
      });

      it('two levels, properties match with inner definition', async () => {
        expect(
          await parseSetup(`foo:
  bar: hi`)
        ).to.be.empty;
      });

      it('two levels, integer does not match as a property value', async () => {
        const result = await parseSetup(`foo:
  bar: 1`);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Incorrect type.');
        expect(result[0].message).to.include('string | object');
      });
    });

    describe('$recursiveRef with no $recursiveAnchor works like $ref', () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        $id: 'http://localhost:4242/draft2019-09/recursiveRef5/schema.json',
        $defs: {
          myobject: {
            $id: 'myobject.json',
            $recursiveAnchor: false,
            anyOf: [
              { type: 'string' },
              {
                type: 'object',
                additionalProperties: { $recursiveRef: '#' },
              },
            ],
          },
        },
        anyOf: [{ type: 'integer' }, { $ref: '#/$defs/myobject' }],
      };

      beforeEach(() => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
      });

      it('integer matches at the outer level', async () => {
        expect(await parseSetup(`1`)).to.be.empty;
      });

      it('single level match', async () => {
        expect(await parseSetup(`foo: hi`)).to.be.empty;
      });

      it('integer does not match as a property value', async () => {
        const result = await parseSetup(`foo: 1`);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Incorrect type.');
        expect(result[0].message).to.include('string | object');
      });

      it('two levels, properties match with inner definition', async () => {
        expect(
          await parseSetup(`foo:
  bar: hi`)
        ).to.be.empty;
      });

      it('two levels, integer does not match as a property value', async () => {
        const result = await parseSetup(`foo:
  bar: 1`);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Incorrect type.');
        expect(result[0].message).to.include('string | object');
      });
    });

    describe('$recursiveRef with no $recursiveAnchor in the initial target schema resource', () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        $id: 'http://localhost:4242/draft2019-09/recursiveRef6/base.json',
        $recursiveAnchor: true,
        anyOf: [
          { type: 'boolean' },
          {
            type: 'object',
            additionalProperties: {
              $id: 'http://localhost:4242/draft2019-09/recursiveRef6/inner.json',
              $comment: 'there is no $recursiveAnchor: true here, so we do NOT recurse to the base',
              anyOf: [{ type: 'integer' }, { type: 'object', additionalProperties: { $recursiveRef: '#' } }],
            },
          },
        ],
      };

      beforeEach(() => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
      });

      it('leaf node does not match; no recursion', async () => {
        const result = await parseSetup(`foo: true`);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Incorrect type.');
        expect(result[0].message).to.include('integer | object');
      });

      it('leaf node matches: recursion uses the inner schema', async () => {
        expect(
          await parseSetup(`foo:
  bar: 1`)
        ).to.be.empty;
      });

      it('leaf node does not match: recursion uses the inner schema', async () => {
        const result = await parseSetup(`foo:
  bar: true`);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Incorrect type.');
        expect(result[0].message).to.include('integer | object');
      });
    });

    describe('$recursiveRef with no $recursiveAnchor in the outer schema resource', () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        $id: 'http://localhost:4242/draft2019-09/recursiveRef7/base.json',
        anyOf: [
          { type: 'boolean' },
          {
            type: 'object',
            additionalProperties: {
              $id: 'http://localhost:4242/draft2019-09/recursiveRef7/inner.json',
              $recursiveAnchor: true,
              anyOf: [{ type: 'integer' }, { type: 'object', additionalProperties: { $recursiveRef: '#' } }],
            },
          },
        ],
      };

      beforeEach(() => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
      });

      it('leaf node does not match; no recursion', async () => {
        const result = await parseSetup(`foo: true`);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Incorrect type.');
        expect(result[0].message).to.include('integer | object');
      });

      it('leaf node matches: recursion only uses inner schema', async () => {
        expect(
          await parseSetup(`foo:
  bar: 1`)
        ).to.be.empty;
      });

      it('leaf node does not match: recursion only uses inner schema', async () => {
        const result = await parseSetup(`foo:
  bar: true`);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Incorrect type.');
        expect(result[0].message).to.include('integer | object');
      });
    });

    describe('multiple dynamic paths to the $recursiveRef keyword', () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        $id: 'https://example.com/recursiveRef8_main.json',
        $defs: {
          inner: {
            $id: 'recursiveRef8_inner.json',
            $recursiveAnchor: true,
            title: 'inner',
            additionalProperties: {
              $recursiveRef: '#',
            },
          },
        },
        if: {
          propertyNames: {
            pattern: '^[a-m]',
          },
        },
        then: {
          title: 'any type of node',
          $id: 'recursiveRef8_anyLeafNode.json',
          $recursiveAnchor: true,
          $ref: 'recursiveRef8_inner.json',
        },
        else: {
          title: 'integer node',
          $id: 'recursiveRef8_integerNode.json',
          $recursiveAnchor: true,
          type: ['object', 'integer'],
          $ref: 'recursiveRef8_inner.json',
        },
      };

      beforeEach(() => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
      });

      it('recurse to anyLeafNode - floats are allowed', async () => {
        expect(await parseSetup(`alpha: 1.1`)).to.be.empty;
      });

      it('recurse to integerNode - floats are not allowed', async () => {
        const result = await parseSetup(`november: 1.1`);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Incorrect type. Expected one of object, integer.');
      });
    });

    describe('dynamic $recursiveRef destination (not predictable at schema compile time)', () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        $id: 'https://example.com/main.json',
        $defs: {
          inner: {
            $id: 'inner.json',
            $recursiveAnchor: true,
            title: 'inner',
            additionalProperties: {
              $recursiveRef: '#',
            },
          },
        },
        if: { propertyNames: { pattern: '^[a-m]' } },
        then: {
          title: 'any type of node',
          $id: 'anyLeafNode.json',
          $recursiveAnchor: true,
          $ref: 'main.json#/$defs/inner',
        },
        else: {
          title: 'integer node',
          $id: 'integerNode.json',
          $recursiveAnchor: true,
          type: ['object', 'integer'],
          $ref: 'main.json#/$defs/inner',
        },
      };

      beforeEach(() => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
      });

      it('numeric node', async () => {
        expect(await parseSetup(`alpha: 1.1`)).to.be.empty;
      });

      it('integer node', async () => {
        const result = await parseSetup(`november: 1.1`);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Incorrect type. Expected one of object, integer.');
      });
    });

    it('does not infinite loop on self-recursive $recursiveRef', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        $id: 'http://localhost:4242/recursive.json',
        $recursiveAnchor: true,
        anyOf: [
          { type: 'string' },
          {
            type: 'object',
            additionalProperties: { $recursiveRef: '#' },
          },
        ],
      };

      schemaProvider.addSchemaWithUri(SCHEMA_ID, 'http://localhost:4242/recursive.json', schema);
      const result = await parseSetup(`# yaml-language-server: $schema=http://localhost:4242/recursive.json
foo:
  bar:
    baz: 1`);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Incorrect type.');
      expect(result[0].message).to.include('string | object');
    });

    describe('tree schema with unevaluatedProperties', () => {
      it('$recursiveRef resolves to outermost schema with $recursiveAnchor in dynamic scope', async () => {
        const treeSchema: JSONSchema = {
          $schema: 'https://json-schema.org/draft/2019-09/schema',
          $id: 'http://example.com/tree.json',
          $recursiveAnchor: true,
          type: 'object',
          properties: {
            value: { type: 'integer' },
            children: { type: 'array', items: { $recursiveRef: '#' } },
          },
          required: ['value'],
        };

        const treeWithMetaSchema: JSONSchema = {
          $schema: 'https://json-schema.org/draft/2019-09/schema',
          $id: 'http://example.com/tree-with-meta.json',
          $recursiveAnchor: true,
          allOf: [{ $ref: 'http://example.com/tree.json' }],
          properties: {
            meta: { type: 'string' },
          },
          required: ['meta'],
          unevaluatedProperties: false,
        };
        schemaProvider.addSchemaWithUri(SCHEMA_ID, 'http://example.com/tree.json', treeSchema);
        schemaProvider.addSchemaWithUri(SCHEMA_ID, 'http://example.com/tree-with-meta.json', treeWithMetaSchema);

        const content = `# yaml-language-server: $schema=http://example.com/tree-with-meta.json
value: 1
meta: root
children:
  - value: 2
`;
        const result = await parseSetup(content);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Missing property');
        expect(result[0].message).to.include('meta');
      });

      it('$recursiveRef with all required properties should pass', async () => {
        const treeSchema: JSONSchema = {
          $schema: 'https://json-schema.org/draft/2019-09/schema',
          $id: 'http://example.com/tree2.json',
          $recursiveAnchor: true,
          type: 'object',
          properties: {
            value: { type: 'integer' },
            children: { type: 'array', items: { $recursiveRef: '#' } },
          },
          required: ['value'],
        };
        const treeWithMetaSchema: JSONSchema = {
          $schema: 'https://json-schema.org/draft/2019-09/schema',
          $id: 'http://example.com/tree-with-meta2.json',
          $recursiveAnchor: true,
          allOf: [{ $ref: 'http://example.com/tree2.json' }],
          properties: {
            meta: { type: 'string' },
          },
          required: ['meta'],
          unevaluatedProperties: false,
        };
        schemaProvider.addSchemaWithUri(SCHEMA_ID, 'http://example.com/tree2.json', treeSchema);
        schemaProvider.addSchemaWithUri(SCHEMA_ID, 'http://example.com/tree-with-meta2.json', treeWithMetaSchema);

        const content = `# yaml-language-server: $schema=http://example.com/tree-with-meta2.json
value: 1
meta: root
children:
  - value: 2
    meta: child
`;
        expect(await parseSetup(content)).to.be.empty;
      });
    });
  });

  describe('keyword: contains', () => {
    it('contains keyword validation', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        contains: { minimum: 5 },
      } as JSONSchema);

      // array with item matching schema (5) is valid
      let content = toContent([3, 4, 5]);
      let result = await parseSetup(content);
      expect(result).to.be.empty;

      // array with item matching schema (6) is valid
      content = toContent([3, 4, 6]);
      result = await parseSetup(content);
      expect(result).to.be.empty;

      // array with two items matching schema (5, 6) is valid
      content = toContent([3, 4, 5, 6]);
      result = await parseSetup(content);
      expect(result).to.be.empty;

      // array without items matching schema is invalid
      content = toContent([2, 3, 4]);
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too few items matching');

      // empty array is invalid
      content = toContent([]);
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too few items matching');

      // not array is valid
      content = toContent({});
      result = await parseSetup(content);
      expect(result).to.be.empty;
    });

    it('contains keyword with const keyword', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        contains: { const: 5 },
      } as JSONSchema);

      // array with item 5 is valid
      let content = toContent([3, 4, 5]);
      let result = await parseSetup(content);
      expect(result).to.be.empty;

      // array with two items 5 is valid
      content = toContent([3, 4, 5, 5]);
      result = await parseSetup(content);
      expect(result).to.be.empty;

      // array without item 5 is invalid
      content = toContent([1, 2, 3, 4]);
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too few items matching');
    });

    it('contains keyword with boolean schema true', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        contains: true,
      } as JSONSchema);

      // any non-empty array is valid
      let content = toContent(['foo']);
      let result = await parseSetup(content);
      expect(result).to.be.empty;

      // empty array is invalid
      content = toContent([]);
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too few items matching');
    });

    it('contains keyword with boolean schema false', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        contains: false,
      } as JSONSchema);

      // any non-empty array is invalid
      let content = toContent(['foo']);
      let result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too few items matching');

      // empty array is invalid
      content = toContent([]);
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too few items matching');

      // non-arrays are valid
      content = toContent('contains does not apply to strings');
      result = await parseSetup(content);
      expect(result).to.be.empty;
    });

    it('items + contains', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        items: { multipleOf: 2 },
        contains: { multipleOf: 3 },
      } as JSONSchema);

      // matches items, does not match contains
      let content = toContent([2, 4, 8]);
      let result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too few items matching');

      // does not match items, matches contains
      content = toContent([3, 6, 9]);
      result = await parseSetup(content);
      expect(result).to.have.length(2);
      expect(result[0].message).to.include('Value is not divisible by 2.');
      expect(result[1].message).to.include('Value is not divisible by 2.');

      // matches both items and contains
      content = toContent([6, 12]);
      result = await parseSetup(content);
      expect(result).to.be.empty;

      // matches neither items nor contains
      content = toContent([1, 5]);
      result = await parseSetup(content);
      expect(result).to.have.length(3);
      expect(result[0].message).to.include('Value is not divisible by 2.');
      expect(result[1].message).to.include('Value is not divisible by 2.');
      expect(result[2].message).to.include('Array has too few items matching');
    });

    it('contains with false if subschema', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        contains: {
          if: false,
          else: true,
        },
      } as JSONSchema);

      // any non-empty array is valid
      let content = toContent(['foo']);
      let result = await parseSetup(content);
      expect(result).to.be.empty;

      // empty array is invalid
      content = toContent([]);
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too few items matching');
    });

    it('contains with null instance elements', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        contains: {
          type: 'null',
        },
      } as JSONSchema);

      // allows null items
      const content = toContent([null]);
      const result = await parseSetup(content);
      expect(result).to.be.empty;
    });
  });

  describe('keyword: maxContains', () => {
    it('maxContains without contains is ignored', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        maxContains: 1,
      } as JSONSchema);

      // one item valid against lone maxContains
      let content = toContent([1]);
      let result = await parseSetup(content);
      expect(result).to.be.empty;

      // two items still valid against lone maxContains
      content = toContent([1, 2]);
      result = await parseSetup(content);
      expect(result).to.be.empty;
    });

    it('maxContains with contains', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        contains: { const: 1 },
        maxContains: 1,
      } as JSONSchema);

      // empty data
      let content = toContent([]);
      let result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too few items matching');

      // all elements match, valid maxContains
      content = toContent([1]);
      result = await parseSetup(content);
      expect(result).to.be.empty;

      // all elements match, invalid maxContains
      content = toContent([1, 1]);
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too many items matching');

      // some elements match, valid maxContains
      content = toContent([1, 2]);
      result = await parseSetup(content);
      expect(result).to.be.empty;

      // some elements match, invalid maxContains
      content = toContent([1, 2, 1]);
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too many items matching');
    });

    it('maxContains with contains, value with a decimal', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        contains: { const: 1 },
        maxContains: 1.0,
      } as JSONSchema);

      // one element matches, valid maxContains
      let content = toContent([1]);
      let result = await parseSetup(content);
      expect(result).to.be.empty;

      // too many elements match, invalid maxContains
      content = toContent([1, 1]);
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too many items matching');
    });

    it('minContains < maxContains', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        contains: { const: 1 },
        minContains: 1,
        maxContains: 3,
      } as JSONSchema);

      // actual < minContains < maxContains
      let content = toContent([]);
      let result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too few items matching');

      // minContains < actual < maxContains
      content = toContent([1, 1]);
      result = await parseSetup(content);
      expect(result).to.be.empty;

      // minContains < maxContains < actual
      content = toContent([1, 1, 1, 1]);
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too many items matching');
    });
  });

  describe('keyword: minContains', () => {
    it('minContains without contains is ignored', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        minContains: 1,
      } as JSONSchema);

      // one item valid against lone minContains
      let content = toContent([1]);
      let result = await parseSetup(content);
      expect(result).to.be.empty;

      // zero items still valid against lone minContains
      content = toContent([]);
      result = await parseSetup(content);
      expect(result).to.be.empty;
    });

    it('minContains=1 with contains', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        contains: { const: 1 },
        minContains: 1,
      } as JSONSchema);

      // empty data
      let content = toContent([]);
      let result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too few items matching');

      // no elements match
      content = toContent([2]);
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too few items matching');

      // single element matches, valid minContains
      content = toContent([1]);
      result = await parseSetup(content);
      expect(result).to.be.empty;

      // some elements match, valid minContains
      content = toContent([1, 2]);
      result = await parseSetup(content);
      expect(result).to.be.empty;

      // all elements match, valid minContains
      content = toContent([1, 1]);
      result = await parseSetup(content);
      expect(result).to.be.empty;
    });

    it('minContains=2 with contains', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        contains: { const: 1 },
        minContains: 2,
      } as JSONSchema);

      // empty data
      let content = toContent([]);
      let result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too few items matching');

      // all elements match, invalid minContains
      content = toContent([1]);
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too few items matching');

      // some elements match, invalid minContains
      content = toContent([1, 2]);
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too few items matching');

      // all elements match, valid minContains (exactly as needed)
      content = toContent([1, 1]);
      result = await parseSetup(content);
      expect(result).to.be.empty;

      // all elements match, valid minContains (more than needed)
      content = toContent([1, 1, 1]);
      result = await parseSetup(content);
      expect(result).to.be.empty;

      // some elements match, valid minContains
      content = toContent([1, 2, 1]);
      result = await parseSetup(content);
      expect(result).to.be.empty;
    });

    it('minContains=2 with contains with a decimal value', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        contains: { const: 1 },
        minContains: 2.0,
      } as JSONSchema);

      // one element matches, invalid minContains
      let content = toContent([1]);
      let result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too few items matching');

      // both elements match, valid minContains
      content = toContent([1, 1]);
      result = await parseSetup(content);
      expect(result).to.be.empty;
    });

    it('maxContains = minContains', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        contains: { const: 1 },
        maxContains: 2,
        minContains: 2,
      } as JSONSchema);

      // empty data
      let content = toContent([]);
      let result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too few items matching');

      // all elements match, invalid minContains
      content = toContent([1]);
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too few items matching');

      // all elements match, invalid maxContains
      content = toContent([1, 1, 1]);
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too many items matching');

      // all elements match, valid maxContains and minContains
      content = toContent([1, 1]);
      result = await parseSetup(content);
      expect(result).to.be.empty;
    });

    it('maxContains < minContains', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        contains: { const: 1 },
        maxContains: 1,
        minContains: 3,
      } as JSONSchema);

      // empty data
      let content = toContent([]);
      let result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too few items matching');

      // invalid minContains
      content = toContent([1]);
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too few items matching');

      // invalid maxContains
      content = toContent([1, 1, 1]);
      result = await parseSetup(content);
      expect(result).to.have.length(2);
      expect(result[0].message).to.include('Array has too few items matching');
      expect(result[1].message).to.include('Array has too many items matching');

      // invalid maxContains and minContains
      content = toContent([1, 1]);
      result = await parseSetup(content);
      expect(result).to.have.length(2);
      expect(result[0].message).to.include('Array has too few items matching');
      expect(result[1].message).to.include('Array has too many items matching');
    });

    it('minContains = 0 with no maxContains', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        contains: { const: 1 },
        minContains: 0,
      } as JSONSchema);

      // empty data
      let content = toContent([]);
      let result = await parseSetup(content);
      expect(result).to.be.empty;

      // minContains = 0 makes contains always pass
      content = toContent([2]);
      result = await parseSetup(content);
      expect(result).to.be.empty;
    });

    it('minContains = 0 with maxContains', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        contains: { const: 1 },
        minContains: 0,
        maxContains: 1,
      } as JSONSchema);

      // empty data
      let content = toContent([]);
      let result = await parseSetup(content);
      expect(result).to.be.empty;

      // not more than maxContains
      content = toContent([1]);
      result = await parseSetup(content);
      expect(result).to.be.empty;

      // too many
      content = toContent([1, 1]);
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too many items matching');
    });
  });

  describe('keyword: dependentSchemas', () => {
    it('single dependency', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        dependentSchemas: {
          bar: {
            properties: {
              foo: { type: 'integer' },
              bar: { type: 'integer' },
            },
          },
        },
      } as JSONSchema);

      // valid
      let content = toContent({ foo: 1, bar: 2 });
      let result = await parseSetup(content);
      expect(result).to.be.empty;

      // no dependency
      content = toContent({ foo: 'quux' });
      result = await parseSetup(content);
      expect(result).to.be.empty;

      // wrong type
      content = toContent({ foo: 'quux', bar: 2 });
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Incorrect type');

      // wrong type other
      content = toContent({ foo: 2, bar: 'quux' });
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Incorrect type');

      // wrong type both
      content = toContent({ foo: 'quux', bar: 'quux' });
      result = await parseSetup(content);
      expect(result).to.have.length(2);
      expect(result[0].message).to.include('Incorrect type');
      expect(result[1].message).to.include('Incorrect type');

      // ignores arrays
      content = toContent(['bar']);
      result = await parseSetup(content);
      expect(result).to.be.empty;

      // ignores strings
      content = toContent('foobar');
      result = await parseSetup(content);
      expect(result).to.be.empty;

      // ignores other non-objects
      content = toContent(12);
      result = await parseSetup(content);
      expect(result).to.be.empty;
    });

    it('boolean subschemas', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        dependentSchemas: {
          foo: true,
          bar: false,
        },
      } as JSONSchema);

      // object with property having schema true is valid
      let content = toContent({ foo: 1 });
      let result = await parseSetup(content);
      expect(result).to.be.empty;

      // object with property having schema false is invalid
      content = toContent({ bar: 2 });
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Matches a schema that is not allowed');

      // object with both properties is invalid
      content = toContent({ foo: 1, bar: 2 });
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Matches a schema that is not allowed');

      // empty object is valid
      content = toContent({});
      result = await parseSetup(content);
      expect(result).to.be.empty;
    });

    it('dependencies with escaped characters', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        dependentSchemas: {
          'foo\tbar': { minProperties: 4 },
          "foo'bar": { required: ['foo"bar'] },
        },
      } as JSONSchema);

      // quoted tab
      let content = toContent({
        'foo\tbar': 1,
        a: 2,
        b: 3,
        c: 4,
      });
      let result = await parseSetup(content);
      expect(result).to.be.empty;

      // quoted quote
      content = toContent({
        "foo'bar": { 'foo"bar': 1 },
      });
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Missing property');

      // quoted tab invalid under dependent schema
      content = toContent({
        'foo\tbar': 1,
        a: 2,
      });
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Object has fewer properties than the required number of 4');

      // quoted quote invalid under dependent schema
      content = toContent({ "foo'bar": 1 });
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Missing property');
    });

    it('dependent subschema incompatible with root', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        properties: {
          foo: {},
        },
        dependentSchemas: {
          foo: {
            properties: {
              bar: {},
            },
            additionalProperties: false,
          },
        },
      } as JSONSchema);

      // matches root
      let content = toContent({ foo: 1 });
      let result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('not allowed');

      // matches dependency
      content = toContent({ bar: 1 });
      result = await parseSetup(content);
      expect(result).to.be.empty;

      // matches both
      content = toContent({ foo: 1, bar: 2 });
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('not allowed');

      // no dependency
      content = toContent({ baz: 1 });
      result = await parseSetup(content);
      expect(result).to.be.empty;
    });
  });

  describe('keyword: dependentRequired', () => {
    it('single dependency', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        dependentRequired: { bar: ['foo'] },
      } as JSONSchema);

      // neither
      let content = toContent({});
      let result = await parseSetup(content);
      expect(result).to.be.empty;

      // nondependant
      content = toContent({ foo: 1 });
      result = await parseSetup(content);
      expect(result).to.be.empty;

      // with dependency
      content = toContent({ foo: 1, bar: 2 });
      result = await parseSetup(content);
      expect(result).to.be.empty;

      // missing dependency
      content = toContent({ bar: 2 });
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Object is missing property foo required by property bar.');

      // ignores arrays
      content = toContent(['bar']);
      result = await parseSetup(content);
      expect(result).to.be.empty;

      // ignores strings
      content = toContent('foobar');
      result = await parseSetup(content);
      expect(result).to.be.empty;

      // ignores other non-objects
      content = toContent(12);
      result = await parseSetup(content);
      expect(result).to.be.empty;
    });

    it('empty dependents', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        dependentRequired: { bar: [] },
      } as JSONSchema);

      // empty object
      let content = toContent({});
      let result = await parseSetup(content);
      expect(result).to.be.empty;

      // object with one property
      content = toContent({ bar: 2 });
      result = await parseSetup(content);
      expect(result).to.be.empty;

      // non-object is valid
      content = toContent(1);
      result = await parseSetup(content);
      expect(result).to.be.empty;
    });

    it('multiple dependents required', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        dependentRequired: { quux: ['foo', 'bar'] },
      } as JSONSchema);

      // neither
      let content = toContent({});
      let result = await parseSetup(content);
      expect(result).to.be.empty;

      // nondependants
      content = toContent({ foo: 1, bar: 2 });
      result = await parseSetup(content);
      expect(result).to.be.empty;

      // with dependencies
      content = toContent({ foo: 1, bar: 2, quux: 3 });
      result = await parseSetup(content);
      expect(result).to.be.empty;

      // missing dependency
      content = toContent({ foo: 1, quux: 2 });
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Object is missing property bar required by property quux.');

      // missing other dependency
      content = toContent({ bar: 1, quux: 2 });
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Object is missing property foo required by property quux.');

      // missing both dependencies
      content = toContent({ quux: 1 });
      result = await parseSetup(content);
      expect(result).to.have.length(2);
      expect(result[0].message).to.include('Object is missing property foo required by property quux.');
      expect(result[1].message).to.include('Object is missing property bar required by property quux.');
    });

    it('dependencies with escaped characters', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        dependentRequired: {
          'foo\nbar': ['foo\rbar'],
          'foo"bar': ["foo'bar"],
        },
      } as JSONSchema);

      // CRLF
      let content = toContent({
        'foo\nbar': 1,
        'foo\rbar': 2,
      });
      let result = await parseSetup(content);
      expect(result).to.be.empty;

      // quoted quotes
      content = toContent({
        "foo'bar": 1,
        'foo"bar': 2,
      });
      result = await parseSetup(content);
      expect(result).to.be.empty;

      // CRLF missing dependent
      content = toContent({
        'foo\nbar': 1,
        foo: 2,
      });
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Object is missing property foo\rbar required by property foo\nbar.');

      // quoted quotes missing dependent
      content = toContent({
        'foo"bar': 2,
      });
      result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Object is missing property foo\'bar required by property foo"bar.');
    });
  });
});
