/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getLanguageService } from '../src/languageservice/yamlLanguageService';
import { schemaRequestService, setupTextDocument, workspaceContext } from './utils/testHelper';
import assert = require('assert');

const languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

suite('FindDefintion Tests', () => {

    describe('Jump to defintion', function () {

        function findDefinitions (content: string, position: number) {
            const testTextDocument = setupTextDocument(content);
            return languageService.findDefinition(testTextDocument, testTextDocument.positionAt(position));
        }

        it('Find source defintion', done => {
            const content = "definitions:\n  link:\n    type: string\ntype: object\nproperties:\n  uri:\n    $ref: '#/definitions/link'\n";
            const definitions = findDefinitions(content, content.lastIndexOf('/li'));
            definitions.then(function (results) {
                assert.equal(results.length, 1);
                assert.deepEqual(results[0].originSelectionRange, {
                    start: {
                        line: 6,
                        character: 10
                    },
                    end: {
                        line: 6,
                        character: 30
                    }
                });
                assert.deepEqual(results[0].targetRange, {
                    start: {
                        line: 2,
                        character: 4
                    },
                    end: {
                        line: 2,
                        character: 16
                    }
                });
            }).then(done, done);
        });
    });
});
