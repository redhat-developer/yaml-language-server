/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Diagnostic } from 'vscode-languageserver-types';
import { ValidationHandler } from '../src/languageserver/handlers/validationHandlers';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';
import { ServiceSetup } from './utils/serviceSetup';
import { setupLanguageService, setupSchemaIDTextDocument } from './utils/testHelper';
import { expect } from 'chai';
import { createExpectedError } from './utils/verifyError';

describe('YAML Validation Tests', () => {
  let languageSettingsSetup: ServiceSetup;
  let validationHandler: ValidationHandler;
  let yamlSettings: SettingsState;
  before(() => {
    languageSettingsSetup = new ServiceSetup().withValidate();
    const { validationHandler: valHandler, yamlSettings: settings } = setupLanguageService(
      languageSettingsSetup.languageSettings
    );
    validationHandler = valHandler;
    yamlSettings = settings;
  });

  function parseSetup(content: string, customSchemaID?: string): Promise<Diagnostic[]> {
    const testTextDocument = setupSchemaIDTextDocument(content, customSchemaID);
    yamlSettings.documents = new TextDocumentTestManager();
    (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
    return validationHandler.validateTextDocument(testTextDocument);
  }
  describe('TAB Character diagnostics', () => {
    it('Should report if TAB character present', async () => {
      const yaml = 'foo:\n\t- bar';
      const result = await parseSetup(yaml);
      expect(result).is.not.empty;
      expect(result.length).to.be.equal(1);
      expect(result[0]).deep.equal(createExpectedError('Using tabs can lead to unpredictable results', 1, 0, 1, 1));
    });

    it('Should report one error for TAB character present in a row', async () => {
      const yaml = 'foo:\n\t\t- bar';
      const result = await parseSetup(yaml);
      expect(result).is.not.empty;
      expect(result.length).to.be.equal(1);
      expect(result[0]).deep.equal(createExpectedError('Using tabs can lead to unpredictable results', 1, 0, 1, 2));
    });

    it('Should report one error for TAB`s characters present in the middle of indentation', async () => {
      const yaml = 'foo:\n \t\t\t - bar';
      const result = await parseSetup(yaml);
      expect(result).is.not.empty;
      expect(result.length).to.be.equal(1);
      expect(result[0]).deep.equal(createExpectedError('Using tabs can lead to unpredictable results', 1, 1, 1, 4));
    });
  });
});
