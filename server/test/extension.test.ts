// 
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
var assert = require('assert');

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

// Defines a Mocha test suite to group tests of similar kind together
suite("Extension Tests", () => {

	// Tests for schemaToMappingTransformer

	let uri = "file://~/Desktop/vscode-k8s/test.yaml";
	let content = `
		apiVersion: v1
		kind: Pod
		metadata:
		name: rss-site
		spec:
		containers:
			- name: front-end
			image: nginx
			ports:
				- containerPort: 80
			- name: rss-reader
			image: rss-php-nginx:v1
			ports:
				- containerPort: 88`;

	let testTextDocument = TextDocument.create(uri, "yaml", 1, content.trim());

	// Testing the schema validator
	test("Testing Valid Schema has no Error Results", () => {
		let validator = new YAMLSChemaValidator(null, testTextDocument);
		let yDoc= yamlLoader(testTextDocument.getText(),{});
		validator.traverseBackToLocation(<YAMLNode>yDoc);
		let errorResults = validator.getErrorResults();
		assert.equals(errorResults.length, 0);
	});

	test("Testing Unknown k8s command", () => {
		let uri = "file://~/Desktop/vscode-k8s/test.yaml";
		let content = "apiVers: v2";

		let testTextDocument = TextDocument.create(uri, "yaml", 1, content);

		let validator = new YAMLSChemaValidator(null, testTextDocument);
		let yDoc= yamlLoader(testTextDocument.getText(),{});
		validator.traverseBackToLocation(<YAMLNode>yDoc);
		let errorResults = validator.getErrorResults();
		assert.equals(errorResults.length, 1);
		assert.eqauls(errorResults[0].message, "Command not found in k8s");
	});

	test("Testing Unknown k8s command - indented", () => {
		let uri = "file://~/Desktop/vscode-k8s/test.yaml";
		let content = `
				apiVersion: v1
				metadata:
					na: hello`;

		let testTextDocument = TextDocument.create(uri, "yaml", 1, content.trim());

		let validator = new YAMLSChemaValidator(null, testTextDocument);
		let yDoc= yamlLoader(testTextDocument.getText(),{});
		validator.traverseBackToLocation(<YAMLNode>yDoc);
		let errorResults = validator.getErrorResults();
		assert.equals(errorResults.length, 1);
		assert.eqauls(errorResults[0].message, "Command not found in k8s");
	});
	
	test("Error Results", () => {
		let validator = new YAMLSChemaValidator(null, null);
		
	});








	//Make schema

	// Tests for autocompleter
	test("Autocompletion initialized", () => {
		let auto = new AutoCompleter(null);
		assert.notEquals(auto, null);
	});

	test("Searching node", () => {
		let auto = new AutoCompleter(null);
		let searchResults = auto.search("apiVersion", null);
		let should = [];
		assert.equals(should, searchResults);
	});

	test("Searching all nodes in schema", () => {
		let auto = new AutoCompleter(null);
		let searchResults = auto.searchAll();
		let should = [];
		assert.equals(should, searchResults);
	});

	test("Root Node Search", () => {
		let auto = new AutoCompleter(null);
		let searchResults = auto.search("apiVersion", null);
		let should = [];
		assert.equals(should, searchResults);
	});
    
});