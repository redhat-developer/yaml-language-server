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

const uri = toFsPath(path.join(__dirname, './fixtures/testArrayIndent.json'));
const fileMatch = ['*.yml', '*.yaml'];
languageSettings.schemas.push({ uri, fileMatch: fileMatch });
languageService.configure(languageSettings);

suite('Auto Completion Tests', () => {

    describe('yamlCompletion with array object', function () {

        describe('doComplete', function () {

            function setup(content: string) {
                return TextDocument.create('file://~/Desktop/vscode-k8s/test.yaml', 'yaml', 0, content);
            }

            function parseSetup(content: string, position) {
                const testTextDocument = setup(content);
                return languageService.doComplete(testTextDocument, testTextDocument.positionAt(position), false);
            }

            it('Indent should be considered with position relative to slash', done => {
                const content = 'install:\n  - he';
                const completion = parseSetup(content, content.lastIndexOf('he') + 2);
                completion.then(function (result) {
                    assert.equal('helm:\n  \tname: $1', result.items[0].insertText);
                }).then(done, done);
            });

            it('Large indent should be considered with position relative to slash', done => {
                const content = 'install:\n -            he';
                const completion = parseSetup(content, content.lastIndexOf('he') + 2);
                completion.then(function (result) {
                    assert.equal('helm:\n             \tname: $1', result.items[0].insertText);
                }).then(done, done);
            });

             it('Tab indent should be considered with position relative to slash', done => {
                const content = 'install:\n -\t             he';
                const completion = parseSetup(content, content.lastIndexOf('he') + 2);
                completion.then(function (result) {
                    assert.equal('helm:\n \t             \tname: $1', result.items[0].insertText);
                }).then(done, done);
            });

        });
    });
});
