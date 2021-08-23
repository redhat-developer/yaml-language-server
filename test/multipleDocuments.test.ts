/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import { setupLanguageService, setupTextDocument, toFsPath } from './utils/testHelper';
import * as assert from 'assert';
import { ServiceSetup } from './utils/serviceSetup';
import { Diagnostic, Hover, MarkupContent } from 'vscode-languageserver';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';
import { LanguageService } from '../src/languageservice/yamlLanguageService';
import { ValidationHandler } from '../src/languageserver/handlers/validationHandlers';
import { LanguageHandlers } from '../src/languageserver/handlers/languageHandlers';

/**
 * Setup the schema we are going to use with the language settings
 */

// Defines a Mocha test describe to group tests of similar kind together
describe('Multiple Documents Validation Tests', () => {
  let languageSettingsSetup: ServiceSetup;
  let languageHandler: LanguageHandlers;
  let validationHandler: ValidationHandler;
  let languageService: LanguageService;
  let yamlSettings: SettingsState;

  before(() => {
    const uri = toFsPath(path.join(__dirname, './fixtures/customMultipleSchemaSequences.json'));
    const fileMatch = ['*.yml', '*.yaml'];
    languageSettingsSetup = new ServiceSetup()
      .withHover()
      .withValidate()
      .withSchemaFileMatch({
        fileMatch,
        uri,
      })
      .withCustomTags(['!Test', '!Ref sequence']);
    const {
      languageService: langService,
      validationHandler: valHandler,
      languageHandler: langHandler,
      yamlSettings: settings,
    } = setupLanguageService(languageSettingsSetup.languageSettings);
    languageService = langService;
    validationHandler = valHandler;
    languageHandler = langHandler;
    yamlSettings = settings;
  });

  describe('Multiple Documents Validation', function () {
    function validatorSetup(content: string): Promise<Diagnostic[]> {
      const testTextDocument = setupTextDocument(content);
      languageService.configure(languageSettingsSetup.languageSettings);
      return validationHandler.validateTextDocument(testTextDocument);
    }

    function hoverSetup(content: string, position): Promise<Hover> {
      const testTextDocument = setupTextDocument(content);
      languageService.configure(languageSettingsSetup.languageSettings);
      yamlSettings.documents = new TextDocumentTestManager();
      (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
      return languageHandler.hoverHandler({
        position: testTextDocument.positionAt(position),
        textDocument: testTextDocument,
      });
    }

    it('Should validate multiple documents', (done) => {
      const content = `
name: jack
age: 22
---
cwd: test
            `;
      const validator = validatorSetup(content);
      validator
        .then((result) => {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });

    it('Should find errors in both documents', (done) => {
      const content = `name1: jack
age: asd
---
cwd: False`;
      const validator = validatorSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 3);
        })
        .then(done, done);
    });

    it('Should find errors in first document', (done) => {
      const content = `name: jack
age: age
---
cwd: test`;
      const validator = validatorSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 1);
        })
        .then(done, done);
    });

    it('Should find errors in second document', (done) => {
      const content = `name: jack
age: 22
---
cwd: False
`;
      const validator = validatorSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 1);
        })
        .then(done, done);
    });

    it('Should hover in first document', async () => {
      const content = 'name: jack\nage: 22\n---\ncwd: False';
      const result = await hoverSetup(content, 1 + content.indexOf('age'));

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual((result.contents as MarkupContent).kind, 'markdown');
      assert.strictEqual((result.contents as MarkupContent).value, 'The age of this person');
    });
  });
});
