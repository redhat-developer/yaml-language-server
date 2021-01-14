/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ServiceSetup } from './utils/serviceSetup';
import { SCHEMA_ID, setupLanguageService, setupSchemaIDTextDocument } from './utils/testHelper';
import { LanguageService, MarkedString } from '../src';
import * as assert from 'assert';
import { Hover } from 'vscode-languageserver';
import { LanguageHandlers } from '../src/languageserver/handlers/languageHandlers';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';

suite('Hover Tests', () => {
  let languageSettingsSetup: ServiceSetup;
  let languageHandler: LanguageHandlers;
  let languageService: LanguageService;
  let yamlSettings: SettingsState;

  before(() => {
    languageSettingsSetup = new ServiceSetup().withHover();
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

    it('Hover on key on root', (done) => {
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
      const hover = parseSetup(content, 1);
      hover
        .then(function (result) {
          assert.equal((result.contents as string).length, 1);
          assert.equal(
            result.contents[0],
            'The directory from which bower should run\\. All relative paths will be calculated according to this setting\\.'
          );
        })
        .then(done, done);
    });

    it('Hover on value on root', (done) => {
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
      const hover = parseSetup(content, 6);
      hover
        .then(function (result) {
          assert.equal((result.contents as string).length, 1);
          assert.equal(
            result.contents[0],
            'The directory from which bower should run\\. All relative paths will be calculated according to this setting\\.'
          );
        })
        .then(done, done);
    });

    it('Hover on key with depth', (done) => {
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
      const hover = parseSetup(content, 15);
      hover
        .then(function (result) {
          assert.equal((result.contents as MarkedString[]).length, 1);
          assert.equal(result.contents[0], 'A script to run after install');
        })
        .then(done, done);
    });

    it('Hover on value with depth', (done) => {
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
      const hover = parseSetup(content, 26);
      hover
        .then(function (result) {
          assert.equal((result.contents as MarkedString[]).length, 1);
          assert.equal(result.contents[0], 'A script to run after install');
        })
        .then(done, done);
    });

    it('Hover works on both root node and child nodes works', (done) => {
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

      const firstHover = parseSetup(content, 3);
      firstHover.then(function (result) {
        assert.equal((result.contents as MarkedString[]).length, 1);
        assert.equal(result.contents[0].startsWith('Contains custom hooks used to trigger other automated tools'), true);
      });

      const secondHover = parseSetup(content, 15);
      secondHover
        .then(function (result) {
          assert.equal((result.contents as MarkedString[]).length, 1);
          assert.equal(result.contents[0], 'A script to run after install');
        })
        .then(done, done);
    });

    it('Hover does not show results when there isnt description field', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          analytics: {
            type: 'boolean',
          },
        },
      });
      const content = 'analytics: true';
      const hover = parseSetup(content, 3);
      hover
        .then(function (result) {
          assert.equal((result.contents as MarkedString[]).length, 1);
          assert.equal(result.contents[0], '');
        })
        .then(done, done);
    });

    it('Hover on first document in multi document', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          analytics: {
            type: 'boolean',
          },
        },
      });
      const content = '---\nanalytics: true\n...\n---\njson: test\n...';
      const hover = parseSetup(content, 10);
      hover
        .then(function (result) {
          assert.equal((result.contents as MarkedString[]).length, 1);
          assert.equal(result.contents[0], '');
        })
        .then(done, done);
    });

    it('Hover on second document in multi document', (done) => {
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
      const hover = parseSetup(content, 30);
      hover
        .then(function (result) {
          assert.equal((result.contents as MarkedString[]).length, 1);
          assert.equal(result.contents[0], 'A file path to the configuration file');
        })
        .then(done, done);
    });

    it('Hover should not return anything on key', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {},
      });
      const content = 'my_unknown_hover: test';
      const hover = parseSetup(content, 1);
      hover
        .then(function (result) {
          assert.equal((result.contents as MarkedString[]).length, 1);
          assert.equal(result.contents[0], '');
        })
        .then(done, done);
    });

    it('Hover should not return anything on value', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {},
      });
      const content = 'my_unknown_hover: test';
      const hover = parseSetup(content, 21);
      hover
        .then(function (result) {
          assert.equal((result.contents as MarkedString[]).length, 1);
          assert.equal(result.contents[0], '');
        })
        .then(done, done);
    });

    it('Hover works on array nodes', (done) => {
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
      const hover = parseSetup(content, 14);
      hover
        .then(function (result) {
          assert.notEqual((result.contents as MarkedString[]).length, 0);
          assert.equal(result.contents[0], 'Full name of the author\\.');
        })
        .then(done, done);
    });

    it('Hover works on additional array nodes', (done) => {
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
      const hover = parseSetup(content, 28);
      hover
        .then(function (result) {
          assert.notEqual((result.contents as MarkedString[]).length, 0);
          assert.equal(result.contents[0], 'Email address of the author\\.');
        })
        .then(done, done);
    });

    it('Hover on null property', (done) => {
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
      const hover = parseSetup(content, 1);
      hover
        .then(function (result) {
          assert.equal((result.contents as MarkedString[]).length, 1);
          assert.equal(result.contents[0].startsWith('should return this description'), true);
        })
        .then(done, done);
    });
  });
});
