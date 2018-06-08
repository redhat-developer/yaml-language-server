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

let uri = "https://gist.githubusercontent.com/JPinkney/ccaf3909ef811e5657ca2e2e1fa05d76/raw/f85e51bfb67fdb99ab7653c2953b60087cc871ea/openshift_schema_all.json";
let languageSettings = {
	schemas: [],
	validate: true
};
let fileMatch = ["*.yml", "*.yaml"];
languageSettings.schemas.push({ uri, fileMatch: fileMatch });
languageService.configure(languageSettings);

// Defines a Mocha test suite to group tests of similar kind together
suite("Kubernetes Integration Tests", () => {

	// Tests for validator
	describe('Yaml Validation with kubernetes', function() {

		function setup(content: string){
			return TextDocument.create("file://~/Desktop/vscode-k8s/test.yaml", "yaml", 0, content);
		}

		function parseSetup(content: string){
			let testTextDocument = setup(content);
			let yDoc = parseYAML(testTextDocument.getText());
			for(let jsonDoc in yDoc.documents){
				yDoc.documents[jsonDoc].configureSettings({
					isKubernetes: true
				});
			}
			return languageService.doValidation(testTextDocument, yDoc);
		}

		//Validating basic nodes
		describe('Test that validation does not throw errors', function(){

			it('Basic test', (done) => {
				let content = `apiVersion: v1`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.equal(result.length, 0);
				}).then(done, done);
			});

			it('Basic test on nodes with children', (done) => {
				let content = `metadata:\n  name: hello`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.equal(result.length, 0);
				}).then(done, done);
			});

			it('Advanced test on nodes with children', (done) => {
				let content = `apiVersion: v1\nmetadata:\n  name: test1`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.equal(result.length, 0);
				}).then(done, done);
			});

			it('Type string validates under children', (done) => {
				let content = `apiVersion: v1\nkind: Pod\nmetadata:\n  resourceVersion: test`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.equal(result.length, 0);
				}).then(done, done);
			});

			describe('Type tests', function(){

				it('Type String does not error on valid node', (done) => {
					let content = `apiVersion: v1`;
					let validator = parseSetup(content);
					validator.then(function(result){
						assert.equal(result.length, 0);
					}).then(done, done);
				});

				it('Type Boolean does not error on valid node', (done) => {
					let content = `readOnlyRootFilesystem: false`;
					let validator = parseSetup(content);
					validator.then(function(result){
						assert.equal(result.length, 0);
					}).then(done, done);
				});

				it('Type Number does not error on valid node', (done) => {
					let content = `generation: 5`;
					let validator = parseSetup(content);
					validator.then(function(result){
						assert.equal(result.length, 0);
					}).then(done, done);
				});

				it('Type Object does not error on valid node', (done) => {
					let content = `metadata:\n  clusterName: tes`;
					let validator = parseSetup(content);
					validator.then(function(result){
						assert.equal(result.length, 0);
					}).then(done, done);
				});

				it('Type Array does not error on valid node', (done) => {
					let content = `items:\n  - apiVersion: v1`;
					let validator = parseSetup(content);
					validator.then(function(result){
						assert.equal(result.length, 0);
					}).then(done, done);
				});

			});

		});

		describe('Test that validation DOES throw errors', function(){
			it('Error when theres no value for a node', (done) => {
				let content = `apiVersion:`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.notEqual(result.length, 0);
				}).then(done, done);
			});

			it('Error on incorrect value type (number)', (done) => {
				let content = `apiVersion: 1000`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.notEqual(result.length, 0);
				}).then(done, done);
			});

			it('Error on incorrect value type (boolean)', (done) => {
				let content = `apiVersion: False`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.notEqual(result.length, 0);
				}).then(done, done);
			});

			it('Error on incorrect value type (string)', (done) => {
				let content = `isNonResourceURL: hello_world`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.notEqual(result.length, 0);
				}).then(done, done);
			});

			it('Error on incorrect value type (object)', (done) => {
				let content = `apiVersion: v1\nkind: Pod\nmetadata:\n  name: False`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.notEqual(result.length, 0);
				}).then(done, done);
			});

			it('Error on incorrect value type in multiple yaml documents', (done) => {
				let content = `---\napiVersion: v1\n...\n---\napiVersion: False\n...`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.notEqual(result.length, 0);
				}).then(done, done);
			});

			it('Property error message should be \"Unexpected property {$property_name}\" when property is not allowed ', (done) => {
				let content = `unknown_node: test`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.equal(result.length, 1);
					assert.equal(result[0].message, "Unexpected property unknown_node");
				}).then(done, done);
			});

		});

	});

	describe('yamlCompletion with kubernetes', function(){

		describe('doComplete', function(){

			function setup(content: string){
				return TextDocument.create("file://~/Desktop/vscode-k8s/test.yaml", "yaml", 0, content);
			}

			function parseSetup(content: string, position){
				let testTextDocument = setup(content);
				let yDoc = parseYAML(testTextDocument.getText());
				for(let jsonDoc in yDoc.documents){
					yDoc.documents[jsonDoc].configureSettings({
						isKubernetes: true
					});
				}
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
				let content = "api";
				let completion = parseSetup(content, 6);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocomplete on default value (without value content)', (done) => {
				let content = "apiVersion: ";
				let completion = parseSetup(content, 10);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocomplete on default value (with value content)', (done) => {
				let content = "apiVersion: v1\nkind: Bin";
				let completion = parseSetup(content, 19);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocomplete on boolean value (without value content)', (done) => {
				let content = "isNonResourceURL: ";
				let completion = parseSetup(content, 18);
				completion.then(function(result){
					assert.equal(result.items.length, 2);
				}).then(done, done);
			});

			it('Autocomplete on boolean value (with value content)', (done) => {
				let content = "isNonResourceURL: fal";
				let completion = parseSetup(content, 21);
				completion.then(function(result){
					assert.equal(result.items.length, 2);
				}).then(done, done);
			});

			it('Autocomplete key in middle of file', (done) => {
				let content = "metadata:\n  nam";
				let completion = parseSetup(content, 14);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocomplete key in middle of file 2', (done) => {
				let content = "metadata:\n  name: test\n  cluster";
				let completion = parseSetup(content, 31);
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
				newText = document.getText().substring(0, start+textLine.length) + "holder:\r\n" + document.getText().substr(lineOffset[linePos+1] || document.getText().length);
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