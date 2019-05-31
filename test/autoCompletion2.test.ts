/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import {
    IPCMessageReader, IPCMessageWriter,
    createConnection, IConnection, TextDocumentSyncKind,
    TextDocuments, TextDocument, Diagnostic, DiagnosticSeverity,
    InitializeParams, InitializeResult, TextDocumentPositionParams,
    CompletionItem, CompletionItemKind, RequestType
} from 'vscode-languageserver';
import { xhr, XHRResponse, configure as configureHttpRequests, getErrorStatusDescription } from 'request-light';
import {getLanguageService} from '../src/languageservice/yamlLanguageService';
import Strings = require( '../src/languageservice/utils/strings');
import URI from '../src/languageservice/utils/uri';
import * as URL from 'url';
import fs = require('fs');
import {JSONSchemaService} from '../src/languageservice/services/jsonSchemaService';
import {schemaRequestService, workspaceContext}  from './utils/testHelper';
import { parse as parseYAML } from '../src/languageservice/parser/yamlParser04';
import { getLineOffsets } from '../src/languageservice/utils/arrUtils';
const assert = require('assert');

const languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

const schemaService = new JSONSchemaService(schemaRequestService, workspaceContext);

const uri = 'http://json.schemastore.org/composer';
const languageSettings = {
    schemas: [],
    completion: true
};
const fileMatch = ['*.yml', '*.yaml'];
languageSettings.schemas.push({ uri, fileMatch: fileMatch });
languageService.configure(languageSettings);

suite('Auto Completion Tests', () => {

    function setup(content: string){
        return TextDocument.create('file://~/Desktop/vscode-k8s/test.yaml', 'yaml', 0, content);
    }

    function parseSetup(content: string, position){
        const testTextDocument = setup(content);
        const yDoc = parseYAML(testTextDocument.getText());
        return completionHelper(testTextDocument, testTextDocument.positionAt(position));
    }

    describe('yamlCompletion with composer', function (){

        describe('doComplete', function (){

            it('Array autocomplete without word', done => {
                const content = 'authors:\n  - ';
                const completion = parseSetup(content, 14);
                completion.then(function (result){
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it('Array autocomplete without word on array symbol', done => {
                const content = 'authors:\n  -';
                const completion = parseSetup(content, 13);
                completion.then(function (result){
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it('Array autocomplete without word on space before array symbol', done => {
                const content = 'authors:\n  - name: test\n  ';
                const completion = parseSetup(content, 24);
                completion.then(function (result){
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it('Array autocomplete with letter', done => {
                const content = 'authors:\n  - n';
                const completion = parseSetup(content, 14);
                completion.then(function (result){
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it('Array autocomplete without word (second item)', done => {
                const content = 'authors:\n  - name: test\n    ';
                const completion = parseSetup(content, 32);
                completion.then(function (result){
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it('Array autocomplete with letter (second item)', done => {
                const content = 'authors:\n  - name: test\n    e';
                const completion = parseSetup(content, 27);
                completion.then(function (result){
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it('Autocompletion after array', done => {
                const content = 'authors:\n  - name: test\n';
                const completion = parseSetup(content, 24);
                completion.then(function (result){
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it('Autocompletion after array with depth', done => {
                const content = 'archive:\n  exclude:\n  - test\n';
                const completion = parseSetup(content, 29);
                completion.then(function (result){
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it('Autocompletion after array with depth', done => {
                const content = 'autoload:\n  classmap:\n  - test\n  exclude-from-classmap:\n  - test\n  ';
                const completion = parseSetup(content, 70);
                completion.then(function (result){
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

        });

        describe('Failure tests', function (){

            it('Autocompletion has no results on value when they are not available', done => {
                const content = 'time: ';
                const completion = parseSetup(content, 6);
                completion.then(function (result){
                    assert.equal(result.items.length, 0);
                }).then(done, done);
            });

            it('Autocompletion has no results on value when they are not available (with depth)', done => {
                const content = 'archive:\n  exclude:\n    - test\n    ';
                const completion = parseSetup(content, 33);
                completion.then(function (result){
                    assert.equal(result.items.length, 0);
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
                start + textLine.length) + (trimmedText[0] === '-' && !textLine.endsWith(' ') ? ' ' : '') + 'holder:\r\n' +
                document.getText().substr(lineOffset[linePos + 1] || document.getText().length);
            //For when missing semi colon case
        }else{
            //Add a semicolon to the end of the current line so we can validate the node
            newText = document.getText().substring(0, start + textLine.length) + ':\r\n' + document.getText().substr(lineOffset[linePos + 1] || document.getText().length);
        }
        const jsonDocument = parseYAML(newText);
        return languageService.doComplete(document, position, jsonDocument);
    }else{

        //All the nodes are loaded
        position.character = position.character - 1;
        const jsonDocument = parseYAML(document.getText());
        return languageService.doComplete(document, position, jsonDocument);
    }

}
