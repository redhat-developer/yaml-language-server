/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { setupLanguageService, setupTextDocument } from './utils/testHelper';
import assert = require('assert');
import { ServiceSetup } from './utils/serviceSetup';
import { DocumentLink } from 'vscode-languageserver';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';
import { LanguageHandlers } from '../src/languageserver/handlers/languageHandlers';

describe('FindDefintion Tests', () => {
  let languageHandler: LanguageHandlers;
  let yamlSettings: SettingsState;

  before(() => {
    const languageSettingsSetup = new ServiceSetup();
    const { languageHandler: langHandler, yamlSettings: settings } = setupLanguageService(languageSettingsSetup.languageSettings);
    languageHandler = langHandler;
    yamlSettings = settings;
  });

  describe('Jump to definition', function () {
    function findLinks(content: string): Promise<DocumentLink[]> {
      const testTextDocument = setupTextDocument(content);
      yamlSettings.documents = new TextDocumentTestManager();
      (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
      return languageHandler.documentLinkHandler({
        textDocument: testTextDocument,
      });
    }

    it('Find source definition', (done) => {
      const content =
        "definitions:\n  link:\n    type: string\ntype: object\nproperties:\n  uri:\n    $ref: '#/definitions/link'\n";
      const definitions = findLinks(content);
      definitions
        .then(function (results) {
          assert.equal(results.length, 1);
          assert.deepEqual(results[0].range, {
            start: {
              line: 6,
              character: 11,
            },
            end: {
              line: 6,
              character: 29,
            },
          });
          assert.deepEqual(results[0].target, 'file://~/Desktop/vscode-k8s/test.yaml#3,5');
        })
        .then(done, done);
    });
  });
});
