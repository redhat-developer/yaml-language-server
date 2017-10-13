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
import {getLanguageService} from '../src/languageService/yamlLanguageService'
import Strings = require( '../src/languageService/utils/strings');
import URI from '../src/languageService/utils/uri';
import * as URL from 'url';
import fs = require('fs');
import {JSONSchemaService} from '../src/languageService/services/jsonSchemaService'
import {schemaService, languageService}  from './testHelper';
import { parse as parseYAML } from '../src/languageService/parser/yamlParser';
import { YAMLDocument } from 'vscode-yaml-languageservice';
import { getLineOffsets } from "../src/languageService/utils/arrUtils";
var assert = require('assert');

suite("Auto Completion Tests", () => {

	describe('Server - Auto Completion - yamlCompletion', function(){
		
		describe('doComplete', function(){
			
			it('Autocomplete on root node without word', (done) => {
				let uri = "file://~/Desktop/vscode-k8s/test.yaml";
				let content = "";
				let testTextDocument = TextDocument.create(uri, "yaml", 0, content);
				let yDoc2 = parseYAML(testTextDocument.getText()).documents[0];
				let validator = completionHelper(testTextDocument, testTextDocument.positionAt(0), false);
                validator.then(function(result){
                    assert.notEqual(result.items.length, 0);				
				}).then(done, done);
			});

			it('Autocomplete on root node with word', (done) => {
				let uri = "file://~/Desktop/vscode-k8s/test.yaml";
				let content = "analyt";
				let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
				let yDoc2 = parseYAML(testTextDocument.getText()).documents[0];
				
				let validator = completionHelper(testTextDocument, testTextDocument.positionAt(6), false);
				validator.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocomplete on scalar node', (done) => {
				let uri = "file://~/Desktop/vscode-k8s/test.yaml";
				let content = "directory: bow";
				let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
				let yDoc2 = parseYAML(testTextDocument.getText()).documents[0];
				let validator = completionHelper(testTextDocument, testTextDocument.positionAt(15), false);
				validator.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocomplete in the middle of file', (done) => {
				let uri = "file://~/Desktop/vscode-k8s/test.yaml";
				let content = "scripts:\n  post";
				let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
				let yDoc2 = parseYAML(testTextDocument.getText()).documents[0];
				let validator = completionHelper(testTextDocument, testTextDocument.positionAt(11), false);
				validator.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Scalar autocomplete in middle of file', (done) => {	
				let uri = "file://~/Desktop/vscode-k8s/test.yaml";
				let content = "scripts:\n  postinstall: /test\n  preinsta";
				let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
				let yDoc2 = parseYAML(testTextDocument.getText()).documents[0];
				let validator = completionHelper(testTextDocument, testTextDocument.positionAt(31), false);
				validator.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});
		});
	});
});

function completionHelper(document: TextDocument, textDocumentPosition, isKubernetes: Boolean){

		//Get the string we are looking at via a substring
		let linePos = textDocumentPosition.line;
		let position = textDocumentPosition;
		let lineOffset = getLineOffsets(document.getText()); 
		let start = lineOffset[linePos]; //Start of where the autocompletion is happening
		let end = 0; //End of where the autocompletion is happening
		if(lineOffset[linePos+1]){
			end = lineOffset[linePos+1];
		}else{
			end = document.getText().length;
		}
		let textLine = document.getText().substring(start, end);

		//Check if the string we are looking at is a node
		if(textLine.indexOf(":") === -1){
			//We need to add the ":" to load the nodes
					
			let newText = "";

			//This is for the empty line case
			if(textLine.trim().length === 0){
				//Add a temp node that is in the document but we don't use at all.
				if(lineOffset[linePos+1]){
					newText = document.getText().substring(0, start+(textLine.length-1)) + "holder:\r\n" + document.getText().substr(end+2); 
				}else{
					newText = document.getText().substring(0, start+(textLine.length)) + "holder:\r\n" + document.getText().substr(end+2); 
				}
				
			//For when missing semi colon case
			}else{
				//Add a semicolon to the end of the current line so we can validate the node
				if(lineOffset[linePos+1]){
					newText = document.getText().substring(0, start+(textLine.length-1)) + ":\r\n" + document.getText().substr(end+2);
				}else{
					newText = document.getText().substring(0, start+(textLine.length)) + ":\r\n" + document.getText().substr(end+2);
				}
			}
			let jsonDocument = parseYAML(newText).documents[0];
			return languageService.doComplete(document, textDocumentPosition, jsonDocument, isKubernetes);
		}else{

			//All the nodes are loaded
			position.character = position.character - 1;
			let jsonDocument = parseYAML(document.getText()).documents[0];
			return languageService.doComplete(document, textDocumentPosition, jsonDocument, isKubernetes);
		}
}