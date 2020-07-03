/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TextDocument } from 'vscode-languageserver';
import { getLanguageService } from '../src/languageservice/yamlLanguageService';
import { toFsPath, schemaRequestService, workspaceContext }  from './utils/testHelper';
import assert = require('assert');
import path = require('path');

const languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

const languageSettings = {
    schemas: [],
    completion: true
};

const uri = toFsPath(path.join(__dirname, './fixtures/testArrayMaxProperties.json'));
const fileMatch = ['*.yml', '*.yaml'];
languageSettings.schemas.push({ uri, fileMatch: fileMatch });
languageService.configure(languageSettings);

suite('Auto Completion Tests', () => {

    describe('yamlCompletion with array having maxProperties set', function () {

        describe('doComplete', function () {

            function setup(content: string) {
                return TextDocument.create('file://~/Desktop/vscode-k8s/test.yaml', 'yaml', 0, content);
            }

            function parseSetup(content: string, position) {
                const testTextDocument = setup(content);
                return languageService.doComplete(testTextDocument, testTextDocument.positionAt(position), false);
            }

            it('Provide the 3 types when none provided', done => {
                const content = '- ';
                const completion = parseSetup(content, content.length);
                completion.then(function (result) {
                    assert.equal(result.items.length, 3);
                }).then(done, done);
            });

            it('Provide the 3 types when none provided', done => {
                const content = '- prop1:\n  ';
                const completion = parseSetup(content, content.length);
                completion.then(function (result) {
                    assert.equal(result.items.length, 2);
                }).then(done, done);
            });

            it('Provide no completion when maxProperties reached', done => {
                const content = '- prop1:\n  prop2:\n  ';
                const completion = parseSetup(content, content.length);
                completion.then(function (result) {
                    assert.equal(result.items.length, 0);
                }).then(done, done);
            });

        });
    });
});
