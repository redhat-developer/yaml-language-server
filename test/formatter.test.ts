/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { TextEdit } from 'vscode-languageserver-types';
import { LanguageHandlers } from '../src/languageserver/handlers/languageHandlers';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';
import { ServiceSetup } from './utils/serviceSetup';
import { setupLanguageService, setupTextDocument } from './utils/testHelper';

describe('Formatter Tests', () => {
  let languageHandler: LanguageHandlers;
  let yamlSettings: SettingsState;

  before(() => {
    const languageSettingsSetup = new ServiceSetup().withFormat();
    const { languageHandler: langHandler, yamlSettings: settings } = setupLanguageService(languageSettingsSetup.languageSettings);
    languageHandler = langHandler;
    yamlSettings = settings;
  });

  // Tests for formatter
  describe('Formatter', function () {
    describe('Test that formatter works with custom tags', function () {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function parseSetup(content: string, options: any = {}): Promise<TextEdit[]> {
        const testTextDocument = setupTextDocument(content);
        yamlSettings.documents = new TextDocumentTestManager();
        (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
        yamlSettings.yamlFormatterSettings = options;
        return languageHandler.formatterHandler({
          options,
          textDocument: testTextDocument,
        });
      }

      it('Formatting works without custom tags', async () => {
        const content = 'cwd: test';
        const edits = await parseSetup(content);
        console.dir({ edits });
        assert.notEqual(edits.length, 0);
        assert.equal(edits[0].newText, 'cwd: test\n');
      });

      it('Formatting works with custom tags', async () => {
        const content = 'cwd:       !Test test';
        const edits = await parseSetup(content);
        assert.notEqual(edits.length, 0);
        assert.equal(edits[0].newText, 'cwd: !Test test\n');
      });

      it('Formatting wraps text', async () => {
        const content = `comments: >
                test test test test test test test test test test test test`;
        const edits = await parseSetup(content, {
          printWidth: 20,
          proseWrap: 'always',
        });
        assert.equal(edits[0].newText, 'comments: >\n  test test test\n  test test test\n  test test test\n  test test test\n');
      });

      it('Formatting handles trailing commas (enabled)', async () => {
        const content = `{
  key: 'value',
  food: 'raisins',
  airport: 'YYZ',
  lightened_bulb: 'illuminating',
}
`;
        const edits = await parseSetup(content, { singleQuote: true });
        assert.equal(edits[0].newText, content);
      });

      it('Formatting handles trailing commas (disabled)', async () => {
        const content = `{
  key: 'value',
  food: 'raisins',
  airport: 'YYZ',
  lightened_bulb: 'illuminating',
}
`;
        const edits = await parseSetup(content, {
          singleQuote: true,
          trailingComma: false,
        });
        assert.equal(
          edits[0].newText,
          `{
  key: 'value',
  food: 'raisins',
  airport: 'YYZ',
  lightened_bulb: 'illuminating'
}
`
        );
      });

      it('Formatting uses tabSize', async () => {
        const content = `map:
  k1: v1
  k2: v2
list:
  - item1
  - item2
`;

        const edits = await parseSetup(content, {
          tabSize: 5,
        });

        const expected = `map:
     k1: v1
     k2: v2
list:
     - item1
     - item2
`;
        assert.equal(edits[0].newText, expected);
      });

      it('Formatting uses tabWidth', async () => {
        const content = `map:
  k1: v1
  k2: v2
list:
  - item1
  - item2
`;

        const edits = await parseSetup(content, {
          tabWidth: 5,
        });

        const expected = `map:
     k1: v1
     k2: v2
list:
     - item1
     - item2
`;
        assert.equal(edits[0].newText, expected);
      });

      it('Formatting uses tabWidth over tabSize', async () => {
        const content = `map:
  k1: v1
  k2: v2
list:
  - item1
  - item2
`;

        const edits = await parseSetup(content, {
          tabSize: 3,
          tabWidth: 5,
        });

        const expected = `map:
     k1: v1
     k2: v2
list:
     - item1
     - item2
`;
        assert.equal(edits[0].newText, expected);
      });
    });
  });
});
