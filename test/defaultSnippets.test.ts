/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { CompletionList, TextEdit } from 'vscode-languageserver-types';

import type { LanguageHandlers } from '../src/languageserver/handlers/languageHandlers';
import type { SettingsState } from '../src/yamlSettings';

import assert from 'assert';
import * as path from 'path';

import { expect } from 'chai';

import { ServiceSetup } from './utils/serviceSetup';
import { caretPosition, setupLanguageService, setupSchemaIDTextDocument, toFsPath } from './utils/testHelper';
import { TextDocumentTestManager } from '../src/yamlSettings';

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

    it('Snippet in array schema should autocomplete with -', async () => {
      const content = 'array:\n  - '; // len: 11
      const result = await parseSetup(content, 11);
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].insertText, 'item1: $1\n  item2: $2');
      assert.equal(result.items[0].label, 'My array item');
    });

    it('Snippet in array schema should autocomplete with - if none is present', async () => {
      const content = 'array:\n  '; // len: 9
      const result = await parseSetup(content, 9);
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].insertText, '- item1: $1\n  item2: $2');
      assert.equal(result.items[0].label, 'My array item');
    });

    it('Snippet in array schema should autocomplete on same line as array', async () => {
      const content = 'array: | |'; // len: 8, pos: 7
      const result = await parseSetup(content);
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].insertText, '\n  - item1: $1\n    item2: $2');
      assert.equal(result.items[0].label, 'My array item');
    });

    it('Snippet in array schema should autocomplete correctly on array level ', async () => {
      const content = 'array:\n  - item1: asd\n    item2: asd\n  ';
      const result = await parseSetup(content, content.length);
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].insertText, '- item1: $1\n  item2: $2');
      assert.equal(result.items[0].label, 'My array item');
    });
    it('Snippet in array schema should suggest nothing inside array item if YAML already contains all props', async () => {
      const content = 'array:\n  - item1: asd\n    item2: asd\n    ';
      const result = await parseSetup(content, content.length);
      assert.equal(result.items.length, 0);
    });
    it('Snippet in array schema should suggest only some of the props inside an array item if YAML already contains some of the props', async () => {
      const content = 'array:\n  - item1: asd\n    ';
      const result = await parseSetup(content, content.length);
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].insertText, 'item2: $2');
      assert.equal(result.items[0].label, 'My array item');
    });
    it('Snippet in anyOf array schema should autocomplete correctly with "-" symbol', async () => {
      const content = 'anyOf_arrayObj:\n  ';
      const result = await parseSetup(content, content.length);
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].insertText, '- key: ');
    });
    it('Snippet custom suggestionKind', async () => {
      const content = 'anyOf_arrayObj:\n  ';
      const result = await parseSetup(content, content.length);
      assert.strictEqual(result.items.length, 1);
      assert.strictEqual(result.items[0].kind, 9);
    });
    it('Snippet custom sort', async () => {
      const content = 'arrayNestedObjectSnippet:\n  ';
      const result = await parseSetup(content, content.length);
      assert.strictEqual(result.items.length, 1);
      assert.strictEqual(result.items[0].sortText, 'custom');
    });

    it('Snippet in object schema should autocomplete on next line ', async () => {
      const content = 'object:\n  '; // len: 10
      const result = await parseSetup(content, 11);
      assert.equal(result.items.length, 2);
      assert.equal(result.items[0].insertText, 'key1: $1\nkey2: $2');
      assert.equal(result.items[0].label, 'Object item');
      assert.equal(result.items[1].insertText, 'key:\n  ');
      assert.equal(result.items[1].label, 'key');
    });

    it('Snippet in object schema should autocomplete on next line with depth', async () => {
      const content = 'object:\n  key:\n    '; // len: 19
      const result = await parseSetup(content, 20);
      assert.notEqual(result.items.length, 0);
      assert.equal(result.items[0].insertText, 'key1: $1\nkey2: $2');
      assert.equal(result.items[0].label, 'Object item');
      assert.equal(result.items[1].insertText, 'key:\n  ');
      assert.equal(result.items[1].label, 'key');
    });

    it('Snippet in object schema should suggest some of the snippet props because some of them are already in the YAML', async () => {
      const content = 'object:\n  key:\n    key2: value\n    ';
      const result = await parseSetup(content, content.length);
      assert.notEqual(result.items.length, 0);
      assert.equal(result.items[0].insertText, 'key1: ');
      assert.equal(result.items[0].label, 'Object item');
      assert.equal(result.items[1].insertText, 'key:\n  ');
      assert.equal(result.items[1].label, 'key');
    });
    it('Snippet in object schema should not suggest snippet props because all of them are already in the YAML', async () => {
      const content = 'object:\n  key:\n    key1: value\n    key2: value\n    ';
      const result = await parseSetup(content, content.length);
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].insertText, 'key:\n  ');
      assert.equal(result.items[0].label, 'key');
    });

    it('Snippet in object schema should autocomplete on same line', async () => {
      const content = 'object:  '; // len: 9
      const result = await parseSetup(content, 8);
      assert.equal(result.items.length, 1);
    });

    it('Snippet in object schema should not autocomplete on children', async () => {
      const content = 'object_any:\n someProp: ';
      const result = await parseSetup(content, content.length);
      assert.equal(result.items.length, 0);
    });

    it('Snippet in string schema should autocomplete on same line', async () => {
      const content = 'string: | |'; // len: 9, pos: 8
      const result = await parseSetup(content);
      assert.notEqual(result.items.length, 0);
      assert.equal(result.items[0].insertText, 'test ');
      assert.equal(result.items[0].label, 'My string item');
    });

    it('Snippet in boolean schema should autocomplete on same line', async () => {
      const content = 'boolean: | |'; // len: 10, pos: 9
      const result = await parseSetup(content);
      assert.notEqual(result.items.length, 0);
      assert.equal(result.items[0].label, 'My boolean item');
      assert.equal(result.items[0].insertText, 'false');
    });

    it('Snippet in longSnipet schema should autocomplete on same line', async () => {
      const content = 'longSnippet: | |'; // len: 14, pos: 13
      const result = await parseSetup(content);
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].label, 'apply-manifests');
      assert.equal(
        result.items[0].insertText,
        '\n  name: $1\n  taskRef:\n    name: apply-manifests\n  resources:\n    inputs:\n      - name: source\n        resource: $3\n  params:\n    - name: manifest_dir\n      value: $2'
      );
    });

    it('Snippet in short snippet schema should autocomplete on same line', async () => {
      const content = 'lon| | '; // len: 5, pos: 3
      const result = await parseSetup(content);
      assert.equal(result.items.length, 15); // This is just checking the total number of snippets in the defaultSnippets.json
      assert.equal(result.items[4].label, 'longSnippet');
      assert.equal(
        result.items[4].insertText,
        'longSnippet:\n  name: $1\n  taskRef:\n    name: apply-manifests\n  resources:\n    inputs:\n      - name: source\n        resource: $3\n  params:\n    - name: manifest_dir\n      value: $2'
      );
    });

    it('Test array of arrays on properties completion', async () => {
      const content = 'arrayArrayS| | '; // len: 13, pos: 11
      const result = await parseSetup(content);
      assert.equal(result.items[5].label, 'arrayArraySnippet');
      assert.equal(result.items[5].insertText, 'arrayArraySnippet:\n  apple:\n    - - name: source\n        resource: $3');
    });

    it('Test array of arrays on value completion', async () => {
      const content = 'arrayArraySnippet: '; // len: 19
      const result = await parseSetup(content, 20);
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].label, 'Array Array Snippet');
      assert.equal(result.items[0].insertText, '\n  apple:\n    - - name: source\n        resource: $3');
    });

    it('Test array of arrays on indented completion', async () => {
      const content = 'arrayArraySnippet:\n  '; // len: 21
      const result = await parseSetup(content, 21);
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].label, 'Array Array Snippet');
      assert.equal(result.items[0].insertText, 'apple:\n  - - name: source\n      resource: $3');
    });

    it('Test array of strings', async () => {
      const content = 'arrayStringSnippet:\n  ';
      const result = await parseSetup(content, content.length);
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].insertText, 'fruits:\n  - banana\n  - orange');
    });

    it('Test array nested object indented completion', async () => {
      const content = 'arrayNestedObjectSnippet:\n  ';
      const result = await parseSetup(content, content.length);
      assert.equal(result.items.length, 1);
      assert.equal(
        result.items[0].insertText,
        'apple:\n  - name: source\n    resource:\n      prop1: value1\n      prop2: value2'
      );
    });

    it('Test snippet in array indented completion', async () => {
      const content = 'arrayWithSnippet:\n  - ';
      const result = await parseSetup(content, content.length);
      assert.equal(result.items.length, 2);
      assert.equal(result.items[0].insertText, 'item1: $1\n  item2: $2');
      assert.equal(result.items[1].insertText, '\n  item1: $1\n  item2: $2');
    });

    it('Test array of objects extra new line', async () => {
      const content = 'arrayObjectSnippet:\n  ';
      const result = await parseSetup(content, content.length);
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].insertText, 'apple:\n  - name: source\n  - name: source2');
    });

    it('Test string with boolean in string should insert string', async () => {
      const content = 'simpleBooleanString: '; // len: 21
      const result = await parseSetup(content, 21);
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].label, 'Simple boolean string');
      assert.equal(result.items[0].insertText, '\n  test: "true"');
    });

    it('Test string with boolean NOT in string should insert boolean', async () => {
      const content = 'simpleBoolean: '; // len: 15
      const result = await parseSetup(content, 15);
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].label, 'Simple string');
      assert.equal(result.items[0].insertText, '\n  test: true');
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
