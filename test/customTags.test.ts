/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { Diagnostic } from 'vscode-languageserver-types';

import type { ValidationHandler } from '../src/languageserver/handlers/validationHandlers';
import type { LanguageService } from '../src/languageservice/yamlLanguageService';

import assert from 'assert';

import { ServiceSetup } from './utils/serviceSetup';
import { setupLanguageService, setupTextDocument } from './utils/testHelper';
import { createExpectedError } from './utils/verifyError';

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
    it('Custom Tags without type not specified', async () => {
      const content = 'scalar_test: !Test test_example';
      const result = await parseSetup(content, ['!Test']);
      assert.equal(result.length, 0);
    });

    it('Custom Tags with one type', async () => {
      const content = 'resolvers: !Ref\n  - test';
      const result = await parseSetup(content, ['!Ref sequence']);
      assert.equal(result.length, 0);
    });

    it('Custom Tags with multiple types', async () => {
      const content = 'resolvers: !Ref\n  - test';
      const result = await parseSetup(content, ['!Ref sequence', '!Ref mapping', '!Ref scalar']);
      assert.equal(result.length, 0);
    });

    it('Custom Tags with input and return types', async () => {
      const content = 'resolvers: !Ref\n  - test';
      const result = await parseSetup(content, ['!Ref sequence:string']);
      assert.equal(result.length, 0);
    });

    it('Allow multiple different custom tag types with different use', async () => {
      const content = '!test\nhello: !test\n  world';
      const result = await parseSetup(content, ['!test scalar', '!test mapping']);
      assert.equal(result.length, 0);
    });

    it('Allow multiple different custom tag types with multiple different uses', async () => {
      const content = '!test\nhello: !test\n  world\nsequence: !ref\n  - item1';
      const result = await parseSetup(content, ['!test scalar', '!test mapping', '!ref sequence', '!ref mapping']);
      assert.equal(result.length, 0);
    });
  });

  describe('Test that validation does throw errors', function () {
    it('Error when custom tag is not available', async () => {
      const content = '!test';
      const result = await parseSetup(content, []);
      assert.equal(result.length, 1);
      assert.deepEqual(result[0], createExpectedError('Unresolved tag: !test', 0, 0, 0, 5));
    });
  });
});
