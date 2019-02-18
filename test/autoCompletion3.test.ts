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
import {getLanguageService} from '../src/languageservice/yamlLanguageService'
import {JSONSchemaService} from '../src/languageservice/services/jsonSchemaService'
import {schemaRequestService, workspaceContext}  from './testHelper';
import { parse as parseYAML } from '../src/languageservice/parser/yamlParser';
import { getLineOffsets } from '../src/languageservice/utils/arrUtils';
var assert = require('assert');

let languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

let uri = 'http://json.schemastore.org/asmdef';
let languageSettings = {
	schemas: [],
	completion: true
};
let fileMatch = ["*.yml", "*.yaml"];
languageSettings.schemas.push({ uri, fileMatch: fileMatch });
languageService.configure(languageSettings);

suite("Auto Completion Tests", () => {

	describe('yamlCompletion with asmdef', function(){

		describe('doComplete', function(){

			function setup(content: string){
				return TextDocument.create("file://~/Desktop/vscode-k8s/test.yaml", "yaml", 0, content);
			}

			function parseSetup(content: string, position){
				let testTextDocument = setup(content);
				return completionHelper(testTextDocument, testTextDocument.positionAt(position));
			}

			it('Array of enum autocomplete without word on array symbol', (done) => {
				let content = "optionalUnityReferences:\n  -";
				let completion = parseSetup(content, 29);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
            });
            
            it('Array of enum autocomplete without word', (done) => {
				let content = "optionalUnityReferences:\n  - ";
				let completion = parseSetup(content, 30);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
            });
            
            it('Array of enum autocomplete with letter', (done) => {
				let content = "optionalUnityReferences:\n  - T";
				let completion = parseSetup(content, 31);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Array of enum autocomplete with multiline text', (done) => {
				let content = "optionalUnityReferences:\n  - T\n    e\n";
				let completion = parseSetup(content, 31);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
					// textEdit must be single line
					assert.equal(result.items[0].textEdit, undefined)
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