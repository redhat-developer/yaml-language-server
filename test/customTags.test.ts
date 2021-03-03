/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { setupLanguageService, setupTextDocument } from './utils/testHelper';
import { ServiceSetup } from './utils/serviceSetup';
import { createExpectedError } from './utils/verifyError';
import * as assert from 'assert';
import { Diagnostic } from 'vscode-languageserver';
import { LanguageService } from '../src/languageservice/yamlLanguageService';
import { ValidationHandler } from '../src/languageserver/handlers/validationHandlers';

// Defines a Mocha test describe to group tests of similar kind together
describe('Custom Tag tests Tests', () => {
  let languageSettingsSetup: ServiceSetup;
  let languageService: LanguageService;
  let validationHandler: ValidationHandler;

  before(() => {
    languageSettingsSetup = new ServiceSetup().withValidate();
    const { languageService: langService, validationHandler: valHandler } = setupLanguageService(
      languageSettingsSetup.languageSettings
    );
    validationHandler = valHandler;
    languageService = langService;
  });

  function parseSetup(content: string, customTags: string[]): Promise<Diagnostic[]> {
    const testTextDocument = setupTextDocument(content);
    languageSettingsSetup.languageSettings.customTags = customTags;
    languageService.configure(languageSettingsSetup.languageSettings);
    return validationHandler.validateTextDocument(testTextDocument);
  }

  describe('Test that validation does not throw errors', function () {
    it('Custom Tags without type not specified', (done) => {
      const content = 'scalar_test: !Test test_example';
      const validator = parseSetup(content, ['!Test']);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });

    it('Custom Tags with one type', (done) => {
      const content = 'resolvers: !Ref\n  - test';
      const validator = parseSetup(content, ['!Ref sequence']);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });

    it('Custom Tags with multiple types', (done) => {
      const content = 'resolvers: !Ref\n  - test';
      const validator = parseSetup(content, ['!Ref sequence', '!Ref mapping', '!Ref scalar']);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });

    it('Allow multiple different custom tag types with different use', (done) => {
      const content = '!test\nhello: !test\n  world';
      const validator = parseSetup(content, ['!test scalar', '!test mapping']);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });

    it('Allow multiple different custom tag types with multiple different uses', (done) => {
      const content = '!test\nhello: !test\n  world\nsequence: !ref\n  - item1';
      const validator = parseSetup(content, ['!test scalar', '!test mapping', '!ref sequence', '!ref mapping']);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });
  });

  describe('Test that validation does throw errors', function () {
    it('Error when custom tag is not available', (done) => {
      const content = '!test';
      const validator = parseSetup(content, []);
      validator
        .then(function (result) {
          assert.equal(result.length, 1);
          assert.deepEqual(result[0], createExpectedError('unknown tag <!test>', 0, 0, 0, 5));
        })
        .then(done, done);
    });
  });
});
