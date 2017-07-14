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
import { validationProvider } from '../src/languageService/providers/validationProvider'
import {load as yamlLoader, YAMLDocument, YAMLException, YAMLNode} from 'yaml-ast-parser-beta';
import { xhr, XHRResponse, configure as configureHttpRequests, getErrorStatusDescription } from 'request-light';
import {getLanguageService} from '../src/languageService/yamlLanguageService'
import Strings = require( '../src/languageService/utils/strings');
import URI from '../src/languageService/utils/uri';
import * as URL from 'url';
import fs = require('fs');
import {JSONSchemaService} from '../src/languageService/services/jsonSchemaService'
import {schemaService, languageService}  from './testHelper';
var glob = require('glob');
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
					let content = `apiVersion: v1`;
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = yamlLoader(testTextDocument.getText(),{});
					let validator = languageService.doValidation(testTextDocument, <YAMLDocument>yDoc2);
					validator.then(function(result){
						assert.equal(result.items.length, 0);
					}).then(done, done);
				});

				it('Basic Validation on nodes with children', (done) => {
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = `apiVersion: v1\nmetadata:\n  name: hello_world`;
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = yamlLoader(testTextDocument.getText(),{});
					let validator = languageService.doValidation(testTextDocument, <YAMLDocument>yDoc2);
					validator.then(function(result){
						assert.equal(result.items.length, 0);
					}).then(done, done);
				});
			});
			
			describe('Validating types', function(){
				it('Validating fails on incorrect scalar node type (boolean)', (done) => {
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = `apiVersion: false`;
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = yamlLoader(testTextDocument.getText(),{});
					let validator = languageService.doValidation(testTextDocument, <YAMLDocument>yDoc2);
					validator.then(function(result){
						assert.equal(result.items.length, 1);
					}).then(done, done);
				});

				it('Validating fails on incorrect scalar node type with parent (boolean)', (done) => {
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = `metadata:\n  name: false`;
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = yamlLoader(testTextDocument.getText(),{});
					let validator = languageService.doValidation(testTextDocument, <YAMLDocument>yDoc2);
					validator.then(function(result){
						assert.equal(result.items.length, 1);
					}).then(done, done);
				});

				it('Validating fails on incorrect scalar node type with multiple parents (boolean)', (done) => {
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = `spec:\n  containers\n    name: false`;
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = yamlLoader(testTextDocument.getText(),{});
					let validator = languageService.doValidation(testTextDocument, <YAMLDocument>yDoc2);
					validator.then(function(result){
						assert.equal(result.items.length, 1);
					}).then(done, done);
				});

				it('Validating is correct scalar node type (string)', (done) => {
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = `apiVersion: v1`;
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = yamlLoader(testTextDocument.getText(),{});
					let validator = languageService.doValidation(testTextDocument, <YAMLDocument>yDoc2);
					validator.then(function(result){
						assert.equal(result.items.length, 0);
					}).then(done, done);
				});

				it('Validating is correct on scalar node type (null)', (done) => {
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = `apiVersion: null`;
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = yamlLoader(testTextDocument.getText(),{});
					let validator = languageService.doValidation(testTextDocument, <YAMLDocument>yDoc2);
					validator.then(function(result){
						assert.equal(result.items.length, 1);
					}).then(done, done);
				});

				it('Validating is correct scalar node type with parent (number)', (done) => {
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = `metadata:\n  generation: 5`;
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = yamlLoader(testTextDocument.getText(),{});
					let validator = languageService.doValidation(testTextDocument, <YAMLDocument>yDoc2);
					validator.then(function(result){
						assert.equal(result.items.length, 0);
					}).then(done, done);
				});

				it('Validating is correct scalar node type with multiple parents (number)', (done) => {
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = `metadata:\n  ownerReferences:\n    - apiVersion: v1`;
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = yamlLoader(testTextDocument.getText(),{});
					let validator = languageService.doValidation(testTextDocument, <YAMLDocument>yDoc2);
					validator.then(function(result){
						assert.equal(result.items.length, 0);
					}).then(done, done);
				});

				it('Validating if the object is correct', (done) => {
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = `spec: hello`;
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = yamlLoader(testTextDocument.getText(),{});
					let validator = languageService.doValidation(testTextDocument, <YAMLDocument>yDoc2);
					validator.then(function(result){
						assert.equal(result.items.length, 1);
					}).then(done, done);
				});

				it('Validating if the object is correct 2', (done) => {
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = `apiVersion:\n  name: hello`;
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = yamlLoader(testTextDocument.getText(),{});
					let validator = languageService.doValidation(testTextDocument, <YAMLDocument>yDoc2);
					validator.then(function(result){
						assert.equal(result.items.length, 1);
					}).then(done, done);
				});
			});
			

			//Validation errors
			describe('Checking validation errors', function(){
				it('Root node not found', (done) => {
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = `testNode: hello_world`;
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = yamlLoader(testTextDocument.getText(),{});
					let validator = languageService.doValidation(testTextDocument, <YAMLDocument>yDoc2);
					validator.then(function(result){
						assert.equal(result.items.length, 1);
						assert.equal(result.items[0]["message"], 'Node \'testNode\' is not found');
					}).then(done, done);
				});

				it('Checking for valid child node for parent (node does not exist)', (done) => {
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = `apiVersion: v1\nmetadata:\n  na:`;
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = yamlLoader(testTextDocument.getText(),{});
					let validator = languageService.doValidation(testTextDocument, <YAMLDocument>yDoc2);
					validator.then(function(result){
						assert.equal(result.items.length, 1);
						assert.equal(result.items[0]["message"], '\'na\' is an additional property of metadata');
					}).then(done, done);
				});

				it('Checking for valid child node for parent (exists but not valid child node)', (done) => {
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = `metadata:\n apiVersion: v1`;
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = yamlLoader(testTextDocument.getText(),{});
					let validator = languageService.doValidation(testTextDocument, <YAMLDocument>yDoc2);
					validator.then(function(result){
						assert.equal(result.items.length, 1);
						assert.equal(result.items[0]["message"], '\'apiVersion\' is an additional property of metadata');
					}).then(done, done);
				});

				it('Checking that children node values are validated (node exists)', (done) => {
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = `metadata:\n  name: hello`;
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = yamlLoader(testTextDocument.getText(),{});
					let validator = languageService.doValidation(testTextDocument, <YAMLDocument>yDoc2);
					validator.then(function(result){
						assert.equal(result.items.length, 0);
					}).then(done, done);
				});

				it('Checking that children node values are validated (node does not exist under parent)', (done) => {
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = `spec:\n  containers:\n    port:\n      - containerPort: 404`;
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = yamlLoader(testTextDocument.getText(),{});
					let validator = languageService.doValidation(testTextDocument, <YAMLDocument>yDoc2);
					validator.then(function(result){
						assert.equal(result.items.length, 1);
						assert.equal(result.items[0]["message"], "\'containers\' is an additional property of spec");
					}).then(done, done);
				});
			});
			
		});
	});



});