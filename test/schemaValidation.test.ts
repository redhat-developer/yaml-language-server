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
var assert = require('assert');


// Defines a Mocha test suite to group tests of similar kind together
suite("Validation Tests", () => {

	// Tests for validator
	describe('Server - Validation - schemaValidation and schemaValidator files', function() {
		describe('traverseBackToLocation', function() {

			//Validating basic nodes
			describe('Checking basic and advanced structures', function(){
				it('Basic Validation', (done) => {
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = `analytics: true`;
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = parseYAML(testTextDocument.getText());
					let validator = languageService.doValidation(testTextDocument, yDoc2, false);
					validator.then(function(result){
						assert.equal(result.length, 0);
					}).then(done, done);
				});

				it('Basic Validation on nodes with children', (done) => {
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = `scripts:\n  preinstall: /blah\n  postinstall: /blah`;
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = parseYAML(testTextDocument.getText());
					let validator = languageService.doValidation(testTextDocument, yDoc2, false);
					validator.then(function(result){
						assert.equal(result.length, 0);
					}).then(done, done);
				});
			});		
		});
	});
});