/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { toFsPath, setupSchemaIDTextDocument, setupLanguageService } from './utils/testHelper';
import assert = require('assert');
import path = require('path');
import { ServiceSetup } from './utils/serviceSetup';
import { LanguageHandlers } from '../src/languageserver/handlers/languageHandlers';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';
import { CompletionList, TextEdit } from 'vscode-languageserver-types';
import { expect } from 'chai';

describe('Default Snippet Tests', () => {
  let languageHandler: LanguageHandlers;
  let yamlSettings: SettingsState;

  before(() => {
    const uri = toFsPath(path.join(__dirname, './fixtures/defaultSnippets.json'));
    const fileMatch = ['*.yml', '*.yaml'];
    const languageSettingsSetup = new ServiceSetup().withCompletion().withSchemaFileMatch({
      fileMatch,
      uri,
    });
    const { languageHandler: langHandler, yamlSettings: settings } = setupLanguageService(languageSettingsSetup.languageSettings);
    languageHandler = langHandler;
    yamlSettings = settings;
  });

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
      // console.log(`was: len: ${content.length}, content: "${content}", str: "${content.substring(position)}"`);
      if (typeof position === 'undefined') {
        position = content.search(/\|[^]\|/); // | -> any char including newline -> |
        content =
          content.substring(0, position) + content.substring(position + 1, position + 2) + content.substring(position + 3);
      }
      // console.log(`now: len: ${content.length}, content: "${content}", pos: ${position}, str: "${content.substring(position)}"`);

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
          assert.equal(result.items.length, 1);
          assert.equal(result.items[0].insertText, '- item1: $1\n  item2: $2');
          assert.equal(result.items[0].label, 'My array item');
        })
        .then(done, done);
    });
    it('Snippet in array schema should autocomplete correctly inside array item ', (done) => {
      const content = 'array:\n  - item1: asd\n    item2: asd\n    ';
      const completion = parseSetup(content, content.length);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 1);
          assert.equal(result.items[0].insertText, 'item1: $1\nitem2: $2');
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
          assert.equal(result.items[1].insertText, 'key:\n  ');
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
          assert.equal(result.items[1].insertText, 'key:\n  ');
          assert.equal(result.items[1].label, 'key');
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
          assert.equal(result.items.length, 14); // This is just checking the total number of snippets in the defaultSnippets.json
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
});
