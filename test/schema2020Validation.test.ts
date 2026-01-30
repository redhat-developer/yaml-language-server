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

  describe('keyword: prefixItems + items', () => {
    describe('Open tuple', () => {
      beforeEach(() => {
        schemaProvider.addSchema(SCHEMA_ID, {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'array',
          prefixItems: [{ type: 'string' }, { type: 'number' }],
        } as JSONSchema);
      });
      it('allows extra items by default (items is unconstrained)', async () => {
        const content = `- hello
- 123
- { totally: "anything" }`;
        const result = await parseSetup(content);
        expect(result).to.be.empty;
      });
      it('fails when a prefixItems position has the wrong type', async () => {
        const content = `- 123\n- hello`;
        const result = await parseSetup(content);
        expect(result).to.have.length(2);
        expect(result[0].message).to.include('Incorrect type');
        expect(result[0].message).to.include('string');
        expect(result[1].message).to.include('Incorrect type');
        expect(result[1].message).to.include('number');
      });
    });

    describe('Closed tuple', () => {
      beforeEach(() => {
        schemaProvider.addSchema(SCHEMA_ID, {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'array',
          prefixItems: [{ type: 'string' }, { type: 'number' }],
          items: false,
        } as JSONSchema);
      });
      it('forbids extra items after prefixItems', async () => {
        const content = `- hello\n- 123\n- extra`;
        const result = await parseSetup(content);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Array has too many items according to schema. Expected 2 or fewer.');
      });
      it('passes when length is within prefixItems', async () => {
        const content = `- hello\n- 123`;
        const result = await parseSetup(content);
        expect(result).to.be.empty;
      });
    });

    describe('Tuple with constrained extra items', () => {
      beforeEach(() => {
        schemaProvider.addSchema(SCHEMA_ID, {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'array',
          prefixItems: [{ type: 'string' }, { type: 'number' }],
          items: { type: 'boolean' },
        } as JSONSchema);
      });
      it('fails when an extra item does not match items schema', async () => {
        const content = `- hello
- 123
- notBoolean`;
        const result = await parseSetup(content);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Incorrect type');
        expect(result[0].message).to.include('boolean');
      });
      it('passes when extra items match items schema', async () => {
        const content = `- hello
- 123
- true
- false`;
        const result = await parseSetup(content);
        expect(result).to.be.empty;
      });
    });
  });

  describe('contains and unevaluatedItems tests', () => {
    beforeEach(() => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'array',
        contains: { type: 'string' },
        unevaluatedItems: { type: 'number' },
      } as JSONSchema);
    });
    it('passes when there is at least one string and all non-matching items are numbers', async () => {
      const content = `- hello
- 1
- 2`;
      const result = await parseSetup(content);
      expect(result).to.be.empty;
    });
    it('passes even if multiple items are strings (strings match contains => evaluated)', async () => {
      const content = `- hello
- oops
- 3`;
      const result = await parseSetup(content);
      expect(result).to.be.empty;
    });
    it('fails if a non-matching item is not a number', async () => {
      const content = `- hello\n- a: 1`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Incorrect type');
      expect(result[0].message).to.include('number');
    });
    it('fails if no item matches contains (minContains defaults to 1)', async () => {
      const content = `- 1\n- 2`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too few items matching');
      expect(result[0].message).to.include('contains');
      expect(result[0].message).to.include('Expected 1 or more');
    });
  });
  it('passes ["a","b","ccc"] because "ccc" is evaluated by contains', async () => {
    schemaProvider.addSchema(SCHEMA_ID, {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'string' }],
      contains: { type: 'string', minLength: 3 },
      unevaluatedItems: false,
    } as JSONSchema);
    const content = `- a
- b
- ccc`;
    const result = await parseSetup(content);
    expect(result).to.be.empty;
  });
  it('fails ["a","b","ccc"] using boolean-algebra workaround', async () => {
    schemaProvider.addSchema(SCHEMA_ID, {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'string' }],
      not: {
        items: {
          not: { type: 'string', minLength: 3 },
        },
      },
      unevaluatedItems: false,
    } as JSONSchema);
    const content = `- a
- b
- ccc`;
    const result = await parseSetup(content);
    expect(result).to.not.be.empty;
    expect(result[0].message).to.include('Array has too many items according to schema. Expected 2 or fewer.');
  });

  describe('Mixed dialect subschema instance validation in Compound Schema Document', () => {
    it('draft-2020 root with draft-04 subschema', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          age: {
            allOf: [
              {
                $schema: 'http://json-schema.org/draft-04/schema#',
                type: 'number',
                minimum: 0,
                exclusiveMinimum: true,
              },
            ],
          },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const failResult = await parseSetup('age: 0');
      expect(failResult).to.have.length(1);
      expect(failResult[0].message).to.include('exclusive minimum of 0');
      const passResult = await parseSetup('age: 1');
      expect(passResult).to.be.empty;
    });

    it('draft-2020 root with draft-07 subschema', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          score: {
            anyOf: [
              {
                $schema: 'http://json-schema.org/draft-07/schema#',
                type: 'number',
                exclusiveMinimum: 0,
              },
            ],
          },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const failResult = await parseSetup('score: 0');
      expect(failResult).to.have.length(1);
      expect(failResult[0].message).to.include('exclusive minimum of 0');
      const passResult = await parseSetup('score: 1');
      expect(passResult).to.be.empty;
    });

    it('draft-07 root with draft-2019 subschema', async () => {
      const schema: JSONSchema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        required: ['productId'],
        properties: {
          productId: { type: 'string' },
          metadata: {
            $schema: 'https://json-schema.org/draft/2019-09/schema',
            type: 'object',
            properties: {
              tags: {
                type: 'array',
                contains: { type: 'string' },
                maxContains: 5,
              },
            },
          },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const failContent = `productId: "PROD-123"
metadata:
  tags:
    - "electronics"
    - "sale"
    - "featured"
    - "new"
    - "popular"
    - "trending"`;
      const failResult = await parseSetup(failContent);
      expect(failResult).to.have.length(1);
      expect(failResult[0].message).to.include('too many items matching "contains"');
      expect(failResult[0].message).to.include('5 or fewer');
      const passContent = `productId: "PROD-123"
metadata:
  tags:
    - "electronics"
    - "sale"
    - "featured"
    - "new"
    - "popular"`;
      const passResult = await parseSetup(passContent);
      expect(passResult).to.be.empty;
    });
  });
});
