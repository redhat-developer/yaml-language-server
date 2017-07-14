// 
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node


import {
	IPCMessageReader, IPCMessageWriter,
	createConnection, IConnection, TextDocumentSyncKind,
	TextDocuments, TextDocument, Diagnostic, DiagnosticSeverity,
	InitializeParams, InitializeResult, TextDocumentPositionParams,
	CompletionItem, CompletionItemKind, RequestType
} from 'vscode-languageserver';
import { autoCompletionProvider } from '../src/languageService/providers/autoCompletionProvider'
import {load as yamlLoader, YAMLDocument, YAMLException, YAMLNode} from 'yaml-ast-parser-beta';
import { xhr, XHRResponse, configure as configureHttpRequests, getErrorStatusDescription } from 'request-light';
import {getLanguageService} from '../src/languageService/yamlLanguageService'
import Strings = require( '../src/languageService/utils/strings');
import URI from '../src/languageService/utils/uri';
import * as URL from 'url';
import * as ast from '../src/languageService/utils/astServices';
import fs = require('fs');
import {JSONSchemaService} from '../src/languageService/services/jsonSchemaService'
import {schemaService, languageService}  from './testHelper';
var glob = require('glob');
var assert = require('assert');


schemaService.getResolvedSchema(schemaService.getRegisteredSchemaIds()[0]).then(schema =>{

    suite("Auto Completion Tests", () => {

        describe('Server - Auto Completion - yamlCompletion', function(){
            
            describe('doComplete', function(){
				
				// it('Autocomplete on root node without word', (done) => {
				// 	let uri = "file://~/Desktop/vscode-k8s/test.yaml";
				// 	let content = "";
				// 	let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
				// 	let yDoc2 = yamlLoader(testTextDocument.getText(),{});
				// 	let validator = languageService.doComplete(testTextDocument, testTextDocument.positionAt(0), <YAMLDocument>yDoc2);
				// 	let auto = new autoCompletionProvider(schema.schema);
				// 	validator.then(function(result){
				// 		// Commented out because of programically added snippets
				// 		// result.items.forEach(element => {
				// 		// 	assert.notEqual(fullWordsList.indexOf(element["label"]), -1);
				// 		// });
				// 		assert.equal(result.items.length, fullWords.length+5);					
				// 	}).then(done, done);
				// });

				it('Autocomplete on root node with word', (done) => {
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = "apiVers:";
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = yamlLoader(testTextDocument.getText(),{});
					let validator = languageService.doComplete(testTextDocument, testTextDocument.positionAt(6), <YAMLDocument>yDoc2);
					validator.then(function(result){
						assert.equal(result.items.length, 5);
						//assert.equal(result.items[0]["label"], "apiVersion");
					}).then(done, done);
				});

				it('Autocomplete on scalar node', (done) => {
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = "kind: Deploymen";
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = yamlLoader(testTextDocument.getText(),{});
					let validator = languageService.doComplete(testTextDocument, testTextDocument.positionAt(15), <YAMLDocument>yDoc2);
					validator.then(function(result){
						assert.equal(result.items.length, 105);
						//assert.notEqual(result.items.map(x => x["label"]).indexOf("Deployment"), -1);
					}).then(done, done);
				});

				/*
				 * Fix me. Need a node somehow.
				 */
				// it('Autocomplete on child node without word', (done) => {
				// 	let uri = "file://~/Desktop/vscode-k8s/test.yaml";
				// 	let content = "metadata:\n";
				// 	let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
				// 	let yDoc2 = yamlLoader(testTextDocument.getText(),{});
				// 	let validator = languageService.doComplete(testTextDocument, testTextDocument.positionAt(6), <YAMLDocument>yDoc2);
				// 	validator.then(function(result){
				// 		assert.equal(result.items.length, 1);
				// 		assert.equal(result.items[0]["label"], ["Deployment"]);
				// 	}).then(done, done);
				// });

				it('Autocomplete on child node with word', (done) => {
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = "metadata:\n  genera:";
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = yamlLoader(testTextDocument.getText(),{});
					let validator = languageService.doComplete(testTextDocument, testTextDocument.positionAt(18), <YAMLDocument>yDoc2);
					validator.then(function(result){
						assert.equal(result.items.length, 5);
						//assert.equal(result.items[0]["label"], ["generateName"]);
					}).then(done, done);
				});

				it('Autocomplete in the middle of file', (done) => {
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = "apiVersion: v1\nallow\nmetadata:\n  generateName: hello";
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = yamlLoader(testTextDocument.getText(),{});
					let validator = languageService.doComplete(testTextDocument, testTextDocument.positionAt(18), <YAMLDocument>yDoc2);
					validator.then(function(result){
						assert.equal(result.items.length, 147);
						//assert.notEqual(result.items.map(x => x["label"]).indexOf("allowed"), -1);
					}).then(done, done);
				});

				it('Scalar autocomplete in middle of file', (done) => {	
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = "apiVersion: v1\nkind: Deploymen\nmetadata:\n  name: testing";
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = yamlLoader(testTextDocument.getText(),{});
					let validator = languageService.doComplete(testTextDocument, testTextDocument.positionAt(29), <YAMLDocument>yDoc2);
					validator.then(function(result){
						assert.equal(result.items.length, 105);
						//assert.notEqual(result.items.map(x => x["label"]).indexOf("Deployment"), -1);
					}).then(done, done);
				});
            });

        });

    });

});