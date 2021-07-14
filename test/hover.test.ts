/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ServiceSetup } from './utils/serviceSetup';
import { SCHEMA_ID, setupLanguageService, setupSchemaIDTextDocument } from './utils/testHelper';
import { LanguageService } from '../src';
import * as assert from 'assert';
import { Hover, MarkupContent, Position } from 'vscode-languageserver';
import { LanguageHandlers } from '../src/languageserver/handlers/languageHandlers';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';
import { expect } from 'chai';

describe('Hover Tests', () => {
  let languageSettingsSetup: ServiceSetup;
  let languageHandler: LanguageHandlers;
  let languageService: LanguageService;
  let yamlSettings: SettingsState;

  before(() => {
    languageSettingsSetup = new ServiceSetup().withHover().withSchemaFileMatch({
      uri: 'http://google.com',
      fileMatch: ['bad-schema.yaml'],
    });
    const { languageService: langService, languageHandler: langHandler, yamlSettings: settings } = setupLanguageService(
      languageSettingsSetup.languageSettings
    );
    languageService = langService;
    languageHandler = langHandler;
    yamlSettings = settings;
  });

  afterEach(() => {
    languageService.deleteSchema(SCHEMA_ID);
  });

  describe('Hover', function () {
    function parseSetup(content: string, position): Promise<Hover> {
      const testTextDocument = setupSchemaIDTextDocument(content);
      yamlSettings.documents = new TextDocumentTestManager();
      (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
      return languageHandler.hoverHandler({
        position: testTextDocument.positionAt(position),
        textDocument: testTextDocument,
      });
    }

    it('Hover on key on root', async () => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          cwd: {
            type: 'string',
            description:
              'The directory from which bower should run. All relative paths will be calculated according to this setting.',
          },
        },
      });
      const content = 'cwd: test';
      const hover = await parseSetup(content, 1);

      assert.strictEqual(MarkupContent.is(hover.contents), true);
      assert.strictEqual((hover.contents as MarkupContent).kind, 'markdown');
      assert.strictEqual(
        (hover.contents as MarkupContent).value,
        `The directory from which bower should run\\. All relative paths will be calculated according to this setting\\.\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
    });

    it('Hover on value on root', async () => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          cwd: {
            type: 'string',
            description:
              'The directory from which bower should run. All relative paths will be calculated according to this setting.',
          },
        },
      });
      const content = 'cwd: test';
      const result = await parseSetup(content, 6);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual((result.contents as MarkupContent).kind, 'markdown');
      assert.strictEqual(
        (result.contents as MarkupContent).value,
        `The directory from which bower should run\\. All relative paths will be calculated according to this setting\\.\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
    });

    it('Hover on key with depth', async () => {
      languageService.addSchema(SCHEMA_ID, {
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
      const result = await parseSetup(content, 15);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual((result.contents as MarkupContent).kind, 'markdown');
      assert.strictEqual(
        (result.contents as MarkupContent).value,
        `A script to run after install\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
    });

    it('Hover on value with depth', async () => {
      languageService.addSchema(SCHEMA_ID, {
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
      const result = await parseSetup(content, 26);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual((result.contents as MarkupContent).kind, 'markdown');
      assert.strictEqual(
        (result.contents as MarkupContent).value,
        `A script to run after install\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
    });

    it('Hover works on both root node and child nodes works', async () => {
      languageService.addSchema(SCHEMA_ID, {
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
            description: 'Contains custom hooks used to trigger other automated tools',
          },
        },
      });
      const content = 'scripts:\n  postinstall: test';

      const firstHover = await parseSetup(content, 3);

      assert.strictEqual(MarkupContent.is(firstHover.contents), true);
      assert.strictEqual((firstHover.contents as MarkupContent).kind, 'markdown');
      assert.strictEqual(
        (firstHover.contents as MarkupContent).value,
        `Contains custom hooks used to trigger other automated tools\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );

      const secondHover = await parseSetup(content, 15);

      assert.strictEqual(MarkupContent.is(secondHover.contents), true);
      assert.strictEqual(
        (secondHover.contents as MarkupContent).value,
        `A script to run after install\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
    });

    it('Hover does not show results when there isnt description field', async () => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          analytics: {
            type: 'boolean',
          },
        },
      });
      const content = 'analytics: true';
      const result = await parseSetup(content, 3);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual((result.contents as MarkupContent).value, '');
    });

    it('Hover on first document in multi document', async () => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          analytics: {
            type: 'boolean',
          },
        },
      });
      const content = '---\nanalytics: true\n...\n---\njson: test\n...';
      const result = await parseSetup(content, 10);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual((result.contents as MarkupContent).value, '');
    });

    it('Hover on second document in multi document', async () => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          analytics: {
            type: 'boolean',
          },
          json: {
            type: 'string',
            description: 'A file path to the configuration file',
          },
        },
      });
      const content = '---\nanalytics: true\n...\n---\njson: test\n...';
      const result = await parseSetup(content, 30);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual(
        (result.contents as MarkupContent).value,
        `A file path to the configuration file\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
    });

    it('Hover should not return anything on key', async () => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {},
      });
      const content = 'my_unknown_hover: test';
      const result = await parseSetup(content, 1);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual((result.contents as MarkupContent).value, '');
    });

    it('Hover should not return anything on value', async () => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {},
      });
      const content = 'my_unknown_hover: test';
      const result = await parseSetup(content, 21);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual((result.contents as MarkupContent).value, '');
    });

    it('Hover works on array nodes', async () => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          authors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Full name of the author.',
                },
              },
            },
          },
        },
      });
      const content = 'authors:\n  - name: Josh';
      const result = await parseSetup(content, 14);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual(
        (result.contents as MarkupContent).value,
        `Full name of the author\\.\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
    });

    it('Hover works on additional array nodes', async () => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          authors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Full name of the author.',
                },
                email: {
                  type: 'string',
                  description: 'Email address of the author.',
                },
              },
            },
          },
        },
      });
      const content = 'authors:\n  - name: Josh\n  - email: jp';
      const result = await parseSetup(content, 28);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual(
        (result.contents as MarkupContent).value,
        `Email address of the author\\.\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
    });

    it('Hover on null property', async () => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          childObject: {
            type: 'object',
            description: 'should return this description',
          },
        },
      });
      const content = 'childObject: \n';
      const result = await parseSetup(content, 1);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual(
        (result.contents as MarkupContent).value,
        `should return this description\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
    });

    it('should work with bad schema', async () => {
      const doc = setupSchemaIDTextDocument('foo:\n bar', 'bad-schema.yaml');
      yamlSettings.documents = new TextDocumentTestManager();
      (yamlSettings.documents as TextDocumentTestManager).set(doc);
      const result = await languageHandler.hoverHandler({
        position: Position.create(0, 1),
        textDocument: doc,
      });

      expect(result).to.be.null;
    });
  });
});
