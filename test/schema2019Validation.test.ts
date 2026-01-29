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
  });

  describe('keyword: unevaluatedItems', () => {
    it('unevaluatedItems=false forbids tuple overflow items', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'array',
        items: [{ type: 'string' }],
        unevaluatedItems: false,
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = `- ok\n- 123`;
      const result = await parseSetup(content);
      console.log(JSON.stringify(schema, null, 2));
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too many items according to schema. Expected 1 or fewer.');
    });

    it('unevaluatedItems sees evaluated items across $ref/allOf', async () => {
      const base: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        $id: 'file:///base-array.json',
        type: 'array',
        items: [{ type: 'string' }],
      };
      const wrapper: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        allOf: [{ $ref: 'file:///base-array.json' }, { unevaluatedItems: false }],
      };
      schemaProvider.addSchemaWithUri(SCHEMA_ID, 'file:///base-array.json', base);
      schemaProvider.addSchemaWithUri(SCHEMA_ID, 'file:///wrapper-array.json', wrapper);
      const content = `# yaml-language-server: $schema=file:///wrapper-array.json\n- ok\n- 123`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too many items according to schema. Expected 1 or fewer.');
    });
  });

  describe('keyword: contains + minContains/maxContains', () => {
    afterEach(() => {
      schemaProvider.deleteSchema(SCHEMA_ID);
    });

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
});
