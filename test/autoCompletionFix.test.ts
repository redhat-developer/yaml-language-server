/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompletionList, Position } from 'vscode-languageserver/node';
import { LanguageHandlers } from '../src/languageserver/handlers/languageHandlers';
import { LanguageService } from '../src/languageservice/yamlLanguageService';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';
import { ServiceSetup } from './utils/serviceSetup';
import { SCHEMA_ID, setupLanguageService, setupSchemaIDTextDocument } from './utils/testHelper';
import { expect } from 'chai';
import { createExpectedCompletion } from './utils/verifyError';
import * as path from 'path';

describe('Auto Completion Fix Tests', () => {
  let languageSettingsSetup: ServiceSetup;
  let languageService: LanguageService;
  let languageHandler: LanguageHandlers;
  let yamlSettings: SettingsState;

  before(() => {
    languageSettingsSetup = new ServiceSetup().withCompletion().withSchemaFileMatch({
      uri: 'https://raw.githubusercontent.com/yannh/kubernetes-json-schema/master/v1.20.5-standalone-strict/all.json',
      fileMatch: [SCHEMA_ID],
    });
    const { languageService: langService, languageHandler: langHandler, yamlSettings: settings } = setupLanguageService(
      languageSettingsSetup.languageSettings
    );
    languageService = langService;
    languageHandler = langHandler;
    yamlSettings = settings;
  });

  function parseSetup(content: string, line: number, character: number): Promise<CompletionList> {
    const testTextDocument = setupSchemaIDTextDocument(content);
    yamlSettings.documents = new TextDocumentTestManager();
    (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
    return languageHandler.completionHandler({
      position: Position.create(line, character),
      textDocument: testTextDocument,
    });
  }

  afterEach(() => {
    languageService.deleteSchema(SCHEMA_ID);
    languageService.configure(languageSettingsSetup.languageSettings);
  });

  it('should show completion on map under array', async () => {
    languageService.addSchema(SCHEMA_ID, {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: {
            type: 'object',
            properties: {
              foo: {
                type: 'boolean',
              },
            },
          },
        },
      },
    });
    const content = '- from:\n    ';
    const completion = await parseSetup(content, 1, 3);
    expect(completion.items).lengthOf(1);
    expect(completion.items[0]).eql(
      createExpectedCompletion('foo', 'foo: ', 1, 3, 1, 3, 10, 2, {
        documentation: '',
      })
    );
  });

  it('should show completion on array empty array item', async () => {
    languageService.addSchema(SCHEMA_ID, {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: {
            type: 'object',
            properties: {
              foo: {
                type: 'boolean',
              },
            },
          },
        },
      },
    });
    const content = '- ';
    const completion = await parseSetup(content, 0, 2);
    expect(completion.items).lengthOf(1);
    expect(completion.items[0]).eql(
      createExpectedCompletion('from', 'from:\n    ', 0, 2, 0, 2, 10, 2, {
        documentation: '',
      })
    );
  });

  it('should show completion items in the middle of map in array', async () => {
    const content = `apiVersion: v1
kind: Pod
metadata:
  name: foo
spec:
  containers:
    - name: test
      
      image: alpine
    `;
    const completion = await parseSetup(content, 7, 6);
    expect(completion.items).length.greaterThan(1);
  });

  it('should show completion on array item on first line', async () => {
    const content = '-d';
    const completion = await parseSetup(content, 0, 1);
    expect(completion.items).is.empty;
  });

  it('should complete without error on map inside array', async () => {
    const content = '- foo\n- bar:\n    so';
    const completion = await parseSetup(content, 2, 6);
    expect(completion.items).is.empty;
  });

  it('should complete  array', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const schema = require(path.join(__dirname, './fixtures/test-nested-object-array.json'));
    languageService.addSchema(SCHEMA_ID, schema);
    const content = `objA:
  - name: nameA1
      
objB:
  size: midle
  name: nameB2  
`;
    const completion = await parseSetup(content, 2, 4);
    expect(completion.items).is.not.empty;
  });
});
