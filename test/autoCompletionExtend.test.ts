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
import { addUniquePostfix, expressionSchemaName, removeUniquePostfix } from '../src/languageservice/services/yamlCompletion';
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

  function parseSetup(content: string, position: number, schemaName?: string): Promise<CompletionList> {
    const testTextDocument = setupSchemaIDTextDocument(content, schemaName);
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
  function parseCaret(content: string, schemaName?: string): Promise<CompletionList> {
    const { position, content: content2 } = caretPosition(content);

    const testTextDocument = setupSchemaIDTextDocument(content2, schemaName);
    yamlSettings.documents = new TextDocumentTestManager();
    (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
    return languageHandler.completionHandler({
      position: testTextDocument.positionAt(position),
      textDocument: testTextDocument,
    });
  }

  function ensureExpressionSchema(): void {
    schemaProvider.addSchema('expression-schema', {
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
    it('should allow OR in filePatternAssociation for jigx files', async () => {
      const schemaName = 'folder/test.jigx';
      const schema = {
        type: 'object',
        title: 'basket',
        properties: {
          name: { type: 'string' },
        },
        if: {
          filePatternAssociation: 'folder/*.jigx$|test2.jigx',
        },
        then: {
          properties: {
            name: { enum: ['val1', 'val2'] },
          },
        },
      };
      schemaProvider.addSchema(schemaName, schema);
      const content = 'name:';
      const completion = await parseSetup(content, content.length, schemaName);
      expect(completion.items.map((i) => i.label)).to.deep.equal(['val1', 'val2']);
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
  describe('Allow schemas based on mustMatch properties', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        options: {
          anyOf: [
            {
              type: 'object',
              properties: {
                provider: { type: 'string', const: 'test1' },
                entity: { type: 'string', const: 'entity1' },
              },
              required: ['provider'],
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
    it('Should also suggest less possible schema even if the second schema looks better', async () => {
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = 'options:\n  provider: |\n|  entity: entityX\n';
      const completion = await parseCaret(content);

      expect(completion.items.map((i) => i.insertText)).deep.equal(['test1', 'testX']);
    });
    describe('mustMatchSchemas equivalent to our specific  and generic providers', () => {
      // schema should be similar to ProviderExecuteOptions = OneDriveProviderExecuteOptions | GenericProviderExecuteOptions
      const optionGeneric = {
        type: 'object',
        properties: {
          provider: {
            anyOf: [
              { type: 'string', enum: ['test1', 'test2'] },
              {
                type: 'string',
                pattern: '^=.*',
              },
            ],
          },
          method: { type: 'string', enum: ['create', 'delete'] },
          entity: { type: 'string' },
          data: { type: 'object', additionalProperties: true },
        },
        required: ['provider', 'method'],
        title: 'generic',
      };
      const optionSpecific = {
        type: 'object',
        properties: {
          provider: { type: 'string', const: 'testX' },
          method: { type: 'string', enum: ['create', 'delete'] },
          entity: { type: 'string', const: 'entityX' },
          data: {
            type: 'object',
            properties: {
              dataProp: { type: 'string' },
            },
            required: ['dataProp'],
          },
        },
        title: 'specific',
        required: ['entity', 'provider', 'method', 'data'],
      };

      it('Will add both schemas into mustMachSchemas, but it should give only one correct option - specific first', async () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            options: {
              anyOf: [optionSpecific, optionGeneric],
            },
          },
        };
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = 'options:\n  provider: testX\n  entity: |\n|';
        const completion = await parseCaret(content);
        expect(completion.items.map((i) => i.insertText)).deep.equal(['entityX']);
      });
      it('Will add both schemas into mustMachSchemas, but it should give only one correct option - generic first', async () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            options: {
              anyOf: [optionGeneric, optionSpecific],
            },
          },
        };
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = 'options:\n  provider: testX\n  entity: |\n|';
        const completion = await parseCaret(content);
        expect(completion.items.map((i) => i.insertText)).deep.equal(['entityX']);
      });
      it('Should suggest correct data prop for "onedrive simulation"', async () => {
        const optionFirstAlmostGood = {
          type: 'object',
          properties: {
            provider: { type: 'string', const: 'testX' },
          },
          title: 'almost good',
          required: ['provider'],
        };
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            options: {
              anyOf: [optionFirstAlmostGood, optionSpecific, optionGeneric],
            },
          },
        };
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = 'options:\n  provider: testX\n  method: create\n  |\n|';
        const completion = await parseCaret(content);
        expect(completion.items.map((i) => i.label)).deep.equal(['entity', 'specific', 'data'], 'outside data');

        const content2 = 'options:\n  provider: testX\n  method: create\n  data:\n  |\n|';
        const completion2 = await parseCaret(content2);
        expect(completion2.items.map((i) => i.label)).deep.equal(['dataProp', 'object(specific)'], 'inside data');
      });
    });
    describe('Distinguish between component.list and component.list-item', () => {
      const schema: JSONSchema = {
        anyOf: [
          {
            type: 'object',
            properties: {
              type: { type: 'string', const: 'component.list' },
              options: {
                properties: { listProp: { type: 'string' } },
              },
            },
            required: ['type'],
          },

          {
            type: 'object',
            properties: {
              type: { type: 'string', const: 'component.list-item' },
              options: {
                properties: { itemProp: { type: 'string' } },
              },
            },
            required: ['type'],
          },
        ],
      };
      it('Should suggest both alternatives of mustMatch property', async () => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = 'type: component.list|\n|';
        const completion = await parseCaret(content);

        expect(completion.items.map((i) => i.label)).deep.equal(['component.list', 'component.list-item']);
      });
      it('Should suggest both alternatives of mustMatch property', async () => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = 'type: component.list|\n|options:\n  another: test\n';
        const completion = await parseCaret(content);

        expect(completion.items.map((i) => i.label)).deep.equal(['component.list', 'component.list-item']);
      });
      it('Should suggest only props from strict match of mustMatch property', async () => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = 'type: component.list\noptions:\n  another: test\n  |\n|';
        const completion = await parseCaret(content);

        expect(completion.items.map((i) => i.label)).deep.equal(['listProp']);
      });
    });
    describe('Nested anyOf - component.section, component.list, component.list-item', () => {
      const schema: JSONSchema = {
        anyOf: [
          {
            anyOf: [
              {
                type: 'object',
                properties: {
                  type: { type: 'string', const: 'component.list' },
                  options: { properties: { listProp: { type: 'string' } } },
                },
                required: ['type'],
              },
              {
                anyOf: [
                  {
                    type: 'object',
                    properties: {
                      type: { type: 'string', const: 'component.avatar' },
                      options: { properties: { avatarProp: { type: 'string' } } },
                    },
                    required: ['type', 'options'],
                  },
                  {
                    type: 'object',
                    properties: {
                      type: { type: 'string', const: 'component.list-item' },
                      options: { properties: { itemProp: { type: 'string' } } },
                    },
                    required: ['type'],
                  },
                ],
              },
            ],
          },
          {
            type: 'object',
            properties: {
              type: { type: 'string', const: 'component.section' },
              options: { properties: { sectionProp: { type: 'string' } } },
            },
            required: ['type'],
          },
        ],
      };
      it('Should suggest all types - when nested', async () => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = 'type: component.|\n|';
        const completion = await parseCaret(content);

        expect(completion.items.map((i) => i.label)).deep.equal([
          'component.list',
          'component.avatar',
          'component.list-item',
          'component.section',
        ]);
      });
      it('Should suggest all types - when nested - different order', async () => {
        schemaProvider.addSchema(SCHEMA_ID, { anyOf: [schema.anyOf[1], schema.anyOf[0]] });
        const content = 'type: component.|\n|';
        const completion = await parseCaret(content);

        expect(completion.items.map((i) => i.label)).deep.equal([
          'component.section',
          'component.list',
          'component.avatar',
          'component.list-item',
        ]);
      });
    });
  });
  describe('Chain of single properties', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        prop1: {
          type: 'object',
          properties: {
            prop2: {
              type: 'object',
              properties: {
                prop3: {
                  type: 'object',
                  properties: {
                    prop4: {
                      type: 'object',
                    },
                  },
                  required: ['prop4'],
                },
              },
              required: ['prop3'],
            },
          },
          required: ['prop2'],
        },
      },
      required: ['prop1'],
    };
    it('should suggest chain of properties - without parent intellisense', async () => {
      // `expression` schema is important because client will use it to get completion
      schemaProvider.addSchema(expressionSchemaName, schema);
      const content = 'prop1:\n | |';
      const completion = await parseCaret(content, expressionSchemaName);
      expect(completion.items.length).to.be.equal(1);
      expect(completion.items[0].insertText).equal('prop2:\n  prop3:\n    prop4:\n      ');
    });
  });
});
