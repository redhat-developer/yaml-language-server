/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { expect } from 'chai';
import * as path from 'path';
import { JSONSchema } from 'vscode-json-languageservice';
import { CompletionList, TextEdit } from 'vscode-languageserver-types';
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
  toFsPath,
} from './utils/testHelper';

describe('Default Snippet Tests', () => {
  let languageSettingsSetup: ServiceSetup;
  let languageService: LanguageService;
  let languageHandler: LanguageHandlers;
  let yamlSettings: SettingsState;
  let schemaProvider: TestCustomSchemaProvider;

  before(() => {
    const uri = toFsPath(path.join(__dirname, './fixtures/defaultSnippets.json'));
    const fileMatch = ['*.yml', '*.yaml'];
    languageSettingsSetup = new ServiceSetup().withCompletion().withSchemaFileMatch({
      fileMatch,
      uri,
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

  afterEach(() => {
    schemaProvider.deleteSchema(SCHEMA_ID);
    languageService.configure(languageSettingsSetup.languageSettings);
  });

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

  describe('Snippet Tests', function () {
    /**
     * Generates a completion list for the given document and caret (cursor) position.
     * @param content The content of the document.
     * @param position The position of the caret in the document.
     * Alternatively, `position` can be omitted if the caret is located in the content using `|` bookends.
     * For example, `content = 'ab|c|d'` places the caret over the `'c'`, at `position = 2`
     * @returns A list of valid completions.
     */
    function parseSetup(content: string, position?: number): Promise<CompletionList> {
      if (typeof position === 'undefined') {
        ({ content, position } = caretPosition(content));
      }

      const testTextDocument = setupSchemaIDTextDocument(content);
      yamlSettings.documents = new TextDocumentTestManager();
      (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
      return languageHandler.completionHandler({
        position: testTextDocument.positionAt(position),
        textDocument: testTextDocument,
      });
    }

    it('Snippet in array schema should autocomplete with -', (done) => {
      const content = 'array:\n  - '; // len: 11
      const completion = parseSetup(content, 11);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 1);
          assert.equal(result.items[0].insertText, 'item1: $1\n  item2: $2');
          assert.equal(result.items[0].label, 'My array item');
        })
        .then(done, done);
    });

    it('Snippet in array schema should autocomplete with - if none is present', (done) => {
      const content = 'array:\n  '; // len: 9
      const completion = parseSetup(content, 9);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 1);
          assert.equal(result.items[0].insertText, '- item1: $1\n  item2: $2');
          assert.equal(result.items[0].label, 'My array item');
        })
        .then(done, done);
    });

    it('Snippet in array schema should autocomplete on same line as array', (done) => {
      const content = 'array: | |'; // len: 8, pos: 7
      const completion = parseSetup(content);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 1);
          assert.equal(result.items[0].insertText, '\n  - item1: $1\n    item2: $2');
          assert.equal(result.items[0].label, 'My array item');
        })
        .then(done, done);
    });

    it('Snippet in array schema should autocomplete correctly on array level ', (done) => {
      const content = 'array:\n  - item1: asd\n    item2: asd\n  ';
      const completion = parseSetup(content, content.length);
      completion
        .then(function (result) {
          assert.deepEqual(
            result.items.map((i) => ({ insertText: i.insertText, label: i.label })),
            [
              { insertText: '- item1: $1\n  item2: $2', label: 'My array item' },
              {
                insertText: '- $1\n',
                label: '- (array item) ',
              },
            ]
          );
        })
        .then(done, done);
    });
    it('Snippet in array schema should suggest nothing inside array item if YAML already contains all props', (done) => {
      const content = 'array:\n  - item1: asd\n    item2: asd\n    ';
      const completion = parseSetup(content, content.length);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 0);
        })
        .then(done, done);
    });
    it('Snippet in array schema should suggest only some of the props inside an array item if YAML already contains some of the props', (done) => {
      const content = 'array:\n  - item1: asd\n    ';
      const completion = parseSetup(content, content.length);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 1);
          assert.equal(result.items[0].insertText, 'item2: $2');
          assert.equal(result.items[0].label, 'My array item');
        })
        .then(done, done);
    });
    it('Snippet in anyOf array schema should autocomplete correctly with "-" symbol', (done) => {
      const content = 'anyOf_arrayObj:\n  ';
      const completion = parseSetup(content, content.length);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 1);
          assert.equal(result.items[0].insertText, '- key: ');
        })
        .then(done, done);
    });
    it('Snippet custom suggestionKind', (done) => {
      const content = 'anyOf_arrayObj:\n  ';
      const completion = parseSetup(content, content.length);
      completion
        .then(function (result) {
          assert.strictEqual(result.items.length, 1);
          assert.strictEqual(result.items[0].kind, 9);
        })
        .then(done, done);
    });
    it('Snippet custom sort', (done) => {
      const content = 'arrayNestedObjectSnippet:\n  ';
      const completion = parseSetup(content, content.length);
      completion
        .then(function (result) {
          assert.strictEqual(result.items.length, 1);
          assert.strictEqual(result.items[0].sortText, 'custom');
        })
        .then(done, done);
    });

    it('Snippet in object schema should autocomplete on next line ', (done) => {
      const content = 'object:\n  '; // len: 10
      const completion = parseSetup(content, 11);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 2);
          assert.equal(result.items[0].insertText, 'key1: $1\nkey2: $2');
          assert.equal(result.items[0].label, 'Object item');
          assert.equal(result.items[1].insertText, 'key:\n  key1: $1\n  key2: $2');
          assert.equal(result.items[1].label, 'key');
        })
        .then(done, done);
    });

    it('Snippet in object schema should autocomplete on next line with depth', (done) => {
      const content = 'object:\n  key:\n    '; // len: 19
      const completion = parseSetup(content, 20);
      completion
        .then(function (result) {
          assert.notEqual(result.items.length, 0);
          assert.equal(result.items[0].insertText, 'key1: $1\nkey2: $2');
          assert.equal(result.items[0].label, 'Object item');
          assert.equal(result.items[1].insertText, 'key:\n  key1: $1\n  key2: $2');
          assert.equal(result.items[1].label, 'key');
        })
        .then(done, done);
    });

    it('Snippet in object schema should suggest some of the snippet props because some of them are already in the YAML', (done) => {
      const content = 'object:\n  key:\n    key2: value\n    '; // position is nested in `key`
      const completion = parseSetup(content, content.length);
      completion
        .then(function (result) {
          assert.notEqual(result.items.length, 0);
          assert.equal(result.items[0].insertText, 'key1: ');
          assert.equal(result.items[0].label, 'Object item');
          assert.equal(result.items[1].insertText, 'key:\n  key1: $1\n  key2: $2'); // recursive item (key inside key)
          assert.equal(result.items[1].label, 'key');
        })
        .then(done, done);
    });
    it('Snippet in object schema should not suggest snippet props because all of them are already in the YAML', (done) => {
      const content = 'object:\n  key:\n    key1: value\n    key2: value\n    ';
      const completion = parseSetup(content, content.length);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 1);
          // snippet for nested `key` property
          assert.equal(result.items[0].insertText, 'key:\n  key1: $1\n  key2: $2'); // recursive item (key inside key)
          assert.equal(result.items[0].label, 'key');
        })
        .then(done, done);
    });

    it('Snippet in object schema should autocomplete on same line', (done) => {
      const content = 'object:  '; // len: 9
      const completion = parseSetup(content, 8);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 1);
        })
        .then(done, done);
    });

    it('Snippet in object schema should not autocomplete on children', (done) => {
      const content = 'object_any:\n someProp: ';
      const completion = parseSetup(content, content.length);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 0);
        })
        .then(done, done);
    });

    it('Snippet in string schema should autocomplete on same line', (done) => {
      const content = 'string: | |'; // len: 9, pos: 8
      const completion = parseSetup(content);
      completion
        .then(function (result) {
          assert.notEqual(result.items.length, 0);
          assert.equal(result.items[0].insertText, 'test ');
          assert.equal(result.items[0].label, 'My string item');
        })
        .then(done, done);
    });

    it('Snippet in string schema should autocomplete on same line (snippet is defined in body property)', (done) => {
      const content = 'arrayStringValueSnippet:\n - |\n|';
      const completion = parseSetup(content);
      completion
        .then(function (result) {
          assert.deepEqual(
            result.items.map((i) => ({ label: i.label, insertText: i.insertText })),
            [{ insertText: 'banana', label: 'Banana' }]
          );
        })
        .then(done, done);
    });

    it('Snippet in boolean schema should autocomplete on same line', (done) => {
      const content = 'boolean: | |'; // len: 10, pos: 9
      const completion = parseSetup(content);
      completion
        .then(function (result) {
          assert.notEqual(result.items.length, 0);
          assert.equal(result.items[0].label, 'My boolean item');
          assert.equal(result.items[0].insertText, 'false');
        })
        .then(done, done);
    });

    it('Snippet in longSnipet schema should autocomplete on same line', (done) => {
      const content = 'longSnippet: | |'; // len: 14, pos: 13
      const completion = parseSetup(content);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 1);
          assert.equal(result.items[0].label, 'apply-manifests');
          // eslint-disable-next-line
          assert.equal(
            result.items[0].insertText,
            '\n  name: $1\n  taskRef:\n    name: apply-manifests\n  resources:\n    inputs:\n      - name: source\n        resource: $3\n  params:\n    - name: manifest_dir\n      value: $2'
          );
        })
        .then(done, done);
    });

    it('Snippet in short snippet schema should autocomplete on same line', (done) => {
      const content = 'lon| | '; // len: 5, pos: 3
      const completion = parseSetup(content);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 16); // This is just checking the total number of snippets in the defaultSnippets.json
          assert.equal(result.items[4].label, 'longSnippet');
          // eslint-disable-next-line
          assert.equal(
            result.items[4].insertText,
            'longSnippet:\n  name: $1\n  taskRef:\n    name: apply-manifests\n  resources:\n    inputs:\n      - name: source\n        resource: $3\n  params:\n    - name: manifest_dir\n      value: $2'
          );
        })
        .then(done, done);
    });

    it('Test array of arrays on properties completion', (done) => {
      const content = 'arrayArrayS| | '; // len: 13, pos: 11
      const completion = parseSetup(content);
      completion
        .then(function (result) {
          assert.equal(result.items[5].label, 'arrayArraySnippet');
          assert.equal(result.items[5].insertText, 'arrayArraySnippet:\n  apple:\n    - - name: source\n        resource: $3');
        })
        .then(done, done);
    });

    it('Test array of arrays on value completion', (done) => {
      const content = 'arrayArraySnippet: '; // len: 19
      const completion = parseSetup(content, 20);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 1);
          assert.equal(result.items[0].label, 'Array Array Snippet');
          assert.equal(result.items[0].insertText, '\n  apple:\n    - - name: source\n        resource: $3');
        })
        .then(done, done);
    });

    it('Test array of arrays on indented completion', (done) => {
      const content = 'arrayArraySnippet:\n  '; // len: 21
      const completion = parseSetup(content, 21);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 1);
          assert.equal(result.items[0].label, 'Array Array Snippet');
          assert.equal(result.items[0].insertText, 'apple:\n  - - name: source\n      resource: $3');
        })
        .then(done, done);
    });

    it('Test array of strings', (done) => {
      const content = 'arrayStringSnippet:\n  ';
      const completion = parseSetup(content, content.length);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 1);
          assert.equal(result.items[0].insertText, 'fruits:\n  - banana\n  - orange');
        })
        .then(done, done);
    });

    it('Test array nested object indented completion', (done) => {
      const content = 'arrayNestedObjectSnippet:\n  ';
      const completion = parseSetup(content, content.length);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 1);
          assert.equal(
            result.items[0].insertText,
            'apple:\n  - name: source\n    resource:\n      prop1: value1\n      prop2: value2'
          );
        })
        .then(done, done);
    });

    it('Test snippet in array indented completion', (done) => {
      const content = 'arrayWithSnippet:\n  - ';
      const completion = parseSetup(content, content.length);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 1);
          assert.equal(result.items[0].insertText, 'item1: $1\n  item2: $2');
        })
        .then(done, done);
    });

    it('Test array of objects extra new line', (done) => {
      const content = 'arrayObjectSnippet:\n  ';
      const completion = parseSetup(content, content.length);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 1);
          assert.equal(result.items[0].insertText, 'apple:\n  - name: source\n  - name: source2');
        })
        .then(done, done);
    });

    it('Test string with boolean in string should insert string', (done) => {
      const content = 'simpleBooleanString: '; // len: 21
      const completion = parseSetup(content, 21);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 1);
          assert.equal(result.items[0].label, 'Simple boolean string');
          assert.equal(result.items[0].insertText, '\n  test: "true"');
        })
        .then(done, done);
    });

    it('Test string with boolean NOT in string should insert boolean', (done) => {
      const content = 'simpleBoolean: '; // len: 15
      const completion = parseSetup(content, 15);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 1);
          assert.equal(result.items[0].label, 'Simple string');
          assert.equal(result.items[0].insertText, '\n  test: true');
        })
        .then(done, done);
    });

    it('should preserve space after ":" with prefix', async () => {
      const content = 'boolean: |t|r\n'; // len: 12, pos: 9
      const result = await parseSetup(content);

      assert.notEqual(result.items.length, 0);
      assert.equal(result.items[0].label, 'My boolean item');
      const textEdit = result.items[0].textEdit as TextEdit;
      assert.equal(textEdit.newText, 'false');
      assert.equal(textEdit.range.start.line, 0);
      assert.equal(textEdit.range.start.character, 9);
      assert.equal(textEdit.range.end.line, 0);
      assert.equal(textEdit.range.end.character, 11);
    });

    it('should preserve space after ":"', async () => {
      const content = 'boolean: '; // len: 9
      const result = await parseSetup(content, 9);

      assert.notEqual(result.items.length, 0);
      assert.equal(result.items[0].label, 'My boolean item');
      const textEdit = result.items[0].textEdit as TextEdit;
      assert.equal(textEdit.newText, 'false');
      assert.equal(textEdit.range.start.line, 0);
      assert.equal(textEdit.range.start.character, 9);
      assert.equal(textEdit.range.end.line, 0);
      assert.equal(textEdit.range.end.character, 9);
    });

    it('should add space before value on root node', async () => {
      const content = 'name|\n|'; // len: 5, pos: 4
      const result = await parseSetup(content);
      const item = result.items.find((i) => i.label === 'name');
      expect(item).is.not.undefined;
      expect(item.textEdit.newText).to.be.equal('name: some');
    });
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
    describe('defaultSnippet(snippetObject) for OBJECT property', () => {
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

      it('should suggest defaultSnippet(snippetObject) for OBJECT property - unfinished property, snippet replaces autogenerated props', async () => {
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
      it('should suggest defaultSnippet(snippetObject) for OBJECT property - unfinished property, should keep all snippet properties', async () => {
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

      it('should suggest defaultSnippet(snippetObject) for OBJECT property - value after colon', async () => {
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

      it('should suggest defaultSnippet(snippetObject) for OBJECT property - value with indent', async () => {
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

      it('should suggest partial defaultSnippet(snippetObject) for OBJECT property - subset of items already there', async () => {
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
    describe('defaultSnippet(snippetObject) for OBJECT property', () => {
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

      it('should suggest defaultSnippet(snippetObject) for nested OBJECT property - unfinished property, snippet extends autogenerated props', async () => {
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
      describe('defaultSnippets(snippetArray) on the property level as an object value', () => {
        const schema = getNestedSchema({
          snippetArray: {
            type: 'array',
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

        it('should suggest defaultSnippet(snippetArray) for ARRAY property - unfinished property (not implemented)', async () => {
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

        it('should suggest defaultSnippet(snippetArray) for ARRAY property - value after colon', async () => {
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

        it('should suggest defaultSnippet(snippetArray) for ARRAY property - value with indent (without hyphen)', async () => {
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
        it('should suggest defaultSnippet(snippetArray) for ARRAY property - value with indent (with hyphen)', async () => {
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
        it('should suggest defaultSnippet(snippetArray) for ARRAY property - value on 2nd position', async () => {
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
      describe('defaultSnippets(snippetArray2) on the items level as an object value', () => {
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

        it('should suggest defaultSnippet(snippetArray2) for ARRAY property - unfinished property', async () => {
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

        it('should suggest defaultSnippet(snippetArray2) for ARRAY property - value after colon', async () => {
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

        it('should suggest defaultSnippet(snippetArray2) for ARRAY property - value with indent (with hyphen)', async () => {
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
        it('should suggest defaultSnippet(snippetArray2) for ARRAY property - value on 2nd position', async () => {
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

      describe('defaultSnippets(snippetArrayPrimitives) on the items level, ARRAY - Body is array of primitives', () => {
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

        // implement if needed
        // schema type array doesn't use defaultSnippets as a replacement for the auto generated result
        // to change this, just return snippet result in `getInsertTextForProperty` function

        // it('should suggest defaultSnippet(snippetArrayPrimitives) for ARRAY property with primitives - unfinished property', async () => {
        //   schemaProvider.addSchema(SCHEMA_ID, schema);
        //   const content = `
        // snippets:
        //   snippetArrayPrimitives|\n|
        // `;
        //   const completion = await parseCaret(content);

        //   expect(completion.items.map((i) => i.insertText)).to.be.deep.equal([
        //     'snippetArrayPrimitives:\n  - value\n  - 5\n  - null\n  - false',
        //   ]);
        // });

        it('should suggest defaultSnippet(snippetArrayPrimitives) for ARRAY property with primitives - value after colon', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
snippets:
  snippetArrayPrimitives: |\n|
`;
          const completion = await parseCaret(content);

          expect(completion.items.map((i) => i.insertText)).to.be.deep.equal(['\n  - value\n  - 5\n  - null\n  - false']);
        });

        it('should suggest defaultSnippet(snippetArrayPrimitives) for ARRAY property with primitives - value with indent (with hyphen)', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
        snippets:
          snippetArrayPrimitives:
            - |\n|
        `;
          const completion = await parseCaret(content);

          expect(completion.items.map((i) => i.insertText)).to.be.deep.equal(['value\n- 5\n- null\n- false']);
        });
        it('should suggest defaultSnippet(snippetArrayPrimitives) for ARRAY property with primitives - value on 2nd position', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
        snippets:
          snippetArrayPrimitives:
            - some other value
            - |\n|
        `;
          const completion = await parseCaret(content);

          expect(completion.items.map((i) => i.insertText)).to.be.deep.equal(['value\n- 5\n- null\n- false']);
        });
      }); // ARRAY - Body is array of primitives

      describe('defaultSnippets(snippetArray2Objects) outside items level, ARRAY - Body is array of objects', () => {
        const schema = getNestedSchema({
          snippetArray2Objects: {
            type: 'array',
            items: {
              type: 'object',
            },
            defaultSnippets: [
              {
                body: [
                  {
                    item1: 'value',
                    item2: 'value2',
                  },
                  {
                    item3: 'value',
                  },
                ],
              },
            ],
          },
        });

        // schema type array doesn't use defaultSnippets as a replacement for the auto generated result
        // to change this, just return snippet result in `getInsertTextForProperty` function
        // it('should suggest defaultSnippet(snippetArray2Objects) for ARRAY property with objects - unfinished property', async () => {
        //   schemaProvider.addSchema(SCHEMA_ID, schema);
        //   const content = `
        // snippets:
        //   snippetArray2Objects|\n|
        // `;
        //   const completion = await parseCaret(content);

        //   expect(completion.items.map((i) => i.insertText)).to.be.deep.equal([
        //     'snippetArray2Objects:\n  - item1: value\n    item2: value2\n  - item3: value',
        //   ]);
        // });

        it('should suggest defaultSnippet(snippetArray2Objects) for ARRAY property with objects - value after colon', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
snippets:
  snippetArray2Objects: |\n|
`;
          const completion = await parseCaret(content);

          expect(completion.items.map((i) => i.insertText)).to.be.deep.equal([
            '\n  - item1: value\n    item2: value2\n  - item3: value',
          ]);
        });

        it('should suggest defaultSnippet(snippetArray2Objects) for ARRAY property with objects - value with indent (with hyphen)', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
        snippets:
          snippetArray2Objects:
            - |\n|
        `;
          const completion = await parseCaret(content);

          expect(completion.items.map((i) => i.insertText)).to.be.deep.equal(['item1: value\n  item2: value2\n- item3: value']);
        });
        it('should suggest defaultSnippet(snippetArray2Objects) for ARRAY property with objects - value with indent (without hyphen)', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
        snippets:
          snippetArray2Objects:
            |\n|
        `;
          const completion = await parseCaret(content);

          expect(completion.items.map((i) => i.insertText)).to.be.deep.equal(['- item1: value\n  item2: value2\n- item3: value']);
        });
        it('should suggest defaultSnippet(snippetArray2Objects) for ARRAY property with objects - value on 2nd position', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
        snippets:
          snippetArray2Objects:
            - 1st: 1
            - |\n|
        `;
          const completion = await parseCaret(content);

          expect(completion.items.map((i) => i.insertText)).to.be.deep.equal(['item1: value\n  item2: value2\n- item3: value']);
        });
      }); // ARRAY outside items - Body is array of objects

      describe('defaultSnippets(snippetArrayObjects) on the items level, ARRAY - Body is array of objects', () => {
        const schema = getNestedSchema({
          snippetArrayObjects: {
            type: 'array',
            items: {
              type: 'object',
              defaultSnippets: [
                {
                  body: [
                    {
                      item1: 'value',
                      item2: 'value2',
                    },
                    {
                      item3: 'value',
                    },
                  ],
                },
              ],
            },
          },
        });

        it('should suggest defaultSnippet(snippetArrayObjects) for ARRAY property with objects - unfinished property', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
        snippets:
          snippetArrayObjects|\n|
        `;
          const completion = await parseCaret(content);

          expect(completion.items.map((i) => i.insertText)).to.be.deep.equal([
            'snippetArrayObjects:\n  - item1: value\n    item2: value2\n  - item3: value',
          ]);
        });

        it('should suggest defaultSnippet(snippetArrayObjects) for ARRAY property with objects - value after colon', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
snippets:
  snippetArrayObjects: |\n|
`;
          const completion = await parseCaret(content);

          expect(completion.items.map((i) => i.insertText)).to.be.deep.equal([
            '\n  - item1: value\n    item2: value2\n  - item3: value',
          ]);
        });

        it('should suggest defaultSnippet(snippetArrayObjects) for ARRAY property with objects - value with indent (with hyphen)', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
        snippets:
          snippetArrayObjects:
            - |\n|
        `;
          const completion = await parseCaret(content);

          expect(completion.items.map((i) => i.insertText)).to.be.deep.equal(['item1: value\n  item2: value2\n- item3: value']);
        });
        it('should suggest defaultSnippet(snippetArrayObjects) for ARRAY property with objects - value on 2nd position', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
        snippets:
          snippetArrayObjects:
            - 1st: 1
            - |\n|
        `;
          const completion = await parseCaret(content);

          expect(completion.items.map((i) => i.insertText)).to.be.deep.equal(['item1: value\n  item2: value2\n- item3: value']);
        });
      }); // ARRAY - Body is array of objects

      describe('defaultSnippets(snippetArrayString) on the items level, ARRAY - Body is string', () => {
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

        it('should suggest defaultSnippet(snippetArrayString) for ARRAY property with string - unfinished property', async () => {
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

        it('should suggest defaultSnippet(snippetArrayString) for ARRAY property with string - value after colon', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
snippets:
  snippetArrayString: |\n|
`;
          const completion = await parseCaret(content);

          expect(completion.items.map((i) => i.insertText)).to.be.deep.equal(['\n  - value']);
        });

        it('should suggest defaultSnippet(snippetArrayString) for ARRAY property with string - value with indent (with hyphen)', async () => {
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const content = `
        snippets:
          snippetArrayString:
            - |\n|
        `;
          const completion = await parseCaret(content);

          expect(completion.items.map((i) => i.insertText)).to.be.deep.equal(['value']);
        });
        it('should suggest defaultSnippet(snippetArrayString) for ARRAY property with string - value on 2nd position', async () => {
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

    describe('anyOf(snippetAnyOfArray), ARRAY - Body is array of objects', () => {
      const schema = getNestedSchema({
        snippetAnyOfArray: {
          anyOf: [
            {
              items: {
                type: 'object',
              },
            },
            {
              type: 'object',
            },
          ],

          defaultSnippets: [
            {
              label: 'labelSnippetAnyOfArray',
              body: [
                {
                  item1: 'value',
                  item2: 'value2',
                },
                {
                  item3: 'value',
                },
              ],
            },
          ],
        },
      });

      it('should suggest defaultSnippet(snippetAnyOfArray) for ARRAY property with objects - unfinished property', async () => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = `
        snippets:
          snippetAnyOfArray|\n|
        `;
        const completion = await parseCaret(content);

        expect(completion.items.map((i) => i.insertText)).to.be.deep.equal([
          'snippetAnyOfArray:\n  - item1: value\n    item2: value2\n  - item3: value',
        ]);
      });

      it('should suggest defaultSnippet(snippetAnyOfArray) for ARRAY property with objects - value after colon', async () => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = `
snippets:
  snippetAnyOfArray: |\n|
`;
        const completion = await parseCaret(content);

        expect(completion.items.map((i) => i.insertText)).to.be.deep.equal([
          '\n  - item1: value\n    item2: value2\n  - item3: value',
        ]);
      });

      it('should suggest defaultSnippet(snippetAnyOfArray) for ARRAY property with objects - value with indent (with hyphen)', async () => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = `
        snippets:
          snippetAnyOfArray:
            - |\n|
        `;
        const completion = await parseCaret(content);

        expect(completion.items.map((i) => i.insertText)).to.be.deep.equal(['item1: value\n  item2: value2\n- item3: value']);
      });
      it('should suggest defaultSnippet(snippetAnyOfArray) for ARRAY property with objects - value on 2nd position', async () => {
        schemaProvider.addSchema(SCHEMA_ID, schema);
        const content = `
        snippets:
          snippetAnyOfArray:
            - 1st: 1
            - |\n|
        `;
        const completion = await parseCaret(content);

        expect(completion.items.map((i) => i.insertText)).to.be.deep.equal(['item1: value\n  item2: value2\n- item3: value']);
      });
    }); // anyOf - Body is array of objects
  }); // variations of defaultSnippets
});
