/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompletionItemKind, CompletionList, InsertTextFormat, Position, Range } from 'vscode-languageserver-types';
import { LanguageHandlers } from '../src/languageserver/handlers/languageHandlers';
import { LanguageService } from '../src/languageservice/yamlLanguageService';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';
import { ServiceSetup } from './utils/serviceSetup';
import {
  caretPosition,
  SCHEMA_ID,
  setupLanguageService,
  setupSchemaIDTextDocument,
  TestCustomSchemaProvider,
} from './utils/testHelper';
import { expect } from 'chai';
import { createExpectedCompletion } from './utils/verifyError';
import * as path from 'path';
import { JSONSchema } from './../src/languageservice/jsonSchema';

describe('Auto Completion Fix Tests', () => {
  let languageSettingsSetup: ServiceSetup;
  let languageService: LanguageService;
  let languageHandler: LanguageHandlers;
  let yamlSettings: SettingsState;
  let schemaProvider: TestCustomSchemaProvider;
  before(() => {
    languageSettingsSetup = new ServiceSetup().withCompletion().withSchemaFileMatch({
      uri: 'https://raw.githubusercontent.com/yannh/kubernetes-json-schema/master/v1.32.1-standalone-strict/all.json',
      fileMatch: [SCHEMA_ID],
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
  });

  /**
   * Generates a completion list for the given document and caret (cursor) position.
   * @param content The content of the document.
   * @param line starts with 0 index
   * @param character starts with 1 index
   * @returns A list of valid completions.
   */
  function parseSetup(content: string, line: number, character: number): Promise<CompletionList> {
    const testTextDocument = setupSchemaIDTextDocument(content);
    yamlSettings.documents = new TextDocumentTestManager();
    (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
    return languageHandler.completionHandler({
      position: Position.create(line, character),
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

  afterEach(() => {
    schemaProvider.deleteSchema(SCHEMA_ID);
    languageService.configure(languageSettingsSetup.languageSettings);
  });

  it('should show completion on map under array', async () => {
    schemaProvider.addSchema(SCHEMA_ID, {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: {
            type: 'object',
            properties: {
              foo: {
                type: 'boolean',
              },
            },
          },
        },
      },
    });
    const content = '- from:\n   | |'; // len: 12, pos: 11
    const completion = await parseCaret(content);
    expect(completion.items).lengthOf(1);
    expect(completion.items[0]).eql(
      createExpectedCompletion('foo', 'foo: ', 1, 3, 1, 4, 10, 2, {
        documentation: '',
      })
    );
  });

  it('completion with array objects', async () => {
    schemaProvider.addSchema(SCHEMA_ID, {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          prop1: {
            type: 'string',
          },
          prop2: {
            type: 'string',
          },
          prop3: {
            type: 'string',
          },
        },
      },
    });
    const content = '- prop1: a\n   | |'; // len: 12, pos: 11
    const completion = await parseCaret(content);
    expect(completion.items).lengthOf(2);
    expect(completion.items[0]).eql(
      createExpectedCompletion('prop2', 'prop2: ', 1, 3, 1, 4, 10, 2, {
        documentation: '',
      })
    );
    expect(completion.items[1]).eql(
      createExpectedCompletion('prop3', 'prop3: ', 1, 3, 1, 4, 10, 2, {
        documentation: '',
      })
    );
  });

  it('should show completion on array empty array item', async () => {
    schemaProvider.addSchema(SCHEMA_ID, {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: {
            type: 'object',
            properties: {
              foo: {
                type: 'boolean',
              },
            },
          },
        },
      },
    });
    const content = '- '; // len: 2
    const completion = await parseSetup(content, 0, 2);
    expect(completion.items).lengthOf(1);
    expect(completion.items[0]).eql(
      createExpectedCompletion('from', 'from:\n    ', 0, 2, 0, 2, 10, 2, {
        documentation: '',
      })
    );
  });

  it('should show completion items in the middle of map in array', async () => {
    const content = `apiVersion: v1
kind: Pod
metadata:
  name: foo
spec:
  containers:
    - name: test
      
      image: alpine
    `; // len: 90
    const completion = await parseSetup(content, 7, 6);
    expect(completion.items).length.greaterThan(1);
  });

  it('should show completion on array item on first line', async () => {
    const content = '-d'; // len: 2
    const completion = await parseSetup(content, 0, 1);
    expect(completion.items).is.empty;
  });

  it('should complete without error on map inside array', async () => {
    const content = '- foo\n- bar:\n    so'; // len: 19
    const completion = await parseSetup(content, 2, 6);
    expect(completion.items).is.empty;
  });

  it('should complete  array', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const schema = require(path.join(__dirname, './fixtures/test-nested-object-array.json'));
    schemaProvider.addSchema(SCHEMA_ID, schema);
    const content = `objA:
  - name: nameA1
      
objB:
  size: midle
  name: nameB2  
`; // len: 67
    const completion = await parseSetup(content, 2, 4);
    expect(completion.items).is.not.empty;
  });

  it('should complete array item for "oneOf" schema', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const schema = require(path.join(__dirname, './fixtures/test-completion-oneOf.json'));
    schemaProvider.addSchema(SCHEMA_ID, schema);
    const content = `metadata:
  Selector:
    query:
      - 
`; // len: 42
    const completion = await parseSetup(content, 3, 8);
    expect(completion.items).length(5);
    expect(completion.items.map((it) => it.label)).to.have.members(['NOT', 'attribute', 'operation', 'value', 'FUNC_item']);
  });

  it('Autocomplete with short nextLine - nested object', async () => {
    schemaProvider.addSchema(SCHEMA_ID, {
      type: 'object',
      properties: {
        example: {
          type: 'object',
          properties: {
            sample: {
              type: 'object',
              properties: {
                detail: {
                  type: 'object',
                },
              },
            },
          },
        },
        a: {
          type: 'string',
          description: 'short prop name because of distance to the cursor',
        },
      },
    });
    const content = 'example:\n  sample:\n    '; // len: 23
    const completion = await parseSetup(content + '\na: test', 2, 4);
    expect(completion.items.length).equal(1);
    expect(completion.items[0]).to.be.deep.equal(
      createExpectedCompletion('detail', 'detail:\n  ', 2, 4, 2, 4, 10, 2, {
        documentation: '',
      })
    );
  });

  it('Should suggest valid matches from oneOf', async () => {
    schemaProvider.addSchema(SCHEMA_ID, {
      oneOf: [
        {
          type: 'object',
          properties: {
            spec: {
              type: 'object',
            },
          },
        },
        {
          properties: {
            spec: {
              type: 'object',
              required: ['bar'],
              properties: {
                bar: {
                  type: 'string',
                },
              },
            },
          },
        },
      ],
    });
    const content = '|s|'; // len: 1, pos: 1
    const completion = await parseCaret(content);
    expect(completion.items.length).equal(1);
    expect(completion.items[0]).to.be.deep.equal(
      createExpectedCompletion('spec', 'spec:\n  bar: ', 0, 0, 0, 1, 10, 2, {
        documentation: '',
      })
    );
  });

  it('Should suggest all the matches from allOf', async () => {
    schemaProvider.addSchema(SCHEMA_ID, {
      allOf: [
        {
          type: 'object',
          properties: {
            spec: {
              type: 'object',
            },
          },
        },
        {
          properties: {
            spec: {
              type: 'object',
              required: ['bar'],
              properties: {
                bar: {
                  type: 'string',
                },
              },
            },
          },
        },
      ],
    });
    const content = '|s|'; // len: 1, pos: 1
    const completion = await parseCaret(content);
    expect(completion.items.length).equal(2);
    expect(completion.items[0]).to.be.deep.equal(
      createExpectedCompletion('spec', 'spec:\n  ', 0, 0, 0, 1, 10, 2, {
        documentation: '',
      })
    );
    expect(completion.items[1]).to.be.deep.equal(
      createExpectedCompletion('spec', 'spec:\n  bar: ', 0, 0, 0, 1, 10, 2, {
        documentation: '',
      })
    );
  });

  it('Autocomplete with a new line inside the object', async () => {
    schemaProvider.addSchema(SCHEMA_ID, {
      type: 'object',
      properties: {
        example: {
          type: 'object',
          properties: {
            sample: {
              type: 'object',
              properties: {
                prop1: {
                  type: 'string',
                },
                prop2: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
    });
    const content = 'example:\n  sample:\n    |\n|    prop2: value2'; // len: 41, pos: 23
    const completion = await parseCaret(content);
    expect(completion.items.length).equal(1);
    expect(completion.items[0]).to.be.deep.equal(
      createExpectedCompletion('prop1', 'prop1: ', 2, 4, 2, 4, 10, 2, {
        documentation: '',
      })
    );
  });

  it('Autocomplete on the first array item', async () => {
    schemaProvider.addSchema(SCHEMA_ID, {
      type: 'object',
      properties: {
        examples: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sample: {
                type: 'object',
                properties: {
                  prop1: {
                    type: 'string',
                  },
                },
              },
            },
          },
        },
      },
    });
    const content = 'examples:\n  |\n|  - sample:\n      prop1: value1'; // len: 44, pos: 12
    const completion = await parseCaret(content);
    expect(completion.items.length).equal(1);
    expect(completion.items[0]).to.be.deep.equal(
      createExpectedCompletion('- (array item) object', '- ', 1, 2, 1, 2, 9, 2, {
        documentation: {
          kind: 'markdown',
          value: 'Create an item of an array type `object`\n ```\n- \n```',
        },
      })
    );
  });

  it('Array of enum autocomplete of irregular order', async () => {
    schemaProvider.addSchema(SCHEMA_ID, {
      type: 'object',
      properties: {
        apiVersion: {
          type: 'string',
        },
        metadata: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
            },
          },
        },
        kind: {
          type: 'string',
          enum: ['Pod', 'PodTemplate'],
        },
      },
    });
    const content = 'kind: Po'; // len: 8
    const completion = await parseSetup(content, 1, 9);
    expect(completion.items.length).equal(2);
    expect(completion.items[0].insertText).equal('Pod');
    expect(completion.items[1].insertText).equal('PodTemplate');
  });

  it('Test that properties have enum of string type with number', async () => {
    schemaProvider.addSchema(SCHEMA_ID, {
      type: 'object',
      properties: {
        version: {
          type: 'array',
          items: {
            enum: ['12.1', 13, '13.1', '14.0', 'all', 14.4, false, null, ['test']],
            type: ['string', 'integer', 'number', 'boolean', 'object', 'array'],
          },
        },
      },
    });
    const content = 'version:\n  - ';
    const completion = await parseSetup(content, 2, 0);
    expect(completion.items).lengthOf(9);
    expect(completion.items[0].insertText).equal('"12.1"');
    expect(completion.items[1].insertText).equal('13');
    expect(completion.items[4].insertText).equal('all');
    expect(completion.items[5].insertText).equal('14.4');
    expect(completion.items[6].insertText).equal('false');
    expect(completion.items[7].insertText).equal('null');
    expect(completion.items[8].insertText).equal('\n  - ${1:test}\n');
  });

  it('Autocomplete indent on array when parent is array', async () => {
    schemaProvider.addSchema(SCHEMA_ID, {
      type: 'object',
      properties: {
        examples: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              objectWithArray: {
                type: 'array',
                items: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
    });
    const content = 'examples:\n  - '; // len: 14
    const completion = await parseSetup(content, 1, 4);

    expect(completion.items.length).equal(1);
    expect(completion.items[0]).to.be.deep.equal(
      createExpectedCompletion('objectWithArray', 'objectWithArray:\n    - ${1}', 1, 4, 1, 4, 10, 2, {
        documentation: '',
      })
    );
  });
  it('Autocomplete indent on array object when parent is array', async () => {
    schemaProvider.addSchema(SCHEMA_ID, {
      type: 'object',
      properties: {
        examples: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              objectWithArray: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['item', 'item2'],
                  properties: {
                    item: { type: 'string' },
                    item2: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    });
    const content = 'examples:\n  - '; // len: 14
    const completion = await parseSetup(content, 1, 4);

    expect(completion.items.length).equal(1);
    expect(completion.items[0]).to.be.deep.equal(
      createExpectedCompletion('objectWithArray', 'objectWithArray:\n    - item: $1\n      item2: $2', 1, 4, 1, 4, 10, 2, {
        documentation: '',
      })
    );
  });
  it('Autocomplete indent on array object when parent is array of an array', async () => {
    schemaProvider.addSchema(SCHEMA_ID, {
      type: 'object',
      properties: {
        array1: {
          type: 'array',
          items: {
            type: 'object',
            required: ['thing1'],
            properties: {
              thing1: {
                type: 'object',
                required: ['array2'],
                properties: {
                  array2: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['thing2', 'type'],
                      properties: {
                        type: {
                          type: 'string',
                        },
                        thing2: {
                          type: 'object',
                          required: ['item1', 'item2'],
                          properties: {
                            item1: { type: 'string' },
                            item2: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const content = 'array1:\n  - ';
    const completion = await parseSetup(content, 1, 4);

    expect(completion.items[0].insertText).to.be.equal(
      'thing1:\n    array2:\n      - type: $1\n        thing2:\n          item1: $2\n          item2: $3'
    );
  });
  it('Autocomplete with snippet without hypen (-) inside an array', async () => {
    schemaProvider.addSchema(SCHEMA_ID, {
      type: 'object',
      properties: {
        array1: {
          type: 'array',
          items: {
            type: 'object',
            defaultSnippets: [
              {
                label: 'My array item',
                body: { item1: '$1' },
              },
            ],
            required: ['thing1'],
            properties: {
              thing1: {
                type: 'object',
                required: ['item1'],
                properties: {
                  item1: { type: 'string' },
                },
              },
            },
          },
        },
      },
    });
    const content = 'array1:\n  - thing1:\n      item1: $1\n  |\n|';
    const completion = await parseCaret(content);

    expect(completion.items[0].insertText).to.be.equal('- item1: ');
  });
  describe('array indent on different index position', () => {
    const schema = {
      type: 'object',
      properties: {
        objectWithArray: {
          type: 'array',
          items: {
            type: 'object',
            required: ['item', 'item2'],
            properties: {
              item: { type: 'string' },
              item2: {
                type: 'object',
                required: ['prop1', 'prop2'],
                properties: {
                  prop1: { type: 'string' },
                  prop2: { type: 'string' },
                },
              },
            },
          },
        },
      },
    };
    it('array indent on the first item', async () => {
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = 'objectWithArray:\n  - '; // len: 21
      const completion = await parseSetup(content, 1, 4);

      expect(completion.items.length).equal(3);
      expect(completion.items[0]).to.be.deep.equal(
        createExpectedCompletion('item', 'item: ', 1, 4, 1, 4, 10, 2, {
          documentation: '',
        })
      );
      expect(completion.items[2]).to.be.deep.equal(
        createExpectedCompletion('item2', 'item2:\n    prop1: $1\n    prop2: $2', 1, 4, 1, 4, 10, 2, {
          documentation: '',
        })
      );
    });
    it('array indent on the second item', async () => {
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = 'objectWithArray:\n  - item: first line\n    '; // len: 42
      const completion = await parseSetup(content, 2, 4);

      expect(completion.items.length).equal(2);
      expect(completion.items[0]).to.be.deep.equal(
        createExpectedCompletion('item2', 'item2:\n  prop1: $1\n  prop2: $2', 2, 4, 2, 4, 10, 2, {
          documentation: '',
        })
      );
    });
  });

  describe('merge properties from anyOf objects', () => {
    it('should merge different simple values', async () => {
      const schema: JSONSchema = {
        anyOf: [
          {
            properties: {
              simplePropWithSimpleValue: { type: 'string', const: 'const value' },
            },
          },
          {
            properties: {
              simplePropWithSimpleValue: { type: 'boolean', default: false },
            },
          },
          {
            properties: {
              simplePropWithSimpleValue: { type: 'null', default: null },
            },
          },
          {
            properties: {
              simplePropWithSimpleValue: { type: 'string' },
            },
          },
        ],
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = '';
      const completion = await parseSetup(content, 0, 1);

      expect(completion.items.length).equal(1);
      expect(completion.items[0].insertText).to.be.equal('simplePropWithSimpleValue: ${1|const value,false,null|}');
    });

    it('should autocomplete as single item with same value', async () => {
      const schema: JSONSchema = {
        anyOf: [
          {
            properties: {
              simplePropWithSameValue: { type: 'string', const: 'const value 1' },
              obj1: { properties: { prop1: { type: 'string' } } },
            },
          },
          {
            properties: {
              simplePropWithSameValue: { type: 'string', const: 'const value 1' },
              obj1: { properties: { prop1: { type: 'string' } } },
            },
          },
        ],
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = '';
      const completion = await parseSetup(content, 0, 1);

      expect(completion.items.length).equal(2);
      expect(completion.items[0].insertText).to.be.equal('simplePropWithSameValue: const value 1');
      expect(completion.items[1].insertText).to.be.equal('obj1:\n  ');
    });

    it('should not merge objects', async () => {
      const schema: JSONSchema = {
        anyOf: [
          {
            properties: {
              obj1: { properties: { prop1: { type: 'string' } }, required: ['prop1'] },
            },
          },
          {
            properties: {
              obj1: { properties: { prop2: { type: 'string', const: 'value' } }, required: ['prop2'] },
            },
          },
        ],
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = '';
      const completion = await parseSetup(content, 0, 1);

      expect(completion.items.length).equal(2);
      expect(completion.items[0].label).to.be.equal('obj1');
      expect(completion.items[0].insertText).to.be.equal('obj1:\n  prop1: ');
      expect(completion.items[1].label).to.be.equal('obj1');
      expect(completion.items[1].insertText).to.be.equal('obj1:\n  prop2: ${1:value}');
    });

    it('Autocomplete should not suggest items for parent object', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          scripts: {
            type: 'object',
            properties: {
              sample: {
                type: 'string',
              },
            },
          },
          scripts2: {
            type: 'string',
          },
        },
      });
      const content = 'scripts:   \n  sample: | |';
      const completion = await parseSetup(content, 0, 9); // before line brake
      expect(completion.items.length).equal(0);
    });

    it('autoCompletion when value is null inside anyOf object', async () => {
      const schema: JSONSchema = {
        anyOf: [
          {
            properties: {
              prop: {
                const: 'const value',
              },
            },
          },
          {
            properties: {
              prop: {
                type: 'null',
              },
            },
          },
        ],
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = '';
      const completion = await parseSetup(content, 0, 6);
      expect(completion.items.length).equal(1);
      expect(completion.items[0].label).to.be.equal('prop');
      expect(completion.items[0].insertText).to.be.equal('prop: ${1|const value,null|}');
    });
  });

  describe('extra space after cursor', () => {
    it('simple const', async () => {
      const schema: JSONSchema = {
        properties: {
          prop: {
            const: 'const',
          },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = 'prop: | | '; // len: 8, pos: 6
      const completion = await parseCaret(content);

      expect(completion.items.length).equal(1);
      expect(completion.items[0].label).to.be.equal('const');
      expect(completion.items[0].textEdit).to.be.deep.equal({ newText: 'const', range: Range.create(0, 6, 0, 8) });
    });

    it('partial key with trailing spaces', async () => {
      const schema: JSONSchema = {
        properties: {
          name: {
            const: 'my name',
          },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = 'na  ';
      const completion = await parseSetup(content, 0, 2);

      expect(completion.items.length).equal(1);
      expect(completion.items[0]).eql(
        createExpectedCompletion('name', 'name: my name', 0, 0, 0, 4, 10, 2, {
          documentation: '',
        })
      );
    });
    it('partial key with trailing spaces with new line', async () => {
      const schema: JSONSchema = {
        properties: {
          name: {
            const: 'my name',
          },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = 'na  \n';
      const completion = await parseSetup(content, 0, 2);

      expect(completion.items.length).equal(1);
      expect(completion.items[0]).eql(
        createExpectedCompletion('name', 'name: my name', 0, 0, 0, 5, 10, 2, {
          documentation: '',
        })
      );
    });
    it('partial key with leading and trailing spaces', async () => {
      const schema: JSONSchema = {
        properties: {
          name: {
            const: 'my name',
          },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = '  na  ';
      const completion = await parseSetup(content, 0, 2);

      expect(completion.items.length).equal(1);
      expect(completion.items[0]).eql(
        createExpectedCompletion('name', 'name: my name', 0, 2, 0, 4, 10, 2, {
          documentation: '',
        })
      );
    });

    it('partial key with trailing spaces with special chars inside the array', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          array: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                'name / 123': {
                  const: 'my name',
                },
              },
            },
          },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = 'array:\n - name /   ';
      const completion = await parseSetup(content, 1, 9);

      expect(completion.items.length).equal(1);
      expect(completion.items[0]).eql(
        createExpectedCompletion('name / 123', 'name / 123: my name', 1, 3, 1, 12, 10, 2, {
          documentation: '',
        })
      );
    });

    describe('partial value with trailing spaces', () => {
      it('partial value with trailing spaces', async () => {
        const schema: JSONSchema = {
          properties: {
            name: {
              const: 'my name',
            },
          },
        };
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = 'name: my| |   ';
        const completion = await parseCaret(content);

        expect(completion.items.length).equal(1);
        expect(completion.items[0]).eql(
          createExpectedCompletion('my name', 'my name', 0, 6, 0, 12, 12, 2, {
            documentation: undefined,
          })
        );
      });
      it('partial value with trailing spaces with new line', async () => {
        const schema: JSONSchema = {
          properties: {
            name: {
              const: 'my name',
            },
          },
        };
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = 'name: my| |   \n';
        const completion = await parseCaret(content);

        expect(completion.items.length).equal(1);
        expect(completion.items[0]).eql(
          createExpectedCompletion('my name', 'my name', 0, 6, 0, 13, 12, 2, {
            documentation: undefined,
          })
        );
      });
      it('partial value with leading and trailing spaces', async () => {
        const schema: JSONSchema = {
          properties: {
            name: {
              const: 'my name',
            },
          },
        };
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = 'name:   my na| |   ';
        const completion = await parseCaret(content);

        expect(completion.items.length).equal(1);
        expect(completion.items[0]).eql(
          createExpectedCompletion('my name', 'my name', 0, 6, 0, 17, 12, 2, {
            documentation: undefined,
          })
        );
      });

      it('partial value with trailing spaces with special chars inside the array', async () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            array: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: {
                    const: 'my name / 123',
                  },
                },
              },
            },
          },
        };
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = 'array:\n - name: my name /| |  ';
        const completion = await parseCaret(content);

        expect(completion.items.length).equal(1);
        expect(completion.items[0]).eql(
          createExpectedCompletion('my name / 123', 'my name / 123', 1, 9, 1, 21, 12, 2, {
            documentation: undefined,
          })
        );
      });
    });

    it('object - 2nd nested property', async () => {
      const schema: JSONSchema = {
        properties: {
          parent: {
            properties: {
              prop1: {
                const: 'const1',
              },
              prop2: {
                const: 'const2',
              },
            },
          },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = 'parent:\n  prop1: const1\n  prop2:   ';
      const completion = await parseSetup(content, 2, 9);

      expect(completion.items.length).equal(1);
      expect(completion.items[0].label).to.be.equal('const2');
      expect(completion.items[0].textEdit).to.be.deep.equal({
        newText: 'const2',
        range: Range.create(2, 9, 2, 11),
      });
    });

    it('array - 2nd nested property', async () => {
      const schema: JSONSchema = {
        properties: {
          arrayObj: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                item1: {
                  type: 'string',
                },
                item2: {
                  const: 'const2',
                },
              },
              required: ['item1', 'item2'],
            },
          },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = 'arrayObj:\n  - item1: test\n  - item2:   ';
      const completion = await parseSetup(content, 2, 11);

      expect(completion.items.length).equal(1);
      expect(completion.items[0].label).to.be.equal('const2');
      expect(completion.items[0].textEdit).to.be.deep.equal({
        newText: 'const2',
        range: Range.create(2, 11, 2, 13),
      });
    });
    describe('array object item', () => {
      const schema: JSONSchema = {
        properties: {
          arrayObj: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                item1: {
                  type: 'string',
                },
                item2: {
                  type: 'string',
                },
              },
              required: ['item1', 'item2'],
            },
          },
        },
      };
      it('1st item', async () => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = 'arrayObj:\n  -   ';
        const completion = await parseSetup(content, 1, 4);

        expect(completion.items.length).equal(3);
        expect(completion.items[1].textEdit).to.be.deep.equal({
          newText: 'item1: $1\n  item2: $2',
          range: Range.create(1, 4, 1, 6), // removes extra spaces after cursor
        });
      });
      it('next item', async () => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = 'arrayObj:\n  - item1: a\n  - item2: b\n  -   ';
        const completion = await parseSetup(content, 3, 4);

        expect(completion.items.length).equal(3);
        expect(completion.items[1].textEdit).to.be.deep.equal({
          newText: 'item1: $1\n  item2: $2',
          range: Range.create(3, 4, 3, 6), // removes extra spaces after cursor
        });
      });
    });
    it('array completion - should suggest correct indent when extra spaces after cursor', async () => {
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
                  required: ['itemA'],
                  properties: {
                    itemA: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
        },
      });
      const content = 'test:\n  -               ';
      const result = await parseSetup(content, 1, 4);

      expect(result.items.length).to.be.equal(1);
      expect(result.items[0].insertText).to.be.equal('objA:\n    itemA: ');
    });
    it('array of arrays completion - should suggest correct indent when extra spaces after cursor', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          array1: {
            type: 'array',
            items: {
              type: 'object',
              required: ['array2'],
              properties: {
                array2: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['objA'],
                    properties: {
                      objA: {
                        type: 'object',
                        required: ['itemA'],
                        properties: {
                          itemA: {
                            type: 'string',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      const content = 'array1:\n  -               ';
      const result = await parseSetup(content, 1, 4);

      expect(result.items.length).to.be.equal(2);
      expect(result.items[0].insertText).to.be.equal('array2:\n    - objA:\n        itemA: ');
    });
    it('object of array of arrays completion - should suggest correct indent when extra spaces after cursor', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          array1: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                array2: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      objA: {
                        type: 'object',
                        required: ['itemA'],
                        properties: {
                          itemA: {
                            type: 'string',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      const content = 'array1:\n  - array2:\n      -               ';
      const result = await parseSetup(content, 2, 8);

      expect(result.items.length).to.be.equal(1);
      expect(result.items[0].insertText).to.be.equal('objA:\n    itemA: ');
    });
  }); //'extra space after cursor'

  it('should suggest from additionalProperties', async () => {
    const schema: JSONSchema = {
      type: 'object',
      additionalProperties: {
        anyOf: [
          {
            type: 'string',
            const: 'test1',
          },
        ],
      },
    };
    schemaProvider.addSchema(SCHEMA_ID, schema);
    const content = 'value: ';
    const completion = await parseSetup(content, 0, content.length);

    expect(completion.items.length).equal(1);
    expect(completion.items[0].insertText).to.be.equal('test1');
  });

  it('should suggest defaultSnippets from additionalProperties', async () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        id: {
          type: 'string',
        },
      },
      additionalProperties: {
        anyOf: [
          {
            type: 'string',
            defaultSnippets: [{ label: 'snippet', body: 'snippetBody' }],
          },
        ],
      },
    };
    schemaProvider.addSchema(SCHEMA_ID, schema);
    const content = 'value: |\n|';
    const completion = await parseCaret(content);

    expect(completion.items.map((i) => i.insertText)).to.be.deep.equal(['snippetBody']);
  });

  describe('variations of defaultSnippets', () => {
    const getNestedSchema = (schema: JSONSchema['properties']): JSONSchema => {
      return {
        type: 'object',
        properties: {
          snippets: {
            type: 'object',
            properties: {
              ...schema,
            },
          },
        },
      };
    };

    // STRING
    describe('defaultSnippet for string property', () => {
      const schema = getNestedSchema({
        snippetString: {
          type: 'string',
          defaultSnippets: [
            {
              label: 'labelSnippetString',
              body: 'value',
            },
          ],
        },
      });

      it('should suggest defaultSnippet for STRING property - unfinished property', async () => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = `
snippets:
  snippetStr|\n|
`;
        const completion = await parseCaret(content);

        expect(completion.items.map((i) => i.insertText)).to.be.deep.equal(['snippetString: value']);
      });

      it('should suggest defaultSnippet for STRING property - value after colon', async () => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = `
snippets:
  snippetString: |\n|
`;
        const completion = await parseCaret(content);

        expect(completion.items.map((i) => i.insertText)).to.be.deep.equal(['value']);
      });
    }); // STRING

    // OBJECT
    describe('defaultSnippet for OBJECT property', () => {
      const schema = getNestedSchema({
        snippetObject: {
          type: 'object',
          properties: {
            item1: { type: 'string' },
          },
          required: ['item1'],
          defaultSnippets: [
            {
              label: 'labelSnippetObject',
              body: {
                item1: 'value',
                item2: {
                  item3: 'value nested',
                },
              },
            },
          ],
        },
      });

      it('should suggest defaultSnippet for OBJECT property - unfinished property, snippet replaces autogenerated props', async () => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = `
snippets:
  snippetOb|\n|
`;
        const completion = await parseCaret(content);

        expect(completion.items.map(({ label, insertText }) => ({ label, insertText }))).to.be.deep.equal([
          {
            label: 'snippetObject',
            insertText: `snippetObject:
  item1: value
  item2:
    item3: value nested`,
          },
        ]);
      });
      it('should suggest defaultSnippet for OBJECT property - unfinished property, should keep all snippet properties', async () => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = `
snippets:
  item1: value
  snippetOb|\n|
`;
        const completion = await parseCaret(content);

        expect(completion.items.map(({ label, insertText }) => ({ label, insertText }))).to.be.deep.equal([
          {
            label: 'snippetObject',
            insertText: `snippetObject:
  item1: value
  item2:
    item3: value nested`,
          },
        ]);
      });

      it('should suggest defaultSnippet for OBJECT property - value after colon', async () => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = `
snippets:
  snippetObject: |\n|
`;
        const completion = await parseCaret(content);

        expect(completion.items.map(({ label, insertText }) => ({ label, insertText }))).to.be.deep.equal([
          {
            label: 'labelSnippetObject', // snippet intellisense
            insertText: `
  item1: value
  item2:
    item3: value nested`,
          },
        ]);
      });

      it('should suggest defaultSnippet for OBJECT property - value with indent', async () => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = `
snippets:
  snippetObject:
    |\n|
`;
        const completion = await parseCaret(content);

        expect(completion.items.map(({ label, insertText }) => ({ label, insertText }))).to.be.deep.equal([
          {
            label: 'labelSnippetObject', // snippet intellisense
            insertText: `item1: value
item2:
  item3: value nested`,
          },
          {
            label: 'item1', // key intellisense
            insertText: 'item1: ',
          },
          {
            label: 'object', // parent intellisense
            insertText: 'item1: ',
          },
        ]);
      });

      it('should suggest partial defaultSnippet for OBJECT property - subset of items already there', async () => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = `
snippets:
  snippetObject:
    item1: val
    |\n|
`;
        const completion = await parseCaret(content);

        expect(completion.items.map(({ label, insertText }) => ({ label, insertText }))).to.be.deep.equal([
          {
            label: 'labelSnippetObject',
            insertText: `item2:
  item3: value nested`,
          },
        ]);
      });

      it('should suggest no defaultSnippet for OBJECT property - all items already there', async () => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = `
snippets:
  snippetObject:
    item1: val
    item2: val
    |\n|
`;
        const completion = await parseCaret(content);

        expect(completion.items.map(({ label, insertText }) => ({ label, insertText }))).to.be.deep.equal([]);
      });
    }); // OBJECT

    // OBJECT - Snippet nested
    describe('defaultSnippet for OBJECT property', () => {
      const schema = getNestedSchema({
        snippetObject: {
          type: 'object',
          properties: {
            item1: {
              type: 'object',
              defaultSnippets: [
                {
                  label: 'labelSnippetObject',
                  body: {
                    item1_1: 'value',
                    item1_2: {
                      item1_2_1: 'value nested',
                    },
                  },
                },
              ],
            },
          },
          required: ['item1'],
        },
      });

      it('should suggest defaultSnippet for nested OBJECT property - unfinished property, snippet extends autogenerated props', async () => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = `
snippets:
  snippetOb|\n|
`;
        const completion = await parseCaret(content);

        expect(completion.items.map(({ label, insertText }) => ({ label, insertText }))).to.be.deep.equal([
          {
            label: 'snippetObject',
            insertText: `snippetObject:
  item1:
    item1_1: value
    item1_2:
      item1_2_1: value nested`,
          },
        ]);
      });
    }); // OBJECT - Snippet nested

    // ARRAY
    describe('defaultSnippet for ARRAY property', () => {
      describe('defaultSnippets on the property level as an object value', () => {
        const schema = getNestedSchema({
          snippetArray: {
            type: 'array',
            $comment:
              'property - Not implemented, OK value, OK value nested, OK value nested with -, OK on 2nd index without or with -',
            items: {
              type: 'object',
              properties: {
                item1: { type: 'string' },
              },
            },
            defaultSnippets: [
              {
                label: 'labelSnippetArray',
                body: {
                  item1: 'value',
                  item2: 'value2',
                },
              },
            ],
          },
        });

        it('should suggest defaultSnippet for ARRAY property - unfinished property (not implemented)', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
snippets:
  snippetAr|\n|
`;
          const completion = await parseCaret(content);

          expect(completion.items.map(({ label, insertText }) => ({ label, insertText }))).to.be.deep.equal([
            {
              label: 'snippetArray',
              insertText: 'snippetArray:\n  - ',
            },
          ]);
        });

        it('should suggest defaultSnippet for ARRAY property - value after colon', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
snippets:
  snippetArray: |\n|
`;
          const completion = await parseCaret(content);

          expect(completion.items.map(({ label, insertText }) => ({ label, insertText }))).to.be.deep.equal([
            {
              label: 'labelSnippetArray',
              insertText: `
  - item1: value
    item2: value2`,
            },
          ]);
        });

        it('should suggest defaultSnippet for ARRAY property - value with indent (without hyphen)', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
snippets:
  snippetArray:
    |\n|
`;
          const completion = await parseCaret(content);

          expect(completion.items.map(({ label, insertText }) => ({ label, insertText }))).to.be.deep.equal([
            {
              label: 'labelSnippetArray',
              insertText: `- item1: value
  item2: value2`,
            },
          ]);
        });
        it('should suggest defaultSnippet for ARRAY property - value with indent (with hyphen)', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
snippets:
  snippetArray:
    - |\n|
`;
          const completion = await parseCaret(content);

          expect(completion.items.map(({ label, insertText }) => ({ label, insertText }))).to.be.deep.equal([
            {
              label: 'item1',
              insertText: 'item1: ',
            },
            {
              label: 'labelSnippetArray',
              insertText: `item1: value
  item2: value2`,
            },
          ]);
        });
        it('should suggest defaultSnippet for ARRAY property - value on 2nd position', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
snippets:
  snippetArray:
    - item1: test
    - |\n|
`;
          const completion = await parseCaret(content);

          expect(completion.items.map(({ label, insertText }) => ({ label, insertText }))).to.be.deep.equal([
            {
              label: 'item1',
              insertText: 'item1: ',
            },
            {
              label: 'labelSnippetArray',
              insertText: `item1: value
  item2: value2`,
            },
          ]);
        });
      });
      describe('defaultSnippets on the items level as an object value', () => {
        const schema = getNestedSchema({
          snippetArray2: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true,
              defaultSnippets: [
                {
                  label: 'labelSnippetArray',
                  body: {
                    item1: 'value',
                    item2: 'value2',
                  },
                },
              ],
            },
          },
        });

        it('should suggest defaultSnippet for ARRAY property - unfinished property', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
snippets:
  snippetAr|\n|
`;
          const completion = await parseCaret(content);

          expect(completion.items.map((i) => i.insertText)).to.be.deep.equal([
            'snippetArray2:\n  - item1: value\n    item2: value2',
          ]);
        });

        it('should suggest defaultSnippet for ARRAY property - value after colon', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
snippets:
  snippetArray2: |\n|
`;
          const completion = await parseCaret(content);

          expect(completion.items.map((i) => i.insertText)).to.be.deep.equal([
            `
  - item1: value
    item2: value2`,
          ]);
        });

        it('should suggest defaultSnippet for ARRAY property - value with indent (with hyphen)', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
snippets:
  snippetArray2:
    - |\n|
`;
          const completion = await parseCaret(content);

          expect(completion.items.map((i) => i.insertText)).to.be.deep.equal([
            `item1: value
  item2: value2`,
          ]);
        });
        it('should suggest defaultSnippet for ARRAY property - value on 2nd position', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
snippets:
  snippetArray2:
    - item1: test
    - |\n|
`;
          const completion = await parseCaret(content);

          expect(completion.items.map((i) => i.insertText)).to.be.deep.equal([
            `item1: value
  item2: value2`,
          ]);
        });
      }); // ARRAY - Snippet on items level

      describe('defaultSnippets on the items level, ARRAY - Body is array of primitives', () => {
        const schema = getNestedSchema({
          snippetArrayPrimitives: {
            type: 'array',
            items: {
              type: ['string', 'boolean', 'number', 'null'],
              defaultSnippets: [
                {
                  body: ['value', 5, null, false],
                },
              ],
            },
          },
        });

        // fix if needed
        //         it('should suggest defaultSnippet for ARRAY property with primitives - unfinished property', async () => {
        //           schemaProvider.addSchema(SCHEMA_ID, schema);
        //           const content = `
        // snippets:
        //   snippetArrayPrimitives|\n|
        // `;
        //           const completion = await parseCaret(content);

        //           expect(completion.items.map((i) => i.insertText)).to.be.deep.equal([
        //             'snippetArrayPrimitives:\n  - value\n  - 5\n  - null\n  - false',
        //           ]);
        //         });

        it('should suggest defaultSnippet for ARRAY property with primitives - value after colon', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
snippets:
  snippetArrayPrimitives: |\n|
`;
          const completion = await parseCaret(content);

          expect(completion.items.map((i) => i.insertText)).to.be.deep.equal(['\n  - value\n  - 5\n  - null\n  - false']);
        });

        // skip, fix if needed
        //         it('should suggest defaultSnippet for ARRAY property with primitives - value with indent (with hyphen)', async () => {
        //           schemaProvider.addSchema(SCHEMA_ID, schema);
        //           const content = `
        // snippets:
        //   snippetArrayPrimitives:
        //     - |\n|
        // `;
        //           const completion = await parseCaret(content);

        //           expect(completion.items.map((i) => i.insertText)).to.be.deep.equal(['value\n  - 5\n  - null\n  - false']);
        //         });
        //         it('should suggest defaultSnippet for ARRAY property with primitives - value on 2nd position', async () => {
        //           schemaProvider.addSchema(SCHEMA_ID, schema);
        //           const content = `
        // snippets:
        //   snippetArrayPrimitives:
        //     - some other value
        //     - |\n|
        // `;
        //           const completion = await parseCaret(content);

        //           expect(completion.items.map((i) => i.insertText)).to.be.deep.equal(['- value\n  - 5\n  - null\n  - false']);
        //         });
      }); // ARRAY - Body is array of primitives

      describe('defaultSnippets on the items level, ARRAY - Body is string', () => {
        const schema = getNestedSchema({
          snippetArrayString: {
            type: 'array',
            items: {
              type: 'string',
              defaultSnippets: [
                {
                  body: 'value',
                },
              ],
            },
          },
        });

        it('should suggest defaultSnippet for ARRAY property with string - unfinished property', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
snippets:
  snippetArrayString|\n|
`;
          const completion = await parseCaret(content);

          expect(completion.items.map((i) => i.insertText)).to.be.deep.equal(['snippetArrayString:\n  - ${1}']);
          // better to suggest, fix if needed
          // expect(completion.items.map((i) => i.insertText)).to.be.deep.equal(['snippetArrayString:\n  - value']);
        });

        it('should suggest defaultSnippet for ARRAY property with string - value after colon', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
snippets:
  snippetArrayString: |\n|
`;
          const completion = await parseCaret(content);

          expect(completion.items.map((i) => i.insertText)).to.be.deep.equal(['\n  - value']);
        });

        it('should suggest defaultSnippet for ARRAY property with string - value with indent (with hyphen)', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
        snippets:
          snippetArrayString:
            - |\n|
        `;
          const completion = await parseCaret(content);

          expect(completion.items.map((i) => i.insertText)).to.be.deep.equal(['value']);
        });
        it('should suggest defaultSnippet for ARRAY property with string - value on 2nd position', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
        snippets:
          snippetArrayString:
            - some other value
            - |\n|
        `;
          const completion = await parseCaret(content);

          expect(completion.items.map((i) => i.insertText)).to.be.deep.equal(['value']);
        });
      }); // ARRAY - Body is simple string
    }); // ARRAY
  });

  describe('should suggest prop of the object (based on not completed prop name)', () => {
    const schema: JSONSchema = {
      definitions: {
        Obj: {
          anyOf: [
            { type: 'string' },
            {
              type: 'object',
              properties: {
                prop1: { type: 'string' },
              },
              required: ['prop1'],
            },
          ],
        },
      },
      properties: {
        test1: {
          properties: {
            nested: { $ref: '#/definitions/Obj' },
          },
        },
        test2: { $ref: '#/definitions/Obj' },
      },
    };
    const content = `
test2: 
  pr
test1:
  nested: 
    pr
`;
    it('nested object', async () => {
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const completion = await parseSetup(content, 5, 6);

      expect(completion.items.length).equal(2);
      expect(completion.items[0].label).to.be.equal('prop1');
    });
    it('root object', async () => {
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const completion = await parseSetup(content, 2, 4);

      expect(completion.items.length).equal(2);
      expect(completion.items[0].label).to.be.equal('prop1');
    });
  });

  describe('should suggest property before indented comment', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        example: {
          type: 'object',
          properties: {
            prop1: {
              type: 'string',
            },
            prop2: {
              type: 'string',
            },
            prop3: {
              type: 'string',
            },
          },
        },
      },
    };

    it('completion should handle indented comment on new line', async () => {
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = 'example:\n  prop1: "test"\n  \n    #comment';
      const completion = await parseSetup(content, 2, 2);
      expect(completion.items.length).equal(2);
      expect(completion.items[0]).to.be.deep.equal(
        createExpectedCompletion('prop2', 'prop2: ', 2, 2, 2, 2, CompletionItemKind.Property, InsertTextFormat.Snippet, {
          documentation: '',
        })
      );
    });

    it('completion should handle comment at same indent level on new line', async () => {
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = 'example:\n  prop1: "test"\n  \n  #comment';
      const completion = await parseSetup(content, 2, 2);
      expect(completion.items.length).equal(2);
      expect(completion.items[0]).to.be.deep.equal(
        createExpectedCompletion('prop2', 'prop2: ', 2, 2, 2, 2, CompletionItemKind.Property, InsertTextFormat.Snippet, {
          documentation: '',
        })
      );
    });

    it('completion should handle suggestion without comment on next line', async () => {
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const content = 'example:\n  prop1: "test"\n  \n  prop3: "test"';
      const completion = await parseSetup(content, 2, 2);
      expect(completion.items.length).equal(1);
      expect(completion.items[0]).to.be.deep.equal(
        createExpectedCompletion('prop2', 'prop2: ', 2, 2, 2, 2, CompletionItemKind.Property, InsertTextFormat.Snippet, {
          documentation: '',
        })
      );
    });
  });
  it('should suggest property of unknown object', async () => {
    const schema: JSONSchema = {
      type: 'object',
      additionalProperties: true,
      propertyNames: {
        title: 'property',
        description: 'Property Description',
      },
    };
    schemaProvider.addSchema(SCHEMA_ID, schema);
    const content = '';
    const completion = await parseSetup(content, 0, content.length);

    expect(completion.items.length).equal(1);
    expect(completion.items[0].insertText).to.be.equal('${1:property}: ');
    expect(completion.items[0].documentation).to.be.equal('Property Description');
  });
});
