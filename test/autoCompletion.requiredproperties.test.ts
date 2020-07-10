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

const uri = toFsPath(path.join(__dirname, './fixtures/testRequiredProperties.json'));
const fileMatch = ['*.yml', '*.yaml'];
languageSettings.schemas.push({ uri, fileMatch: fileMatch });
languageService.configure(languageSettings);

suite('Auto Completion Tests for required properties', () => {

    describe('yamlCompletion with required properties', function () {

        describe('doComplete', function () {

            function setup(content: string) {
                return TextDocument.create('file://~/Desktop/vscode-k8s/test.yaml', 'yaml', 0, content);
            }

            function parseSetup(content: string, position) {
                const testTextDocument = setup(content);
                return languageService.doComplete(testTextDocument, testTextDocument.positionAt(position), false);
            }

            it('Insert required attributes at correct level', done => {
                const content = '- top:\n    prop1: demo\n- ';
                const completion = parseSetup(content, content.length);
                completion.then(function (result) {
                    const insertText = result.items[0].insertText;
                    assert.equal(insertText, 'top:\n  \tprop1: $1');
                }).then(done, done);
            });
           
            it('Insert required attributes at correct level even on first element', done => {
                const content = '- ';
                const completion = parseSetup(content, content.length);
                completion.then(function (result) {
                    const insertText = result.items[0].insertText;
                    assert.equal(insertText, 'top:\n  \tprop1: $1');
                }).then(done, done);
            });

        });
    });
});
