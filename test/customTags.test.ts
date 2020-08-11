/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { setupTextDocument, configureLanguageService } from './utils/testHelper';
import { ServiceSetup } from './utils/serviceSetup';
import { createExpectedError } from './utils/verifyError';
import * as assert from 'assert';

const languageSettingsSetup = new ServiceSetup().withValidate();
let languageService = configureLanguageService(languageSettingsSetup.languageSettings);

// Defines a Mocha test suite to group tests of similar kind together
suite('Custom Tag tests Tests', () => {
  function parseSetup(content: string, customTags: string[]) {
    const testTextDocument = setupTextDocument(content);
    languageSettingsSetup.languageSettings.customTags = customTags;
    languageService = configureLanguageService(languageSettingsSetup.languageSettings);
    return languageService.doValidation(testTextDocument, false);
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
      const validator = parseSetup(content, [
        '!test scalar',
        '!test mapping',
        '!ref sequence',
        '!ref mapping',
      ]);
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
          assert.deepEqual(result[0], createExpectedError('unknown tag <!test>', 0, 0, 0, 0));
        })
        .then(done, done);
    });
  });
});
