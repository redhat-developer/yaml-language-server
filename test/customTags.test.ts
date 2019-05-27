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
import {getLanguageService} from '../src/languageservice/yamlLanguageService'
import Strings = require( '../src/languageservice/utils/strings');
import URI from '../src/languageservice/utils/uri';
import * as URL from 'url';
import fs = require('fs');
import {JSONSchemaService} from '../src/languageservice/services/jsonSchemaService'
import {schemaRequestService, workspaceContext, createJSONLanguageService}  from './testHelper';
import { parse as parseYAML } from '../src/languageservice/parser/yamlParser07';
var assert = require('assert');

function createLanguageServiceWithCustomTags(customTags) {
    let languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

    let languageSettings = {
        schemas: [],
        validate: true,
        customTags: customTags
    };
    const uri = 'http://json.schemastore.org/bowerrc';
    let fileMatch = ["*.yml", "*.yaml"];
    languageSettings.schemas.push({ uri, fileMatch: fileMatch });
    languageService.configure(languageSettings);
    return languageService;
}

// Defines a Mocha test suite to group tests of similar kind together
suite("Custom Tag tests Tests", () => {

    function setup(content: string){
        return TextDocument.create("file://~/Desktop/vscode-k8s/test.yaml", "yaml", 0, content);
    }

    function parseSetup(content: string, customTags: string[]){
        let testTextDocument = setup(content);
        let languageService = createLanguageServiceWithCustomTags(customTags);
        let yDoc = parseYAML(testTextDocument.getText(), customTags);
        const jsonLanguageService = createJSONLanguageService();
        jsonLanguageService.configure({
            validate: true
        })
        return languageService.doValidation(jsonLanguageService, testTextDocument, yDoc);
    }
    
    describe('Test that validation does not throw errors', function(){
        it('Custom Tags without type not specified', (done) => {
            let content = `scalar_test: !Test test_example`;
            let validator = parseSetup(content, ["!Test"]);
            validator.then(function(result){
                assert.equal(result.length, 0);
            }).then(done, done);
        });

        it('Custom Tags with one type', (done) => {
            let content = `resolvers: !Ref\n  - test`;
            let validator = parseSetup(content, ["!Ref sequence"]);
            validator.then(function(result){
                assert.equal(result.length, 0);
            }).then(done, done);
        });

        it('Custom Tags with multiple types', (done) => {
            let content = `resolvers: !Ref\n  - test`;
            let validator = parseSetup(content, ["!Ref sequence", "!Ref mapping", "!Ref scalar"]);
            validator.then(function(result){
                assert.equal(result.length, 0);
            }).then(done, done);
        });

        it('Allow multiple different custom tag types with different use', (done) => {
            let content = "!test\nhello: !test\n  world";
            let validator = parseSetup(content, ["!test scalar", "!test mapping"]);
            validator.then(function(result){
                assert.equal(result.length, 0);
            }).then(done, done);
        });

        it('Allow multiple different custom tag types with multiple different uses', (done) => {
            let content = "!test\nhello: !test\n  world\nsequence: !ref\n  - item1";
            let validator = parseSetup(content, ["!test scalar", "!test mapping", "!ref sequence", "!ref mapping"]);
            validator.then(function(result){
                assert.equal(result.length, 0);
            }).then(done, done);
        });
    });

    describe('Test that validation does throw errors', function(){ 
        it('Error when custom tag is not available', (done) => {
            let content = "!test";
            let validator = parseSetup(content, []);
            validator.then(function(result){
                assert.equal(result.length, 2);
            }).then(done, done);
        });
    });
});