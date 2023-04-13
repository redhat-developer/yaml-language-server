/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { CompletionList } from 'vscode-languageserver/node';
import { LanguageHandlers } from '../src/languageserver/handlers/languageHandlers';
import { LanguageService } from '../src/languageservice/yamlLanguageService';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';
import { ServiceSetup } from './utils/serviceSetup';
import { SCHEMA_ID, setupLanguageService, setupSchemaIDTextDocument } from './utils/testHelper';
import assert = require('assert');
import { expect } from 'chai';
import { createExpectedCompletion } from './utils/verifyError';

describe('Auto Completion Tests Extended', () => {
  let languageSettingsSetup: ServiceSetup;
  let languageService: LanguageService;
  let languageHandler: LanguageHandlers;
  let yamlSettings: SettingsState;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const inlineObjectSchema = require(path.join(__dirname, './fixtures/testInlineObject.json'));

  before(() => {
    languageSettingsSetup = new ServiceSetup().withCompletion().withSchemaFileMatch({
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
    ensureExpressionSchema();
  });

  function parseSetup(content: string, position: number): Promise<CompletionList> {
    const testTextDocument = setupSchemaIDTextDocument(content);
    yamlSettings.documents = new TextDocumentTestManager();
    (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
    return languageHandler.completionHandler({
      position: testTextDocument.positionAt(position),
      textDocument: testTextDocument,
    });
  }

  function ensureExpressionSchema(): void {
    languageService.addSchema('expression', {
      properties: {
        expression: {
          ...inlineObjectSchema.definitions.Expression,
        },
      },
    });
  }

  afterEach(() => {
    languageService.deleteSchema(SCHEMA_ID);
    languageService.configure(languageSettingsSetup.languageSettings);
    ensureExpressionSchema();
  });

  describe('Complex completion', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const inlineObjectSchema = require(path.join(__dirname, './fixtures/testInlineObject.json'));

    it('nested completion - no space after :', async () => {
      languageService.addSchema(SCHEMA_ID, inlineObjectSchema);
      const content = 'nested:\n  scripts:\n    sample:\n      test:';
      const result = await parseSetup(content, content.length);

      expect(result.items.length).to.be.equal(6);
      expect(result.items[0]).to.deep.equal(
        createExpectedCompletion('const1', ' const1', 3, 11, 3, 11, 12, 2, {
          documentation: undefined,
        })
      );
      expect(result.items[1]).to.deep.equal(
        createExpectedCompletion('list', '\n  list: ', 3, 11, 3, 11, 10, 2, {
          documentation: '',
        })
      );
      expect(result.items[2]).to.deep.equal(
        createExpectedCompletion('parent', '\n  parent: ', 3, 11, 3, 11, 10, 2, {
          documentation: '',
        })
      );
      expect(result.items[3]).to.deep.equal(
        createExpectedCompletion('=@ctx', '\n  =@ctx:\n    ', 3, 11, 3, 11, 10, 2, {
          documentation: '',
        })
      );
      expect(result.items[4]).to.deep.equal(
        createExpectedCompletion('objA', '\n  objA:\n    propI: ', 3, 11, 3, 11, 10, 2, {
          documentation: 'description of the parent prop',
        })
      );
      expect(result.items[5]).to.deep.equal(
        createExpectedCompletion('obj1', '\n  objA:\n    propI: ', 3, 11, 3, 11, 10, 2, {
          documentation: {
            kind: 'markdown',
            value: 'description of obj1\n\n----\n\n```yaml\nobjA:\n  propI: \n```',
          },
          sortText: '_obj1',
          kind: 7,
        })
      );
    });
    it('nested completion - space after : ', async () => {
      languageService.addSchema(SCHEMA_ID, inlineObjectSchema);
      const content = 'nested:\n  scripts:\n    sample:\n      test: ';
      const result = await parseSetup(content, content.length);

      expect(result.items.length).to.be.equal(6);
      expect(result.items[0]).to.deep.equal(
        createExpectedCompletion('const1', 'const1', 3, 12, 3, 12, 12, 2, {
          documentation: undefined,
        })
      );
      expect(result.items[1]).to.deep.equal(
        createExpectedCompletion('list', '\n  list: ', 3, 12, 3, 12, 10, 2, {
          documentation: '',
        })
      );
      expect(result.items[2]).to.deep.equal(
        createExpectedCompletion('parent', '\n  parent: ', 3, 12, 3, 12, 10, 2, {
          documentation: '',
        })
      );
      expect(result.items[3]).to.deep.equal(
        createExpectedCompletion('=@ctx', '\n  =@ctx:\n    ', 3, 12, 3, 12, 10, 2, {
          documentation: '',
        })
      );
      expect(result.items[4]).to.deep.equal(
        createExpectedCompletion('objA', '\n  objA:\n    propI: ', 3, 12, 3, 12, 10, 2, {
          documentation: 'description of the parent prop',
        })
      );
      expect(result.items[5]).to.deep.equal(
        createExpectedCompletion('obj1', '\n  objA:\n    propI: ', 3, 12, 3, 12, 10, 2, {
          documentation: {
            kind: 'markdown',
            value: 'description of obj1\n\n----\n\n```yaml\nobjA:\n  propI: \n```',
          },
          sortText: '_obj1',
          kind: 7,
        })
      );

      const content2 = 'nested:\n  scripts:\n    sample:\n      test:   ';
      const result2 = await parseSetup(content, content2.length - 2);
      expect(result).to.deep.equal(result2);
    });

    it('nested completion - some newLine after : ', async () => {
      languageService.addSchema(SCHEMA_ID, inlineObjectSchema);
      const content = 'nested:\n  scripts:\n    sample:\n      test:\n        ';
      const result = await parseSetup(content + '\nnewLine: test', content.length);

      expect(result.items.length).to.be.equal(5);
      expect(result.items[0]).to.deep.equal(
        createExpectedCompletion('list', 'list: ', 4, 8, 4, 8, 10, 2, {
          documentation: '',
        })
      );
      expect(result.items[1]).to.deep.equal(
        createExpectedCompletion('parent', 'parent: ', 4, 8, 4, 8, 10, 2, {
          documentation: '',
        })
      );
      expect(result.items[2]).to.deep.equal(
        createExpectedCompletion('=@ctx', '=@ctx:\n  ', 4, 8, 4, 8, 10, 2, {
          documentation: '',
        })
      );
      expect(result.items[3]).to.deep.equal(
        createExpectedCompletion('objA', 'objA:\n  propI: ', 4, 8, 4, 8, 10, 2, {
          documentation: 'description of the parent prop',
        })
      );
      expect(result.items[4]).to.deep.equal(
        createExpectedCompletion('obj1', 'objA:\n  propI: ', 4, 8, 4, 8, 10, 2, {
          documentation: {
            kind: 'markdown',
            value: 'description of obj1\n\n----\n\n```yaml\nobjA:\n  propI: \n```',
          },
          sortText: '_obj1',
          kind: 7,
        })
      );
    });
    describe('array completion', () => {
      it('array completion - should suggest only one const', async () => {
        languageService.addSchema(SCHEMA_ID, {
          type: 'object',
          properties: {
            test: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  objA: {
                    type: 'object',
                  },
                  constProp: {
                    type: 'string',
                    const: 'const1',
                  },
                },
              },
            },
          },
        });
        const content = 'test:\n  - constProp: ';
        const result = await parseSetup(content, content.length);

        expect(result.items.length).to.be.equal(1);
        expect(result.items[0]).to.deep.equal(
          createExpectedCompletion('const1', 'const1', 1, 15, 1, 15, 12, 2, {
            documentation: undefined,
          })
        );
      });
      it('array completion - should suggest correct indent', async () => {
        languageService.addSchema(SCHEMA_ID, {
          type: 'object',
          properties: {
            test: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  objA: {
                    type: 'object',
                    properties: {
                      objAA: {
                        type: 'object',
                      },
                    },
                  },
                },
              },
            },
          },
        });
        const content = 'test:\n  - objA: ';
        const result = await parseSetup(content, content.length);

        expect(result.items.length).to.be.equal(1);

        expect(result.items[0]).to.deep.equal(
          createExpectedCompletion('objAA', '\n    objAA:\n      ', 1, 10, 1, 10, 10, 2, {
            documentation: '',
          })
        );
      });
    });
  });

  describe('if/then/else completion', () => {
    it('should not suggest prop from if statement', async () => {
      const schema = {
        id: 'test://schemas/main',
        if: {
          properties: {
            foo: {
              const: 'bar',
            },
          },
        },
        then: {},
      };
      languageService.addSchema(SCHEMA_ID, schema);
      const content = '';
      const completion = await parseSetup(content, content.length);
      assert.equal(completion.items.length, 0);
    });
  });

  describe('completion of array', () => {
    it('should suggest when no hypen (-)', async () => {
      const schema = {
        type: 'object',
        properties: {
          actions: {
            type: 'array',
            items: {
              type: 'array',
              items: {
                type: 'string',
                defaultSnippets: [
                  {
                    label: 'My array item',
                    body: { item1: '$1' },
                  },
                ],
              },
            },
          },
        },
      };
      languageService.addSchema(SCHEMA_ID, schema);
      const content = 'actions:\n  ';
      const completion = await parseSetup(content, content.length);
      assert.equal(completion.items.length, 1);
    });
  });
});
