/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { Diagnostic, Hover } from 'vscode-languageserver-types';

import type { LanguageHandlers } from '../src/languageserver/handlers/languageHandlers';
import type { ValidationHandler } from '../src/languageserver/handlers/validationHandlers';
import type { LanguageService } from '../src/languageservice/yamlLanguageService';
import type { SettingsState } from '../src/yamlSettings';

import assert from 'assert';
import * as path from 'path';

import { MarkupContent } from 'vscode-languageserver-types';

import { ServiceSetup } from './utils/serviceSetup';
import { setupLanguageService, setupTextDocument, toFsPath } from './utils/testHelper';
import { TextDocumentTestManager } from '../src/yamlSettings';

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
      .withIndentation('  ')
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

    function hoverSetup(content: string, position: number): Promise<Hover> {
      const testTextDocument = setupTextDocument(content);
      languageService.configure(languageSettingsSetup.languageSettings);
      yamlSettings.documents = new TextDocumentTestManager();
      (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
      return languageHandler.hoverHandler({
        position: testTextDocument.positionAt(position),
        textDocument: testTextDocument,
      });
    }

    it('Should validate multiple documents', async () => {
      const content = `
name: jack
age: 22
---
cwd: test
            `;
      const result = await validatorSetup(content);
      assert.equal(result.length, 0);
    });

    it('Should find errors in both documents', async () => {
      const content = `name1: jack
age: asd
---
cwd: False`;
      const result = await validatorSetup(content);
      assert.equal(result.length, 3);
    });

    it('Should find errors in first document', async () => {
      const content = `name: jack
age: age
---
cwd: test`;
      const result = await validatorSetup(content);
      assert.equal(result.length, 1);
    });

    it('Should find errors in second document', async () => {
      const content = `name: jack
age: 22
---
cwd: False
`;
      const result = await validatorSetup(content);
      assert.equal(result.length, 1);
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
