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
import { getLineOffsets } from '../src/languageservice/utils/arrUtils';
var assert = require('assert');

let languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

let schemaService = new JSONSchemaService(schemaRequestService, workspaceContext);

let uri = 'http://json.schemastore.org/bowerrc';
let languageSettings = {
	schemas: [],
	completion: true
};
let fileMatch = ["*.yml", "*.yaml"];
languageSettings.schemas.push({ uri, fileMatch: fileMatch });
languageService.configure(languageSettings);

suite("Auto Completion Tests", () => {


	describe('yamlCompletion with bowerrc', function(){

		describe('doComplete', function(){

			function setup(content: string){
				return TextDocument.create("file://~/Desktop/vscode-k8s/test.yaml", "yaml", 0, content);
			}

			function parseSetup(content: string, position){
				let testTextDocument = setup(content);
				let yDoc = parseYAML(testTextDocument.getText());
				return completionHelper(testTextDocument, testTextDocument.positionAt(position));
			}

			it('Autocomplete on root node without word', (done) => {
				let content = "";
				let completion = parseSetup(content, 0);
				completion.then(function(result){
                    assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocomplete on root node with word', (done) => {
				let content = "analyt";
				let completion = parseSetup(content, 6);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocomplete on default value (without value content)', (done) => {
				let content = "directory: ";
				let completion = parseSetup(content, 12);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocomplete on default value (with value content)', (done) => {
				let content = "directory: bow";
				let completion = parseSetup(content, 15);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocomplete on boolean value (without value content)', (done) => {
				let content = "analytics: ";
				let completion = parseSetup(content, 11);
				completion.then(function(result){
					assert.equal(result.items.length, 2);
				}).then(done, done);
			});

			it('Autocomplete on boolean value (with value content)', (done) => {
				let content = "analytics: fal";
				let completion = parseSetup(content, 11);
				completion.then(function(result){
					assert.equal(result.items.length, 2);
				}).then(done, done);
			});

			it('Autocomplete on number value (without value content)', (done) => {
				let content = "timeout: ";
				let completion = parseSetup(content, 9);
				completion.then(function(result){
					assert.equal(result.items.length, 1);
				}).then(done, done);
			});

			it('Autocomplete on number value (with value content)', (done) => {
				let content = "timeout: 6";
				let completion = parseSetup(content, 10);
				completion.then(function(result){
					assert.equal(result.items.length, 1);
				}).then(done, done);
			});

			it('Autocomplete key in middle of file', (done) => {
				let content = "scripts:\n  post";
				let completion = parseSetup(content, 11);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocomplete key in middle of file 2', (done) => {
				let content = "scripts:\n  postinstall: /test\n  preinsta";
				let completion = parseSetup(content, 31);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocomplete does not happen right after :', (done) => {
				let content = "analytics:";
				let completion = parseSetup(content, 9);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocomplete does not happen right after : under an object', (done) => {
				let content = "scripts:\n  postinstall:";
				let completion = parseSetup(content, 21);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocomplete on multi yaml documents in a single file on root', (done) => {
				let content = `---\nanalytics: true\n...\n---\n...`;
				let completion = parseSetup(content, 28);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocomplete on multi yaml documents in a single file on scalar', (done) => {
				let content = `---\nanalytics: true\n...\n---\njson: \n...`;
				let completion = parseSetup(content, 34);
				completion.then(function(result){
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