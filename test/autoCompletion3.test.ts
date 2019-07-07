/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TextDocument } from 'vscode-languageserver';
import { getLanguageService } from '../src/languageservice/yamlLanguageService';
import { schemaRequestService, workspaceContext }  from './utils/testHelper';
import { getLineOffsets } from '../src/languageservice/utils/arrUtils';
import assert = require('assert');

const languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

const uri = 'http://json.schemastore.org/asmdef';
const languageSettings = {
    schemas: [],
    completion: true
};
const fileMatch = ['*.yml', '*.yaml'];
languageSettings.schemas.push({ uri, fileMatch: fileMatch });
languageService.configure(languageSettings);

suite('Auto Completion Tests', () => {

    describe('yamlCompletion with asmdef', function () {

        describe('doComplete', function () {

            function setup(content: string) {
                return TextDocument.create('file://~/Desktop/vscode-k8s/test.yaml', 'yaml', 0, content);
            }

            function parseSetup(content: string, position) {
                const testTextDocument = setup(content);
                return completionHelper(testTextDocument, testTextDocument.positionAt(position));
            }

            it('Array of enum autocomplete without word on array symbol', done => {
                const content = 'optionalUnityReferences:\n  -';
                const completion = parseSetup(content, 29);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it('Array of enum autocomplete without word', done => {
                const content = 'optionalUnityReferences:\n  - ';
                const completion = parseSetup(content, 30);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it('Array of enum autocomplete with letter', done => {
                const content = 'optionalUnityReferences:\n  - T';
                const completion = parseSetup(content, 31);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it('Array of enum autocomplete with multiline text', done => {
                const content = 'optionalUnityReferences:\n  - T\n    e\n';
                const completion = parseSetup(content, 31);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                    // textEdit must be single line
                    assert.equal(result.items[0].textEdit, undefined);
                }).then(done, done);
            });
        });
    });
});

function is_EOL(c) {
    return (c === 0x0A/* LF */) || (c === 0x0D/* CR */);
}

function completionHelper(document: TextDocument, textDocumentPosition) {

    //Get the string we are looking at via a substring
    const linePos = textDocumentPosition.line;
    const position = textDocumentPosition;
    const lineOffset = getLineOffsets(document.getText());
    const start = lineOffset[linePos]; //Start of where the autocompletion is happening
    let end = 0; //End of where the autocompletion is happening
    if (lineOffset[linePos + 1]) {
        end = lineOffset[linePos + 1];
    }else {
        end = document.getText().length;
    }

    while (end - 1 >= 0 && is_EOL(document.getText().charCodeAt(end - 1))) {
        end--;
    }

    const textLine = document.getText().substring(start, end);

    //Check if the string we are looking at is a node
    if (textLine.indexOf(':') === -1) {
        //We need to add the ":" to load the nodes

        let newText = '';

        //This is for the empty line case
        const trimmedText = textLine.trim();
        if (trimmedText.length === 0 || (trimmedText.length === 1 && trimmedText[0] === '-')) {
            //Add a temp node that is in the document but we don't use at all.
            newText = document.getText().substring(0,
                start + textLine.length) + (trimmedText[0] === '-' && !textLine.endsWith(' ') ? ' ' : '') + 'holder:\r\n' +
                document.getText().substr(lineOffset[linePos + 1] || document.getText().length);
            //For when missing semi colon case
        }else {
            //Add a semicolon to the end of the current line so we can validate the node
            newText = document.getText().substring(0, start + textLine.length) + ':\r\n' + document.getText().substr(lineOffset[linePos + 1] || document.getText().length);
        }
        return languageService.doComplete(document, position, false);
    }else {

        //All the nodes are loaded
        position.character = position.character - 1;
        return languageService.doComplete(document, position, false);
    }
}
