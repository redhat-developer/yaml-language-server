/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as path from 'path';
import { Hover, MarkupContent } from 'vscode-languageserver';
import { LanguageService } from '../src';
import { LanguageHandlers } from '../src/languageserver/handlers/languageHandlers';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';
import { ServiceSetup } from './utils/serviceSetup';
import { SCHEMA_ID, setupLanguageService, setupSchemaIDTextDocument } from './utils/testHelper';

describe('Hover Tests Detail', () => {
  let languageSettingsSetup: ServiceSetup;
  let languageHandler: LanguageHandlers;
  let languageService: LanguageService;
  let yamlSettings: SettingsState;

  before(() => {
    languageSettingsSetup = new ServiceSetup().withHover().withSchemaFileMatch({
      uri: 'http://google.com',
      fileMatch: ['bad-schema.yaml'],
    });
    const {
      languageService: langService,
      languageHandler: langHandler,
      yamlSettings: settings,
    } = setupLanguageService(languageSettingsSetup.languageSettings);
    languageService = langService;
    languageHandler = langHandler;
    yamlSettings = settings;
  });

  afterEach(() => {
    languageService.deleteSchema(SCHEMA_ID);
  });

  function parseSetup(content: string, position, customSchema?: string): Promise<Hover> {
    const testTextDocument = setupSchemaIDTextDocument(content, customSchema);
    yamlSettings.documents = new TextDocumentTestManager();
    (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
    return languageHandler.hoverHandler({
      position: testTextDocument.positionAt(position),
      textDocument: testTextDocument,
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const inlineObjectSchema = require(path.join(__dirname, './fixtures/testInlineObject.json'));

  it('AnyOf complex', async () => {
    languageService.addSchema(SCHEMA_ID, inlineObjectSchema);
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
    languageService.addSchema('dynamic-schema://schema.json', {
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
      languageService.addSchema(SCHEMA_ID, {
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
      languageService.addSchema(SCHEMA_ID, {
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
      languageService.addSchema(SCHEMA_ID, {
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
      languageService.addSchema(SCHEMA_ID, {
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
});
