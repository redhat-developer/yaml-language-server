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

import {
  SCHEMA_ID,
  caretPosition,
  setupLanguageService,
  setupSchemaIDTextDocument,
  TestCustomSchemaProvider,
} from './utils/testHelper';
import assert = require('assert');
import { expect } from 'chai';
import { createExpectedCompletion } from './utils/verifyError';
import { addUniquePostfix, removeUniquePostfix } from '../src/languageservice/services/yamlCompletion';
import { JSONSchema } from 'vscode-json-languageservice';

describe('Auto Completion Tests Extended', () => {
  let languageSettingsSetup: ServiceSetup;
  let languageService: LanguageService;
  let languageHandler: LanguageHandlers;
  let yamlSettings: SettingsState;
  let schemaProvider: TestCustomSchemaProvider;

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
      schemaProvider: testSchemaProvider,
    } = setupLanguageService(languageSettingsSetup.languageSettings);
    languageService = langService;
    languageHandler = langHandler;
    yamlSettings = settings;
    schemaProvider = testSchemaProvider;
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

  /**
   * Generates a completion list for the given document and caret (cursor) position.
   * @param content The content of the document.
   * The caret is located in the content using `|` bookends.
   * For example, `content = 'ab|c|d'` places the caret over the `'c'`, at `position = 2`
   * @returns A list of valid completions.
   */
  function parseCaret(content: string): Promise<CompletionList> {
    const { position, content: content2 } = caretPosition(content);

    const testTextDocument = setupSchemaIDTextDocument(content2);
    yamlSettings.documents = new TextDocumentTestManager();
    (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
    return languageHandler.completionHandler({
      position: testTextDocument.positionAt(position),
      textDocument: testTextDocument,
    });
  }

  function ensureExpressionSchema(): void {
    schemaProvider.addSchema('expression', {
      properties: {
        expression: {
          ...inlineObjectSchema.definitions.Expression,
        },
      },
    });
  }

  afterEach(() => {
    schemaProvider.deleteSchema(SCHEMA_ID);
    languageService.configure(languageSettingsSetup.languageSettings);
    ensureExpressionSchema();
  });

  describe('Complex completion', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const inlineObjectSchema = require(path.join(__dirname, './fixtures/testInlineObject.json'));

    it('nested completion - no space after :', async () => {
      schemaProvider.addSchema(SCHEMA_ID, inlineObjectSchema);
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
      schemaProvider.addSchema(SCHEMA_ID, inlineObjectSchema);
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
      schemaProvider.addSchema(SCHEMA_ID, inlineObjectSchema);
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
        schemaProvider.addSchema(SCHEMA_ID, {
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
        schemaProvider.addSchema(SCHEMA_ID, {
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
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = '';
      const completion = await parseSetup(content, content.length);
      assert.equal(completion.items.length, 0);
    });
  });

  describe('Conditional Schema without space after colon', () => {
    const schema = {
      type: 'object',
      title: 'basket',
      properties: {
        name: { type: 'string' },
      },
      if: {
        filePatternAssociation: SCHEMA_ID,
      },
      then: {
        properties: {
          name: { enum: ['val1', 'val2'] },
        },
      },
    };
    it('should use filePatternAssociation when _tmp_ filename is used', async () => {
      schema.if.filePatternAssociation = SCHEMA_ID;
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = 'name:';
      const completion = await parseSetup(content, content.length);
      expect(completion.items.map((i) => i.label)).to.deep.equal(['val1', 'val2']);
    });
    it('should create unique tmp address for SCHEMA_ID (default_schema_id.yaml)', () => {
      const uri = addUniquePostfix(SCHEMA_ID);
      expect(uri.startsWith('_tmp_')).to.be.true;
      expect(uri.endsWith('/' + SCHEMA_ID)).to.be.true;
      expect(removeUniquePostfix(uri)).to.equal(SCHEMA_ID);
    });
    it('should create unique tmp address', () => {
      const origUri = 'User:/a/b/file.jigx';
      const uri = addUniquePostfix(origUri);
      expect(uri.includes('/_tmp_')).to.be.true;
      expect(uri.endsWith('/file.jigx')).to.be.true;
      expect(removeUniquePostfix(uri)).to.equal(origUri);
    });
  });

  describe('completion of array', () => {
    it('should suggest when no hyphen (-)', async () => {
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
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = 'actions:\n  ';
      const completion = await parseSetup(content, content.length);
      assert.equal(completion.items.length, 1);
    });
    it('should suggest when no hyphen (-) just after the colon', async () => {
      const schema = {
        type: 'object',
        properties: {
          actions: {
            type: 'array',
            items: {
              enum: ['a', 'b', 'c'],
            },
          },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = 'actions:';
      const completion = await parseSetup(content, content.length);
      assert.equal(completion.items.length, 3);
    });
  });

  describe('Alternatives anyOf with const and enums', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        options: {
          anyOf: [
            {
              type: 'object',
              properties: {
                provider: {
                  anyOf: [{ type: 'string', const: 'test1' }, { type: 'string' }],
                },
                entity: { type: 'string', const: 'entity1' },
              },
              required: ['entity', 'provider'],
            },
            {
              type: 'object',
              properties: {
                provider: { type: 'string', const: 'testX' },
                entity: { type: 'string', const: 'entityX' },
              },
              required: ['entity', 'provider'],
            },
          ],
        },
      },
    };
    it('Nested anyOf const should return only the first alternative because second const (anyOf[1].const) is not valid', async () => {
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = 'options:\n  provider: "some string valid with anyOf[0]"\n  entity: f|\n|';
      const completion = await parseCaret(content);

      expect(completion.items.map((i) => i.insertText)).deep.equal(['entity1']);
    });
    it('Nested anyOf const should return only the first alternative because second const (anyOf[1].const) is not valid - (with null value)', async () => {
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = 'options:\n  provider: "some string valid only by anyOf[0]"\n  entity: |\n|';
      const completion = await parseCaret(content);

      expect(completion.items.map((i) => i.insertText)).deep.equal(['entity1']);
    });
  });
});
