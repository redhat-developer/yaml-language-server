/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getLanguageService } from "../src/languageservice/yamlLanguageService";
import {
	schemaRequestService,
	workspaceContext,
	setupTextDocument
} from "./testHelper";
import { parse as parseYAML } from "../src/languageservice/parser/yamlParser";
import { SymbolInformation } from "vscode-json-languageservice";
var assert = require("assert");

suite("Document Symbols Tests", () => {
	describe("Document Symbols Tests", function() {
		function parseSetup(content: string): SymbolInformation[] {
			let testTextDocument = setupTextDocument(content);
			let jsonDocument = parseYAML(testTextDocument.getText());
			let languageService = getLanguageService(
				schemaRequestService,
				workspaceContext,
				[],
				null
			);
			return languageService.findDocumentSymbols(
				testTextDocument,
				jsonDocument
			);
		}

		it("Document is empty", done => {
			let content = "";
			let symbols = parseSetup(content);
			assert.equal(symbols, null);
			done();
		});

		it("Simple document symbols", done => {
			let content = "cwd: test";
			let symbols = parseSetup(content);
			assert.equal(symbols.length, 1);
			assert.equal(symbols[0].name, "cwd");
			done();
		});

		it("Document Symbols with number", done => {
			let content = "node1: 10000";
			let symbols = parseSetup(content);
			assert.equal(symbols.length, 1);
			assert.equal(symbols[0].name, "node1");
			done();
		});

		it("Document Symbols with boolean", done => {
			let content = "node1: False";
			let symbols = parseSetup(content);
			assert.equal(symbols.length, 1);
			assert.equal(symbols[0].name, "node1");
			done();
		});

		it("Document Symbols with object", done => {
			let content = "scripts:\n  node1: test\n  node2: test";
			let symbols = parseSetup(content);
			assert.equal(symbols.length, 3);
			assert.equal(symbols[0].name, "scripts");
			assert.equal(symbols[1].name, "node1");
			assert.equal(symbols[2].name, "node2");
			done();
		});

		it("Document Symbols with null", done => {
			let content = "apiVersion: null";
			let symbols = parseSetup(content);
			assert.equal(symbols.length, 1);
			assert.equal(symbols[0].name, "apiVersion");
			done();
		});

		it("Document Symbols with array of strings", done => {
			let content = "items:\n  - test\n  - test";
			let symbols = parseSetup(content);
			assert.equal(symbols.length, 1);
			assert.equal(symbols[0].name, "items");
			done();
		});

		it("Document Symbols with array", done => {
			let content = "authors:\n  - name: Josh\n  - email: jp";
			let symbols = parseSetup(content);
			assert.equal(symbols.length, 3);
			assert.equal(symbols[0].name, "authors");
			assert.equal(symbols[1].name, "name");
			assert.equal(symbols[2].name, "email");
			done();
		});

		it("Document Symbols with object and array", done => {
			let content =
				"scripts:\n  node1: test\n  node2: test\nauthors:\n  - name: Josh\n  - email: jp";
			let symbols = parseSetup(content);
			assert.equal(symbols.length, 6);
			assert.equal(symbols[0].name, "scripts");
			assert.equal(symbols[1].name, "node1");
			assert.equal(symbols[2].name, "node2");
			assert.equal(symbols[3].name, "authors");
			assert.equal(symbols[4].name, "name");
			assert.equal(symbols[5].name, "email");
			done();
		});

		it("Document Symbols with multi documents", done => {
			let content = "---\nanalytics: true\n...\n---\njson: test\n...";
			let symbols = parseSetup(content);
			assert.equal(symbols.length, 2);
			assert.equal(symbols[0].name, "analytics");
			assert.equal(symbols[1].name, "json");
			done();
		});
	});
});
