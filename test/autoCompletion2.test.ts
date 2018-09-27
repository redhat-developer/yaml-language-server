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
import {schemaRequestService, workspaceContext}  from './testHelper';
import { parse as parseYAML } from '../src/languageservice/parser/yamlParser';
import { getLineOffsets } from "../src/languageservice/utils/arrUtils";
var assert = require('assert');

let languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

let schemaService = new JSONSchemaService(schemaRequestService, workspaceContext);

let uri = 'http://json.schemastore.org/composer';
let languageSettings = {
	schemas: [],
	completion: true
};
let fileMatch = ["*.yml", "*.yaml"];
languageSettings.schemas.push({ uri, fileMatch: fileMatch });
languageService.configure(languageSettings);

suite("Auto Completion Tests", () => {

	function setup(content: string){
		return TextDocument.create("file://~/Desktop/vscode-k8s/test.yaml", "yaml", 0, content);
	}

	function parseSetup(content: string, position){
		let testTextDocument = setup(content);
		let yDoc = parseYAML(testTextDocument.getText());
		return completionHelper(testTextDocument, testTextDocument.positionAt(position));
	}

	describe('yamlCompletion with composer', function(){

		describe('doComplete', function(){

			it('Array autocomplete without word', (done) => {
				let content = "authors:\n  - ";
				let completion = parseSetup(content, 14);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Array autocomplete without word on array symbol', (done) => {
				let content = "authors:\n  -";
				let completion = parseSetup(content, 13);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Array autocomplete without word on space before array symbol', (done) => {
				let content = "authors:\n  - name: test\n  "
				let completion = parseSetup(content, 24);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Array autocomplete with letter', (done) => {
				let content = "authors:\n  - n";
				let completion = parseSetup(content, 14);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Array autocomplete without word (second item)', (done) => {
				let content = "authors:\n  - name: test\n    ";
				let completion = parseSetup(content, 32);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Array autocomplete with letter (second item)', (done) => {
				let content = "authors:\n  - name: test\n    e";
				let completion = parseSetup(content, 27);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocompletion after array', (done) => {
				let content = "authors:\n  - name: test\n"
				let completion = parseSetup(content, 24);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocompletion after array with depth', (done) => {
				let content = "archive:\n  exclude:\n  - test\n"
				let completion = parseSetup(content, 29);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocompletion after array with depth', (done) => {
				let content = "autoload:\n  classmap:\n  - test\n  exclude-from-classmap:\n  - test\n  "
				let completion = parseSetup(content, 70);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

		});

		describe('Failure tests', function(){

			it('Autocompletion has no results on value when they are not available', (done) => {
				let content = "time: "
				let completion = parseSetup(content, 6);
				completion.then(function(result){
					assert.equal(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocompletion has no results on value when they are not available (with depth)', (done) => {
				let content = "archive:\n  exclude:\n    - test\n    "
				let completion = parseSetup(content, 33);
				completion.then(function(result){
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

	while (end - 1 >= 0 && is_EOL(document.getText().charCodeAt(end - 1))) {
		end--;
	}

	let textLine = document.getText().substring(start, end);

	//Check if the string we are looking at is a node
	if(textLine.indexOf(":") === -1){
		//We need to add the ":" to load the nodes

		let newText = "";

		//This is for the empty line case
		let trimmedText = textLine.trim();
		if(trimmedText.length === 0 || (trimmedText.length === 1 && trimmedText[0] === '-')){
			//Add a temp node that is in the document but we don't use at all.
			newText = document.getText().substring(0, start + textLine.length) + (trimmedText[0] === '-' && !textLine.endsWith(" ") ? " " : "") + "holder:\r\n" + document.getText().substr(lineOffset[linePos + 1] || document.getText().length);
			//For when missing semi colon case
		}else{
			//Add a semicolon to the end of the current line so we can validate the node
			newText = document.getText().substring(0, start+textLine.length) + ":\r\n" + document.getText().substr(lineOffset[linePos+1] || document.getText().length);
		}
		let jsonDocument = parseYAML(newText);
		return languageService.doComplete(document, position, jsonDocument);
	}else{

		//All the nodes are loaded
		position.character = position.character - 1;
		let jsonDocument = parseYAML(document.getText());
		return languageService.doComplete(document, position, jsonDocument);
	}

}