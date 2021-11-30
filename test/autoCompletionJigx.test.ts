/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { CompletionList, Position } from 'vscode-languageserver/node';
import { LanguageHandlers } from '../src/languageserver/handlers/languageHandlers';
import { LanguageService } from '../src/languageservice/yamlLanguageService';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';
import { ServiceSetup } from './utils/serviceSetup';
import { SCHEMA_ID, setupLanguageService, setupSchemaIDTextDocument } from './utils/testHelper';
import { createExpectedCompletion } from './utils/verifyError';

describe('Jigx Auto Completion Tests', () => {
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

  it('should insert quotation value if there is special char', async () => {
    languageService.addSchema(SCHEMA_ID, {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          const: '@test',
        },
      },
    });
    const content = 'from: ';
    const completion = await parseSetup(content, content.length);

    expect(completion.items.length).equal(1);
    expect(completion.items[0]).to.deep.equal(
      createExpectedCompletion('@test', "'@test'", 0, 6, 0, 6, 12, 2, {
        documentation: undefined,
      })
    );
  });
});
