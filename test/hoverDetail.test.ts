/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as chai from 'chai';
import * as path from 'path';
import { MarkupContent } from 'vscode-languageserver';
import { LanguageHandlers } from '../src/languageserver/handlers/languageHandlers';
import { YamlHoverDetailResult } from '../src/languageservice/services/yamlHoverDetail';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';
import { ServiceSetup } from './utils/serviceSetup';
import { SCHEMA_ID, TestCustomSchemaProvider, setupLanguageService, setupSchemaIDTextDocument } from './utils/testHelper';
const expect = chai.expect;

describe('Hover Tests Detail', () => {
  let languageSettingsSetup: ServiceSetup;
  let languageHandler: LanguageHandlers;
  let yamlSettings: SettingsState;
  let schemaProvider: TestCustomSchemaProvider;

  before(() => {
    languageSettingsSetup = new ServiceSetup().withHover().withSchemaFileMatch({
      uri: 'http://google.com',
      fileMatch: ['bad-schema.yaml'],
    });
    const {
      languageHandler: langHandler,
      yamlSettings: settings,
      schemaProvider: testSchemaProvider,
    } = setupLanguageService(languageSettingsSetup.languageSettings);
    languageHandler = langHandler;
    yamlSettings = settings;
    schemaProvider = testSchemaProvider;
  });

  afterEach(() => {
    schemaProvider.deleteSchema(SCHEMA_ID);
  });

  function parseSetup(content: string, position, customSchema?: string): Promise<YamlHoverDetailResult> {
    const testTextDocument = setupSchemaIDTextDocument(content, customSchema);
    yamlSettings.documents = new TextDocumentTestManager();
    (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
    return languageHandler.hoverHandler({
      position: testTextDocument.positionAt(position),
      textDocument: testTextDocument,
    }) as Promise<YamlHoverDetailResult>;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const inlineObjectSchema = require(path.join(__dirname, './fixtures/testInlineObject.json'));

  it('AnyOf complex', async () => {
    schemaProvider.addSchema(SCHEMA_ID, inlineObjectSchema);
    const content = 'nested:\n  scripts:\n    sample:\n      test:';
    const hover = await parseSetup(content, content.length - 2);
    const content2 = 'nested:\n  scripts:\n    sample:\n      test: \n';
    const hover2 = await parseSetup(content2, content.length - 4);
    // console.log((hover.contents as MarkupContent).value);
    // console.log((hover.contents as MarkupContent).value.replace(/`/g, '\\`'));
    assert.strictEqual(MarkupContent.is(hover.contents), true);
    assert.strictEqual((hover.contents as MarkupContent).kind, 'markdown');
    assert.strictEqual(
      (hover.contents as MarkupContent).value,
      `description of test

----
##
\`\`\`
test: \`const1\` | object | Expression | string | obj1
\`\`\``
    );
    // related to test 'Hover on null property in nested object'
    assert.notStrictEqual((hover2.contents as MarkupContent).value, '', 'hover does not work with new line');
    assert.strictEqual((hover.contents as MarkupContent).value, (hover2.contents as MarkupContent).value);
  });
  it('Source command', async () => {
    schemaProvider.addSchema('dynamic-schema://schema.json', {
      type: 'object',
      properties: {
        scripts: {
          type: 'object',
          properties: {
            postinstall: {
              type: 'string',
              description: 'A script to run after install',
            },
          },
        },
      },
    });
    const content = 'scripts:\n  postinstall: test';
    const result = await parseSetup(content, 26, 'dynamic-schema://schema.json');

    assert.strictEqual(MarkupContent.is(result.contents), true);
    assert.strictEqual((result.contents as MarkupContent).kind, 'markdown');
    assert.strictEqual((result.contents as MarkupContent).value, 'A script to run after install');
  });
  describe('Images', async () => {
    it('Image should be excluded', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          scripts: {
            type: 'object',
            markdownDescription: 'First img <img src=... />\nSecond image <img src="2"/>',
          },
        },
      });
      const content = 'scripts:\n  ';
      const result = await parseSetup(content, 1, SCHEMA_ID);

      assert.strictEqual((result.contents as MarkupContent).value.includes('<img'), false);
    });
    it('Image should be included', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          scripts: {
            type: 'object',
            markdownDescription: 'First img <img src=... />\nSecond image <img enableInHover src="2"/>',
          },
        },
      });
      const content = 'scripts:\n  ';
      const result = await parseSetup(content, 1, SCHEMA_ID);

      assert.strictEqual((result.contents as MarkupContent).value.includes('<img'), true);
    });
  });

  describe('Deprecated', async () => {
    it('Deprecated type should not be in the title', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          scripts: {
            anyOf: [
              {
                type: 'object',
                properties: {},
                title: 'obj1-deprecated',
                deprecationMessage: 'Deprecated',
              },
              {
                type: 'object',
                properties: {},
                title: 'obj2',
              },
            ],
          },
        },
      });
      const content = 'scripts:\n  ';
      const result = await parseSetup(content, 1, SCHEMA_ID);

      assert.strictEqual((result.contents as MarkupContent).value.includes('scripts: obj2\n'), true);
      assert.strictEqual((result.contents as MarkupContent).value.includes('obj1-deprecated'), false);
    });
    it('Deprecated prop should not be in the prop table', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          scripts: {
            type: 'object',
            properties: {
              prop1: {
                type: 'string',
              },
              prop2: {
                type: 'string',
                deprecationMessage: 'Deprecated',
              },
            },
          },
        },
      });
      const content = 'scripts:\n  ';
      const result = await parseSetup(content, 1, SCHEMA_ID);

      assert.strictEqual((result.contents as MarkupContent).value.includes('| prop1 |'), true);
      assert.strictEqual((result.contents as MarkupContent).value.includes('| prop2 |'), false);
    });
  });
  describe('Snippets for jsonata customization', async () => {
    it('Should hover info from snippet', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          jsonata: {
            type: 'string',
            defaultSnippets: [
              {
                label: '$sum',
                markdownDescription: '## `$sum()',
              },
            ],
          },
        },
      });
      const content = 'jsonata:\n  $sum';
      const result = await parseSetup(content, 1, SCHEMA_ID);

      assert.strictEqual((result.contents as MarkupContent).value, '## `$sum()');
    });
  });
  describe('Schema distinct', async () => {
    it('Should not remove slightly different schema ', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        anyOf: [
          {
            type: 'object',
            properties: {
              prop1: {
                type: 'string',
                description: 'description1',
                title: 'title1',
                const: 'const1',
              },
            },
          },
          {
            type: 'object',
            properties: {
              prop1: {
                type: 'string',
                description: 'description2',
                title: 'title2',
                const: 'const2',
              },
            },
          },
        ],
      });
      const content = 'prop1: test';
      const result = await parseSetup(content, 2, SCHEMA_ID);
      const value = (result.contents as MarkupContent).value;
      assert.equal(result.schemas.length, 2, 'should not remove schema');
      expect(value).includes("title1 'const1' | title2 'const2'", 'should have both titles and const');
      expect(value).includes('description1');
      expect(value).includes('description2');
    });
    it('Should remove schema duplicities for equal hover result', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        anyOf: [
          {
            type: 'object',
            properties: {
              scripts: {
                type: 'string',
                description: 'description',
                title: 'title',
              },
            },
          },
          {
            type: 'object',
            properties: {
              scripts: {
                type: 'string',
                description: 'description',
                title: 'title',
              },
            },
          },
        ],
      });
      const content = 'scripts: test';
      const result = await parseSetup(content, 2, SCHEMA_ID);
      const value = (result.contents as MarkupContent).value;
      assert.equal(result.schemas.length, 1, 'should have only single schema');
      assert.equal(
        value.split('\n').filter((l) => l.includes('description')).length,
        1,
        'should have only single description, received:\n' + value
      );
    });
    it('Should remove schema duplicities from $ref', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        definitions: {
          reusableType: {
            type: 'object',
            properties: {
              prop1: {
                type: 'string',
                description: 'description',
              },
            },
            title: 'title',
          },
        },
        anyOf: [
          {
            $ref: '#/definitions/reusableType',
          },
          {
            $ref: '#/definitions/reusableType',
          },
        ],
      });
      const content = 'prop1: test';
      const result = await parseSetup(content, 2, SCHEMA_ID);
      const value = (result.contents as MarkupContent).value;
      assert.equal(result.schemas.length, 1, 'should have only single schema');
      assert.equal(
        value.split('\n').filter((l) => l.includes('description')).length,
        1,
        'should have only single description, received:\n' + value
      );
    });

    it('Should remove schema duplicities from $ref $ref', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        definitions: {
          reusableType2: {
            type: 'object',
            title: 'title',
          },
          reusableType: {
            type: 'object',
            properties: {
              prop1: {
                $ref: '#/definitions/reusableType2',
              },
            },
          },
        },
        anyOf: [
          {
            $ref: '#/definitions/reusableType',
          },
          {
            $ref: '#/definitions/reusableType',
          },
        ],
      });
      const content = 'prop1: test';
      const result = await parseSetup(content, 2, SCHEMA_ID);
      const value = (result.contents as MarkupContent).value;
      assert.equal(result.schemas.length, 1, 'should have only single schema');
      assert.equal(
        value.split('\n').filter((l) => l.includes('title')).length,
        1,
        'should have only single reusableType, received:\n' + value
      );
    });
  });
  it('Hover on mustMatch(type) property without match', async () => {
    schemaProvider.addSchema(SCHEMA_ID, {
      anyOf: [
        {
          type: 'object',
          properties: {
            type: {
              const: 'const1',
              description: 'description1',
            },
          },
        },
        {
          type: 'object',
          properties: {
            type: {
              const: 'const2',
              description: 'description2',
            },
          },
        },
      ],
    });
    const content = 'type: ';
    const result = await parseSetup(content, 2, SCHEMA_ID);
    const value = (result.contents as MarkupContent).value;
    expect(value).includes("anyOf:  'const1' |  'const2'");
  });
});
