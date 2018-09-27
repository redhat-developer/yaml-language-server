/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import {
	IPCMessageReader, IPCMessageWriter,
	createConnection, IConnection, TextDocumentSyncKind,
	TextDocuments, TextDocument, Diagnostic, DiagnosticSeverity,
	InitializeParams, InitializeResult, TextDocumentPositionParams,
	RequestType
} from 'vscode-languageserver';
import { xhr, XHRResponse, configure as configureHttpRequests, getErrorStatusDescription } from 'request-light';
import {getLanguageService, LanguageSettings} from '../src/languageservice/yamlLanguageService'
import Strings = require( '../src/languageservice/utils/strings');
import URI from '../src/languageservice/utils/uri';
import * as URL from 'url';
import fs = require('fs');
import {JSONSchemaService} from '../src/languageservice/services/jsonSchemaService'
import {schemaRequestService, workspaceContext}  from './testHelper';
import { parse as parseYAML } from '../src/languageservice/parser/yamlParser';
import { getLineOffsets } from "../src/languageservice/utils/arrUtils";
var assert = require('assert');

let languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

let schemaService = new JSONSchemaService(schemaRequestService, workspaceContext);

let uri = 'http://json.schemastore.org/bowerrc';
let languageSettings: LanguageSettings = {
	schemas: [],
	hover: true
};
let fileMatch = ["*.yml", "*.yaml"];
languageSettings.schemas.push({ uri, fileMatch: fileMatch });
languageService.configure(languageSettings);

suite("Hover Tests", () => {

	
	describe('Yaml Hover with bowerrc', function(){
		
		describe('doComplete', function(){
			
			function setup(content: string){
				return TextDocument.create("file://~/Desktop/vscode-k8s/test.yaml", "yaml", 0, content);
			}

			function parseSetup(content: string, position){
				let testTextDocument = setup(content);
                let jsonDocument = parseYAML(testTextDocument.getText());
                return languageService.doHover(testTextDocument, testTextDocument.positionAt(position), jsonDocument);
			}

			it('Hover on key on root', (done) => {
				let content = "cwd: test";
				let hover = parseSetup(content, 1);
				hover.then(function(result){
                    assert.notEqual(result.contents.length, 0);				
				}).then(done, done);
            });
            
            it('Hover on value on root', (done) => {
				let content = "cwd: test";
				let hover = parseSetup(content, 6);
				hover.then(function(result){
                    assert.notEqual(result.contents.length, 0);				
				}).then(done, done);
            });

            it('Hover on key with depth', (done) => {
				let content = "scripts:\n  postinstall: test";
				let hover = parseSetup(content, 15);
				hover.then(function(result){
                    assert.notEqual(result.contents.length, 0);				
				}).then(done, done);
            });

            it('Hover on value with depth', (done) => {
				let content = "scripts:\n  postinstall: test";
				let hover = parseSetup(content, 26);
				hover.then(function(result){
                    assert.notEqual(result.contents.length, 0);				
				}).then(done, done);
            });

            it('Hover works on both root node and child nodes works', (done) => {
				let content = "scripts:\n  postinstall: test";
                
                let firstHover = parseSetup(content, 3);
                firstHover.then(function(result){
                    assert.notEqual(result.contents.length, 0);
                });
                
                let secondHover = parseSetup(content, 15);
				secondHover.then(function(result){
                    assert.notEqual(result.contents.length, 0);				
				}).then(done, done);
            });

            it('Hover does not show results when there isnt description field', (done) => {
				let content = "analytics: true";
				let hover = parseSetup(content, 3);
				hover.then(function(result){
                    assert.notEqual(result.contents.length, 0);				
				}).then(done, done);
			});
			
			it('Hover on multi document', (done) => {
				let content = '---\nanalytics: true\n...\n---\njson: test\n...';
				let hover = parseSetup(content, 30);
				hover.then(function(result){
                    assert.notEqual(result.contents.length, 0);				
				}).then(done, done);
            });
		});
	});
});