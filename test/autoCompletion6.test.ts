/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver';
import { getLanguageService } from '../src/languageservice/yamlLanguageService';
import { toFsPath, schemaRequestService, workspaceContext } from './utils/testHelper';
import assert = require('assert');
import path = require('path');

const languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

const languageSettings = {
    schemas: [],
    completion: true
};

const uri = toFsPath(path.join(__dirname, './fixtures/testStringArray.json'));
const fileMatch = ['*.yml', '*.yaml'];
languageSettings.schemas.push({ uri, fileMatch: fileMatch });
languageService.configure(languageSettings);

suite('Auto Completion Tests', () => {


    describe('yamlCompletion with string array ', function () {

        describe('doComplete', function () {

            function setup (content: string) {
                return TextDocument.create('file://~/Desktop/vscode-k8s/test.yaml', 'yaml', 0, content);
            }

            function parseSetup (content: string, position) {
                const testTextDocument = setup(content);
                return languageService.doComplete(testTextDocument, testTextDocument.positionAt(position), false);
            }

            it('Completion should insert ""', done => {
                const content = 'fooBa';
                const completion = parseSetup(content, content.lastIndexOf('Ba') + 2);
                completion.then(function (result) {
                    assert.strictEqual('fooBar:\n\t- ${1:""}', result.items[0].insertText);
                }).then(done, done);
            });

        });
    });
});

