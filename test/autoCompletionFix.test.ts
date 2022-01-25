/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompletionList, Position } from 'vscode-languageserver/node';
import { LanguageHandlers } from '../src/languageserver/handlers/languageHandlers';
import { LanguageService } from '../src/languageservice/yamlLanguageService';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';
import { ServiceSetup } from './utils/serviceSetup';
import { SCHEMA_ID, setupLanguageService, setupSchemaIDTextDocument } from './utils/testHelper';
import { expect } from 'chai';
import { createExpectedCompletion } from './utils/verifyError';
import * as path from 'path';

describe('Auto Completion Fix Tests', () => {
  let languageSettingsSetup: ServiceSetup;
  let languageService: LanguageService;
  let languageHandler: LanguageHandlers;
  let yamlSettings: SettingsState;

  before(() => {
    languageSettingsSetup = new ServiceSetup().withCompletion().withSchemaFileMatch({
      uri: 'https://raw.githubusercontent.com/yannh/kubernetes-json-schema/master/v1.22.4-standalone-strict/all.json',
      fileMatch: [SCHEMA_ID],
    });
    const { languageService: langService, languageHandler: langHandler, yamlSettings: settings } = setupLanguageService(
      languageSettingsSetup.languageSettings
    );
    languageService = langService;
    languageHandler = langHandler;
    yamlSettings = settings;
  });

  /**
   *
   * @param content
   * @param line starts with 0 index
   * @param character starts with 1 index
   * @returns
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

  afterEach(() => {
    languageService.deleteSchema(SCHEMA_ID);
    languageService.configure(languageSettingsSetup.languageSettings);
  });

  it('should show completion on map under array', async () => {
    languageService.addSchema(SCHEMA_ID, {
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
    const content = '- from:\n    ';
    const completion = await parseSetup(content, 1, 3);
    expect(completion.items).lengthOf(1);
    expect(completion.items[0]).eql(
      createExpectedCompletion('foo', 'foo: ', 1, 3, 1, 3, 10, 2, {
        documentation: '',
      })
    );
  });

  it('should show completion on array empty array item', async () => {
    languageService.addSchema(SCHEMA_ID, {
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
    const content = '- ';
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
    `;
    const completion = await parseSetup(content, 7, 6);
    expect(completion.items).length.greaterThan(1);
  });

  it('should show completion on array item on first line', async () => {
    const content = '-d';
    const completion = await parseSetup(content, 0, 1);
    expect(completion.items).is.empty;
  });

  it('should complete without error on map inside array', async () => {
    const content = '- foo\n- bar:\n    so';
    const completion = await parseSetup(content, 2, 6);
    expect(completion.items).is.empty;
  });

  it('should complete  array', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const schema = require(path.join(__dirname, './fixtures/test-nested-object-array.json'));
    languageService.addSchema(SCHEMA_ID, schema);
    const content = `objA:
  - name: nameA1
      
objB:
  size: midle
  name: nameB2  
`;
    const completion = await parseSetup(content, 2, 4);
    expect(completion.items).is.not.empty;
  });

  it('should complete array item for "oneOf" schema', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const schema = require(path.join(__dirname, './fixtures/test-completion-oneOf.json'));
    languageService.addSchema(SCHEMA_ID, schema);
    const content = `metadata:
  Selector:
    query:
      - 
`;
    const completion = await parseSetup(content, 3, 8);
    expect(completion.items).length(5);
    expect(completion.items.map((it) => it.label)).to.have.members(['NOT', 'attribute', 'operation', 'value', 'FUNC_item']);
  });

  it('Autocomplete with short nextLine - nested object', async () => {
    languageService.addSchema(SCHEMA_ID, {
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
    const content = 'example:\n  sample:\n    ';
    const completion = await parseSetup(content + '\na: test', 2, 4);
    expect(completion.items.length).equal(1);
    expect(completion.items[0]).to.be.deep.equal(
      createExpectedCompletion('detail', 'detail:\n  ', 2, 4, 2, 4, 10, 2, {
        documentation: '',
      })
    );
  });

  it('Autocomplete with a new line inside the object', async () => {
    languageService.addSchema(SCHEMA_ID, {
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
    const content = 'example:\n  sample:\n    \n    prop2: value2';
    const completion = await parseSetup(content, 2, 4);
    expect(completion.items.length).equal(1);
    expect(completion.items[0]).to.be.deep.equal(
      createExpectedCompletion('prop1', 'prop1: ', 2, 4, 2, 4, 10, 2, {
        documentation: '',
      })
    );
  });

  it('Autocomplete on the first array item', async () => {
    languageService.addSchema(SCHEMA_ID, {
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
    const content = 'examples:\n  \n  - sample:\n      prop1: value1';
    const completion = await parseSetup(content, 1, 2);
    expect(completion.items.length).equal(1);
    expect(completion.items[0]).to.be.deep.equal(
      createExpectedCompletion('- (array item)', '- ', 1, 2, 1, 2, 9, 2, {
        documentation: {
          kind: 'markdown',
          value: 'Create an item of an array\n ```\n- \n```',
        },
      })
    );
  });

  it('Autocomplete indent on array when parent is array', async () => {
    languageService.addSchema(SCHEMA_ID, {
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
    const content = 'examples:\n  - ';
    const completion = await parseSetup(content, 1, 4);

    expect(completion.items.length).equal(1);
    expect(completion.items[0]).to.be.deep.equal(
      createExpectedCompletion('objectWithArray', 'objectWithArray:\n    - ${1:""}', 1, 4, 1, 4, 10, 2, {
        documentation: '',
      })
    );
  });
  it('Autocomplete indent on array object when parent is array', async () => {
    languageService.addSchema(SCHEMA_ID, {
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
    const content = 'examples:\n  - ';
    const completion = await parseSetup(content, 1, 4);

    expect(completion.items.length).equal(1);
    expect(completion.items[0]).to.be.deep.equal(
      createExpectedCompletion('objectWithArray', 'objectWithArray:\n    - item: $1\n      item2: $2', 1, 4, 1, 4, 10, 2, {
        documentation: '',
      })
    );
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
      languageService.addSchema(SCHEMA_ID, schema);
      const content = 'objectWithArray:\n  - ';
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
      languageService.addSchema(SCHEMA_ID, schema);
      const content = 'objectWithArray:\n  - item: first line\n    ';
      const completion = await parseSetup(content, 2, 4);

      expect(completion.items.length).equal(2);
      expect(completion.items[0]).to.be.deep.equal(
        createExpectedCompletion('item2', 'item2:\n  prop1: $1\n  prop2: $2', 2, 4, 2, 4, 10, 2, {
          documentation: '',
        })
      );
    });
  });
});
