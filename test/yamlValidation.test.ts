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
import { createExpectedError, createUnusedAnchorDiagnostic } from './utils/verifyError';

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

  function parseSetup(content: string, customSchemaID?: string, enableDisableOption?: boolean): Promise<Diagnostic[]> {
    const testTextDocument = setupSchemaIDTextDocument(content, customSchemaID, enableDisableOption);
    yamlSettings.documents = new TextDocumentTestManager();
    (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
    (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
    return validationHandler.validateTextDocument(testTextDocument);
  }
  describe('TAB Character diagnostics', () => {
    it('Should report if TAB character present', async () => {
      const yaml = 'foo:\n\t- bar';
      const result = await parseSetup(yaml);
      expect(result).is.not.empty;
      expect(result.length).to.be.equal(1);
      expect(result[0]).deep.equal(createExpectedError('Tabs are not allowed as indentation', 1, 0, 1, 6));
    });

    it('Should report one error for TAB character present in a row', async () => {
      const yaml = 'foo:\n\t\t- bar';
      const result = await parseSetup(yaml);
      expect(result).is.not.empty;
      expect(result.length).to.be.equal(1);
      expect(result[0]).deep.equal(createExpectedError('Tabs are not allowed as indentation', 1, 0, 1, 7));
    });

    it('Should report one error for TAB`s characters present in the middle of indentation', async () => {
      const yaml = 'foo:\n \t\t\t - bar';
      const result = await parseSetup(yaml);
      expect(result).is.not.empty;
      expect(result.length).to.be.equal(1);
      expect(result[0]).deep.equal(createExpectedError('Tabs are not allowed as indentation', 1, 1, 1, 10));
    });
  });

  describe('Unused anchors diagnostics', () => {
    it('should report unused anchor', async () => {
      const yaml = 'foo: &bar bar\n';
      const result = await parseSetup(yaml);
      expect(result).is.not.empty;
      expect(result.length).to.be.equal(1);
      expect(result[0]).deep.equal(createUnusedAnchorDiagnostic('Unused anchor "&bar"', 0, 5, 0, 9));
    });

    it('should not report used anchor', async () => {
      const yaml = 'foo: &bar bar\nfff: *bar';
      const result = await parseSetup(yaml);
      expect(result).is.empty;
    });

    it('should report unused anchors in array ', async () => {
      const yaml = `foo: &bar   doe
aaa: some
dd: *ba
some: 
  &a ss: ss
&aa ff: 
  - s
  - o
  - &e m
  - e`;
      const result = await parseSetup(yaml);
      expect(result).is.not.empty;
      expect(result.length).to.be.equal(4);
      expect(result).to.include.deep.members([
        createUnusedAnchorDiagnostic('Unused anchor "&bar"', 0, 5, 0, 9),
        createUnusedAnchorDiagnostic('Unused anchor "&a"', 4, 2, 4, 4),
        createUnusedAnchorDiagnostic('Unused anchor "&aa"', 5, 0, 5, 3),
        createUnusedAnchorDiagnostic('Unused anchor "&e"', 8, 4, 8, 6),
      ]);
    });
  });

  describe('Enable/Disable schema validation on Yaml File', () => {
    it('Disable File', async () => {
      const yaml = 'foo:\n\t- bar';
      const result = await parseSetup(yaml, undefined, true);
      expect(result).is.empty;
      expect(result.length).to.be.equal(0);
    });
  });
});
