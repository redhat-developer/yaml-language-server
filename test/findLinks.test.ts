/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { setupTextDocument, configureLanguageService } from './utils/testHelper';
import assert = require('assert');
import { ServiceSetup } from './utils/serviceSetup';
import { DocumentLink } from 'vscode-languageserver';

const languageService = configureLanguageService(new ServiceSetup().languageSettings);

suite('FindDefintion Tests', () => {
  describe('Jump to defintion', function () {
    function findLinks(content: string): Thenable<DocumentLink[]> {
      const testTextDocument = setupTextDocument(content);
      return languageService.findLinks(testTextDocument);
    }

    it('Find source defintion', (done) => {
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
