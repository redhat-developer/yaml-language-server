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
var assert = require('assert');

let languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

let schemaService = new JSONSchemaService(schemaRequestService, workspaceContext);

let uri = 'http://json.schemastore.org/bowerrc';
let languageSettings = {
	schemas: [],
	validate: true,
	customTags: []
};
let fileMatch = ["*.yml", "*.yaml"];
languageSettings.schemas.push({ uri, fileMatch: fileMatch });
languageSettings.customTags.push("!Test");
languageSettings.customTags.push("!Ref sequence");
languageService.configure(languageSettings);

// Defines a Mocha test suite to group tests of similar kind together
suite("Validation Tests", () => {

	// Tests for validator
	describe('Validation', function() {
		
		function setup(content: string){
			return TextDocument.create("file://~/Desktop/vscode-k8s/test.yaml", "yaml", 0, content);
		}

		function parseSetup(content: string){
			let testTextDocument = setup(content);
			let yDoc = parseYAML(testTextDocument.getText(), languageSettings.customTags);
			return languageService.doValidation(testTextDocument, yDoc);
		}

		//Validating basic nodes
		describe('Test that validation does not throw errors', function(){
			
			it('Basic test', (done) => {
				let content = `analytics: true`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.equal(result.length, 0);
				}).then(done, done);
			});

			it('Test that boolean value in quotations is not interpreted as boolean i.e. it errors', (done) => {
				let content = `analytics: "no"`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.notEqual(result.length, 0);
				}).then(done, done);
			});

			it('Test that boolean value without quotations is valid', (done) => {
				let content = `analytics: no`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.equal(result.length, 0);
				}).then(done, done);
			});

			it('Test that boolean is valid when inside strings', (done) => {
				let content = `cwd: "no"`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.equal(result.length, 0);
				}).then(done, done);
			});

			it('Test that boolean is invalid when no strings present and schema wants string', (done) => {
				let content = `cwd: no`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.notEqual(result.length, 0);
				}).then(done, done);
			});

			it('Basic test', (done) => {
				let content = `analytics: true`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.equal(result.length, 0);
				}).then(done, done);
			});


			it('Basic test on nodes with children', (done) => {
				let content = `scripts:\n  preinstall: test1\n  postinstall: test2`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.equal(result.length, 0);
				}).then(done, done);
			});

			it('Advanced test on nodes with children', (done) => {
				let content = `analytics: true\ncwd: this\nscripts:\n  preinstall: test1\n  postinstall: test2`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.equal(result.length, 0);
				}).then(done, done);
			});

			it('Type string validates under children', (done) => {
				let content = `registry:\n  register: test_url`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.equal(result.length, 0);
				}).then(done, done);
			});	

            it('Include with value should not error', (done) => {
				let content = `customize: !include customize.yaml`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.equal(result.length, 0);
				}).then(done, done);
			});

			it('Null scalar value should be treated as string', (done) => {
				let content = `cwd: Null`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.equal(result.length, 0);
				}).then(done, done);
			});

			it('Anchor should not not error', (done) => {
				let content = `default: &DEFAULT\n  name: Anchor\nanchor_test:\n  <<: *DEFAULT`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.equal(result.length, 0);
				}).then(done, done);
			});

			it('Anchor with multiple references should not not error', (done) => {
				let content = `default: &DEFAULT\n  name: Anchor\nanchor_test:\n  <<: *DEFAULT\nanchor_test2:\n  <<: *DEFAULT`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.equal(result.length, 0);
				}).then(done, done);
			});

			it('Multiple Anchor in array of references should not not error', (done) => {
				let content = `default: &DEFAULT\n  name: Anchor\ncustomname: &CUSTOMNAME\n  custom_name: Anchor\nanchor_test:\n  <<: [*DEFAULT, *CUSTOMNAME]`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.equal(result.length, 0);
				}).then(done, done);
			});

			it('Multiple Anchors being referenced in same level at same time', (done) => {
				let content = `default: &DEFAULT\n  name: Anchor\ncustomname: &CUSTOMNAME\n  custom_name: Anchor\nanchor_test:\n  <<: *DEFAULT\n  <<: *CUSTOMNAME\n`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.equal(result.length, 0);
				}).then(done, done);
			});

			it('Custom Tags without type', (done) => {
				let content = `analytics: !Test false`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.equal(result.length, 0);
				}).then(done, done);
			});

			it('Custom Tags with type', (done) => {
				let content = `resolvers: !Ref\n  - test`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.equal(result.length, 0);
				}).then(done, done);
			});

			describe('Type tests', function(){

				it('Type String does not error on valid node', (done) => {
					let content = `cwd: this`;
					let validator = parseSetup(content);
					validator.then(function(result){
						assert.equal(result.length, 0);
					}).then(done, done);
				});

				it('Type Boolean does not error on valid node', (done) => {
					let content = `analytics: true`;
					let validator = parseSetup(content);
					validator.then(function(result){
						assert.equal(result.length, 0);
					}).then(done, done);
				});

				it('Type Number does not error on valid node', (done) => {
					let content = `timeout: 60000`;
					let validator = parseSetup(content);
					validator.then(function(result){
						assert.equal(result.length, 0);
					}).then(done, done);
				});			

				it('Type Object does not error on valid node', (done) => {
					let content = `registry:\n  search: test_url`;
					let validator = parseSetup(content);
					validator.then(function(result){
						assert.equal(result.length, 0);
					}).then(done, done);
				});		

				it('Type Array does not error on valid node', (done) => {
					let content = `resolvers:\n  - test\n  - test\n  - test`;
					let validator = parseSetup(content);
					validator.then(function(result){
						assert.equal(result.length, 0);
					}).then(done, done);
				});

				it('Do not error when there are multiple types in schema and theyre valid', (done) => {
					let content = `license: MIT`;
					let validator = parseSetup(content);
					validator.then(function(result){
						assert.equal(result.length, 0);
					});
					done();
				});
				
			});

		});	

		describe('Test that validation DOES throw errors', function(){
			it('Error when theres a finished untyped item', (done) => {
				let content = `cwd: hello\nan`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.notEqual(result.length, 0);
				}).then(done, done);
			});

			it('Error when theres no value for a node', (done) => {
				let content = `cwd:`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.notEqual(result.length, 0);
				}).then(done, done);
			});

			it('Error on incorrect value type (number)', (done) => {
				let content = `cwd: 100000`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.notEqual(result.length, 0);
				}).then(done, done);
			});

			it('Error on incorrect value type (boolean)', (done) => {
				let content = `cwd: False`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.notEqual(result.length, 0);
				}).then(done, done);
			});

			it('Error on incorrect value type (string)', (done) => {
				let content = `analytics: hello`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.notEqual(result.length, 0);
				}).then(done, done);
			});

			it('Error on incorrect value type (object)', (done) => {
				let content = `scripts: test`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.notEqual(result.length, 0);
				}).then(done, done);
			});

			it('Error on incorrect value type (array)', (done) => {
				let content = `resolvers: test`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.notEqual(result.length, 0);
				}).then(done, done);
			});

			it('Include without value should error', (done) => {
				let content = `customize: !include`;
				let validator = parseSetup(content);
				validator.then(function(result){
					assert.equal(result.length, 1);
				}).then(done, done);
			});

		});
	
	});
});