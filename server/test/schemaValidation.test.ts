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
import { AutoCompleter } from '../src/languageService/services/autoCompleter'
import { YAMLSChemaValidator } from '../src/languageService/services/schemaValidator'
import {load as yamlLoader, YAMLDocument, YAMLException, YAMLNode} from 'yaml-ast-parser-beta';
import { xhr, XHRResponse, configure as configureHttpRequests, getErrorStatusDescription } from 'request-light';
import {getLanguageService} from '../src/languageService/yamlLanguageService'
import Strings = require( '../src/languageService/utils/strings');
import URI from '../src/languageService/utils/uri';
import * as URL from 'url';
import fs = require('fs');
import {JSONSchemaService} from '../src/languageService/services/jsonSchemaService'
var glob = require('glob');
var assert = require('assert');

namespace VSCodeContentRequest {
	export const type: RequestType<string, string, any, any> = new RequestType('vscode/content');
}

const validationDelayMs = 250;
let pendingValidationRequests: { [uri: string]: NodeJS.Timer; } = {};
let validDocuments: Array<String>;


// Create a connection for the server.
let connection: IConnection = null;
if (process.argv.indexOf('--stdio') == -1) {
	connection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));
} else {
	connection = createConnection();
}

// After the server has started the client sends an initialize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilities.
let workspaceRoot: string;
connection.onInitialize((params): InitializeResult => {
	workspaceRoot = params.rootPath;
	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: TextDocumentSyncKind.Full,
			// Tell the client that the server support code complete
			completionProvider: {
				resolveProvider: false
			}
		}
	}
});

let workspaceContext = {
	resolveRelativePath: (relativePath: string, resource: string) => {
		return URL.resolve(resource, relativePath);
	}
};

let schemaRequestService = (uri: string): Thenable<string> => {
	if (Strings.startsWith(uri, 'file://')) {
		let fsPath = URI.parse(uri).fsPath;
		return new Promise<string>((c, e) => {
			fs.readFile(fsPath, 'UTF-8', (err, result) => {
				err ? e('') : c(result.toString());
			});
		});
	} else if (Strings.startsWith(uri, 'vscode://')) {
		return connection.sendRequest(VSCodeContentRequest.type, uri).then(responseText => {
			return responseText;
		}, error => {
			return error.message;
		});
	}
	return xhr({ url: uri, followRedirects: 5 }).then(response => {
		return response.responseText;
	}, (error: XHRResponse) => {
		return Promise.reject(error.responseText || getErrorStatusDescription(error.status) || error.toString());
	});
};

let languageService = getLanguageService(schemaRequestService, workspaceContext);

// Defines a Mocha test suite to group tests of similar kind together
suite("Validation Tests", () => {

	// Tests for schemaToMappingTransformer

	// Tests for validator
	describe('Validation - schemaValidation and schemaValidator files', function() {
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

				it('Advanced validation on full file', (done) => {
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = `apiVersion: v1\nkind: Pod\nmetadata:\n  name: rss-site\nspec:\n  containers:\n    - name: front-end\n    image: nginx\n    ports:\n      - containerPort: 80\n    - name: rss-reader`;
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = yamlLoader(testTextDocument.getText(),{});
					let validator = languageService.doValidation(testTextDocument, <YAMLDocument>yDoc2);
					validator.then(function(result){
						assert.equal(result.items.length, 0);
					}).then(done, done);
				});
			});
			
			describe('Checking validating types', function(){
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

				it('Validating fails on incorrect scalar node type (null)', (done) => {
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = `apiVersion: null`;
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
			});
			

			//Validation errors
			describe('Checking validation errors', function(){
				it('Root Child node not found', (done) => {
					let uri = "file://~/Desktop/vscode-k8s/test.yaml";
					let content = `testNode: null`;
					let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
					let yDoc2 = yamlLoader(testTextDocument.getText(),{});
					let validator = languageService.doValidation(testTextDocument, <YAMLDocument>yDoc2);
					validator.then(function(result){
						assert.equal(result.items.length, 1);
						assert.equal(result.items[0]["message"], "Command not found in k8s")
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
						assert.equal(result.items[0]["message"], "Not a valid child node for this parent")
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
						assert.equal(result.items[0]["message"], "Not a valid child node for this parent");
					}).then(done, done);
				});
			});
			
		});
	});



});