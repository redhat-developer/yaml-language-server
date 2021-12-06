/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { CompletionList, TextEdit } from 'vscode-languageserver/node';
import { LanguageHandlers } from '../src/languageserver/handlers/languageHandlers';
import { LanguageService } from '../src/languageservice/yamlLanguageService';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';
import { ServiceSetup } from './utils/serviceSetup';
import { SCHEMA_ID, setupLanguageService, setupSchemaIDTextDocument } from './utils/testHelper';
import assert = require('assert');

describe('Auto Completion Extended Tests', () => {
  let languageSettingsSetup: ServiceSetup;
  let languageService: LanguageService;
  let languageHandler: LanguageHandlers;
  let yamlSettings: SettingsState;

  before(() => {
    languageSettingsSetup = new ServiceSetup().withCompletion().withSchemaFileMatch({
      uri: 'http://google.com',
      fileMatch: ['bad-schema.yaml'],
    });
    const { languageService: langService, languageHandler: langHandler, yamlSettings: settings } = setupLanguageService(
      languageSettingsSetup.languageSettings
    );
    languageService = langService;
    languageHandler = langHandler;
    yamlSettings = settings;
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

  afterEach(() => {
    languageService.deleteSchema(SCHEMA_ID);
    languageService.configure(languageSettingsSetup.languageSettings);
  });

  describe('Inline object completion', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const inlineObjectSchema = require(path.join(__dirname, './fixtures/testInlineObject.json'));

    it('simple-null', (done) => {
      languageService.addSchema(SCHEMA_ID, inlineObjectSchema);
      const content = 'value: ';
      const completion = parseSetup(content, content.length);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 1);
          assert.equal(result.items[0].insertText, '=@ctx');
        })
        .then(done, done);
    });
    it('simple-context.', (done) => {
      languageService.addSchema(SCHEMA_ID, inlineObjectSchema);
      const content = 'value: =@ctx.';
      const completion = parseSetup(content, content.length);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 2);
          assert.equal(result.items[0].insertText, 'user');
        })
        .then(done, done);
    });
    // need https://github.com/p-spacek/yaml-language-server/issues/18
    it.skip('simple-context.da', (done) => {
      languageService.addSchema(SCHEMA_ID, inlineObjectSchema);
      const content = 'value: =@ctx.da';
      const completion = parseSetup(content, content.length);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 2);
          assert.equal(result.items[0].insertText, 'user');
          assert.equal(result.items[1].insertText, 'data');
          assert.deepStrictEqual((result.items[1].textEdit as TextEdit).range.start, {
            line: 0,
            character: content.lastIndexOf('.') + 1,
          });
        })
        .then(done, done);
    });
    it('anyOf[obj|ref]-null', (done) => {
      languageService.addSchema(SCHEMA_ID, inlineObjectSchema);
      const content = 'value1: ';
      const completion = parseSetup(content, content.length);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 2);
          assert.equal(result.items[0].insertText, '\n  prop1: ');
          assert.equal(result.items[1].insertText, '=@ctx');
        })
        .then(done, done);
    });
    it('anyOf[obj|ref]-insideObject', (done) => {
      languageService.addSchema(SCHEMA_ID, inlineObjectSchema);
      const content = 'value1:\n  ';
      const completion = parseSetup(content, content.length);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 2); // better to have 1 here
          assert.equal(result.items[0].label, 'prop1');
        })
        .then(done, done);
    });
    it('anyOf[const|ref]-null', (done) => {
      languageService.addSchema(SCHEMA_ID, inlineObjectSchema);
      const content = 'value2: ';
      const completion = parseSetup(content, content.length);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 3);
          assert.equal(result.items[0].insertText, 'const1');
          assert.equal(result.items[2].insertText, '=@ctx');
        })
        .then(done, done);
    });
    it('anyOf[const|ref]-context.', (done) => {
      languageService.addSchema(SCHEMA_ID, inlineObjectSchema);
      const content = 'value2: =@ctx.';
      const completion = parseSetup(content, content.length);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 2);
          assert.equal(result.items[0].insertText, 'user');
          assert.equal(result.items[1].insertText, 'data');
        })
        .then(done, done);
    });
    // need https://github.com/p-spacek/yaml-language-server/issues/18
    it.skip('anyOf[const|ref]-context.da', (done) => {
      languageService.addSchema(SCHEMA_ID, inlineObjectSchema);
      const content = 'value2: =@ctx.da';
      const completion = parseSetup(content, content.length);
      completion
        .then(function (result) {
          assert.equal(result.items.length, 2);
          assert.equal(result.items[0].insertText, 'user');
          assert.equal(result.items[1].insertText, 'data');
          assert.deepStrictEqual((result.items[1].textEdit as TextEdit).range.start, {
            line: 0,
            character: content.lastIndexOf('.') + 1,
          });
        })
        .then(done, done);
    });
  });
});
