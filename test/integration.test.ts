/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getLanguageService, LanguageSettings } from '../src/languageservice/yamlLanguageService';
import { schemaRequestService, workspaceContext, createJSONLanguageService, setupTextDocument }  from './utils/testHelper';
import { parse as parseYAML } from '../src/languageservice/parser/yamlParser04';
import { parse as parseYAML2 } from '../src/languageservice/parser/yamlParser07';
import { getLineOffsets } from '../src/languageservice/utils/arrUtils';
import { TextDocument } from 'vscode-languageserver-types';
const assert = require('assert');

const languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

const uri = 'https://raw.githubusercontent.com/garethr/kubernetes-json-schema/master/v1.14.0-standalone-strict/all.json';
const languageSettings: LanguageSettings = {
    schemas: [],
    validate: true,
    completion: true
};
const fileMatch = ['*.yml', '*.yaml'];
languageSettings.schemas.push({ uri, fileMatch: fileMatch });
languageService.configure(languageSettings);

// Defines a Mocha test suite to group tests of similar kind together
suite('Kubernetes Integration Tests', () => {

    // Tests for validator
    describe('Yaml Validation with kubernetes', function () {

        function parseSetup(content: string){
            const testTextDocument = setupTextDocument(content);
            const yDoc = parseYAML2(testTextDocument.getText());
            const jsonLanguageService = createJSONLanguageService();
            jsonLanguageService.configure({
                validate: true,
                schemas: [{
                    fileMatch,
                    uri
                }]
            });
            return languageService.doValidation(jsonLanguageService, testTextDocument, yDoc, true);
        }

        //Validating basic nodes
        describe('Test that validation does not throw errors', function (){

            it('Basic test', done => {
                const content = 'apiVersion: v1';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 0);
                }).then(done, done);
            });

            it('Basic test on nodes with children', done => {
                const content = 'metadata:\n  name: hello';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 0);
                }).then(done, done);
            });

            it('Advanced test on nodes with children', done => {
                const content = 'apiVersion: v1\nmetadata:\n  name: test1';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 0);
                }).then(done, done);
            });

            it('Type string validates under children', done => {
                const content = 'apiVersion: v1\nkind: Pod\nmetadata:\n  resourceVersion: test';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 0);
                }).then(done, done);
            });

            describe('Type tests', function (){

                it('Type String does not error on valid node', done => {
                    const content = 'apiVersion: v1';
                    const validator = parseSetup(content);
                    validator.then(function (result){
                        assert.equal(result.length, 0);
                    }).then(done, done);
                });

                it('Type Boolean does not error on valid node', done => {
                    const content = 'readOnlyRootFilesystem: false';
                    const validator = parseSetup(content);
                    validator.then(function (result){
                        assert.equal(result.length, 0);
                    }).then(done, done);
                });

                it('Type Number does not error on valid node', done => {
                    const content = 'generation: 5';
                    const validator = parseSetup(content);
                    validator.then(function (result){
                        assert.equal(result.length, 0);
                    }).then(done, done);
                });

                it('Type Object does not error on valid node', done => {
                    const content = 'metadata:\n  clusterName: tes';
                    const validator = parseSetup(content);
                    validator.then(function (result){
                        assert.equal(result.length, 0);
                    }).then(done, done);
                });

                it('Type Array does not error on valid node', done => {
                    const content = 'items:\n  - apiVersion: v1';
                    const validator = parseSetup(content);
                    validator.then(function (result){
                        assert.equal(result.length, 0);
                    }).then(done, done);
                });

            });

        });

        /**
         * Removed these tests because the schema pulled in from
         * https://github.com/redhat-developer/yaml-language-server/pull/108
         * No longer has those types of validation
         */
        // describe('Test that validation DOES throw errors', function () {
        //     it('Error when theres no value for a node', done => {
        //         const content = 'apiVersion:';
        //         const validator = parseSetup(content);
        //         validator.then(function (result){
        //             assert.notEqual(result.length, 0);
        //         }).then(done, done);
        //     });

        //     it('Error on incorrect value type (number)', done => {
        //         const content = 'apiVersion: 1000';
        //         const validator = parseSetup(content);
        //         validator.then(function (result){
        //             assert.notEqual(result.length, 0);
        //         }).then(done, done);
        //     });

        //     it('Error on incorrect value type (boolean)', done => {
        //         const content = 'apiVersion: False';
        //         const validator = parseSetup(content);
        //         validator.then(function (result){
        //             assert.notEqual(result.length, 0);
        //         }).then(done, done);
        //     });

        //     it('Error on incorrect value type (string)', done => {
        //         const content = 'isNonResourceURL: hello_world';
        //         const validator = parseSetup(content);
        //         validator.then(function (result){
        //             assert.notEqual(result.length, 0);
        //         }).then(done, done);
        //     });

        //     it('Error on incorrect value type (object)', done => {
        //         const content = 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: False';
        //         const validator = parseSetup(content);
        //         validator.then(function (result){
        //             assert.notEqual(result.length, 0);
        //         }).then(done, done);
        //     });

        //     it('Error on incorrect value type in multiple yaml documents', done => {
        //         const content = '---\napiVersion: v1\n...\n---\napiVersion: False\n...';
        //         const validator = parseSetup(content);
        //         validator.then(function (result){
        //             assert.notEqual(result.length, 0);
        //         }).then(done, done);
        //     });

        //     it('Property error message should be \"Property unknown_node is not allowed.\" when property is not allowed ', done => {
        //         const content = 'unknown_node: test';
        //         const validator = parseSetup(content);
        //         validator.then(function (result){
        //             assert.equal(result.length, 1);
        //             assert.equal(result[0].message, 'Property unknown_node is not allowed.');
        //         }).then(done, done);
        //     });

        // });

    });

    describe('yamlCompletion with kubernetes', function (){

        describe('doComplete', function (){

            function parseSetup(content: string, position){
                const testTextDocument = setupTextDocument(content);
                return completionHelper(testTextDocument, testTextDocument.positionAt(position));
            }

            it('Autocomplete on root node without word', done => {
                const content = '';
                const completion = parseSetup(content, 0);
                completion.then(function (result){
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            /**
             * Known issue: https://github.com/redhat-developer/yaml-language-server/issues/51
             */
            // it('Autocomplete on root node with word', done => {
            //     const content = 'api';
            //     const completion = parseSetup(content, 6);
            //     completion.then(function (result){
            //         assert.notEqual(result.items.length, 0);
            //     }).then(done, done);
            // });

             /**
              * Removed these tests because the schema pulled in from
              * https://github.com/redhat-developer/yaml-language-server/pull/108
              * No longer has those types of completion
              */
            // it('Autocomplete on default value (without value content)', done => {
            //     const content = 'apiVersion: ';
            //     const completion = parseSetup(content, 10);
            //     completion.then(function (result){
            //         assert.notEqual(result.items.length, 0);
            //     }).then(done, done);
            // });

            it('Autocomplete on default value (with value content)', done => {
                const content = 'apiVersion: v1\nkind: Depl';
                const completion = parseSetup(content, 19);
                completion.then(function (result){
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it('Autocomplete on boolean value (without value content)', done => {
                const content = 'spec:\n  allowPrivilegeEscalation: ';
                const completion = parseSetup(content, 38);
                completion.then(function (result){
                    assert.equal(result.items.length, 2);
                }).then(done, done);
            });

            it('Autocomplete on boolean value (with value content)', done => {
                const content = 'spec:\n  allowPrivilegeEscalation: fal';
                const completion = parseSetup(content, 43);
                completion.then(function (result){
                    assert.equal(result.items.length, 2);
                }).then(done, done);
            });

            it('Autocomplete key in middle of file', done => {
                const content = 'metadata:\n  nam';
                const completion = parseSetup(content, 14);
                completion.then(function (result){
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it('Autocomplete key in middle of file 2', done => {
                const content = 'metadata:\n  name: test\n  cluster';
                const completion = parseSetup(content, 31);
                completion.then(function (result){
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });
        });
    });

});

function is_EOL(c) {
    return (c === 0x0A/* LF */) || (c === 0x0D/* CR */);
}

function completionHelper(document: TextDocument, textDocumentPosition){

        //Get the string we are looking at via a substring
        const linePos = textDocumentPosition.line;
        const position = textDocumentPosition;
        const lineOffset = getLineOffsets(document.getText());
        const start = lineOffset[linePos]; //Start of where the autocompletion is happening
        let end = 0; //End of where the autocompletion is happening
        if (lineOffset[linePos + 1]){
            end = lineOffset[linePos + 1];
        }else{
            end = document.getText().length;
        }

        while (end - 1 >= 0 && is_EOL(document.getText().charCodeAt(end - 1))) {
            end--;
        }

        const textLine = document.getText().substring(start, end);

        //Check if the string we are looking at is a node
        if (textLine.indexOf(':') === -1){
            //We need to add the ":" to load the nodes

            let newText = '';

            //This is for the empty line case
            const trimmedText = textLine.trim();
            if (trimmedText.length === 0 || (trimmedText.length === 1 && trimmedText[0] === '-')){
                //Add a temp node that is in the document but we don't use at all.
                newText = document.getText().substring(0,
                    start + textLine.length) + 'holder:\r\n' +
                    document.getText().substr(lineOffset[linePos + 1] || document.getText().length);
                //For when missing semi colon case
            }else{
                //Add a semicolon to the end of the current line so we can validate the node
                newText = document.getText().substring(0, start + textLine.length) + ':\r\n' + document.getText().substr(lineOffset[linePos + 1] || document.getText().length);
            }
            const yDoc = parseYAML(newText);
            for (const jsonDoc in yDoc.documents){
                yDoc.documents[jsonDoc].configureSettings({
                    isKubernetes: true
                });
            }
            return languageService.doComplete(document, position, yDoc);
        }else{

            //All the nodes are loaded
            position.character = position.character - 1;
            const yDoc = parseYAML(document.getText());
            for (const jsonDoc in yDoc.documents){
                yDoc.documents[jsonDoc].configureSettings({
                    isKubernetes: true
                });
            }
            return languageService.doComplete(document, position, yDoc);
        }

}
