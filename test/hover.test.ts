/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import path = require("path");
import {
	toFsPath,
	configureLanguageService,
	setupTextDocument,
	createJSONLanguageService
} from "./testHelper";
import { parse as parseYAML } from "../src/languageservice/parser/yamlParser";
import { ServiceSetup } from "../src/serviceSetup";
var assert = require("assert");

/**
 * Setup the schema we are going to use with the language settings
 */
let uri = 'http://json.schemastore.org/bowerrc';
let fileMatch = ["*.yml", "*.yaml"];
let languageSettingsSetup = new ServiceSetup()
	.withHover()
	.withSchemaFileMatch({ uri, fileMatch: fileMatch });
let languageService = configureLanguageService(
	languageSettingsSetup.languageSettings
);
const jsonLanguageService = createJSONLanguageService();

suite("Hover Tests", () => {
	describe("Hover", function() {
		function parseSetup(content: string, position) {
			let testTextDocument = setupTextDocument(content);
			let jsonDocument = parseYAML(jsonLanguageService, testTextDocument.getText());
			jsonLanguageService.configure({
				schemas: [{
					fileMatch,
					uri
				}]
			})
			return languageService.doHover(
				jsonLanguageService,
				testTextDocument,
				testTextDocument.positionAt(position),
				jsonDocument
			);
		}

		it("Hover on key on root", done => {
			let content = "cwd: test";
			let hover = parseSetup(content, 1);
			hover
				.then(function(result) {
					assert.equal(result.contents.length, 1);
					assert.equal(
						result.contents[0],
						"Current working directory"
					);
				})
				.then(done, done);
		});

		it("Hover on value on root", done => {
			let content = "cwd: test";
			let hover = parseSetup(content, 6);
			hover
				.then(function(result) {
					assert.equal(result.contents.length, 1);
					assert.equal(
						result.contents[0],
						"Current working directory"
					);
				})
				.then(done, done);
		});

		it("Hover on key with depth", done => {
			let content = "scripts:\n  postinstall: test";
			let hover = parseSetup(content, 15);
			hover
				.then(function(result) {
					assert.equal(result.contents.length, 1);
				})
				.then(done, done);
		});

		it("Hover on value with depth", done => {
			let content = "scripts:\n  postinstall: test";
			let hover = parseSetup(content, 26);
			hover
				.then(function(result) {
					assert.equal(result.contents.length, 1);
				})
				.then(done, done);
		});

		it("Hover works on both root node and child nodes works", done => {
			let content = "scripts:\n  postinstall: test";

			let firstHover = parseSetup(content, 3);
			firstHover.then(function(result) {
				assert.equal(result.contents.length, 1);
			});

			let secondHover = parseSetup(content, 15);
			secondHover
				.then(function(result) {
					assert.equal(result.contents.length, 1);
				})
				.then(done, done);
		});

		it("Hover does not show results when there isnt description field", done => {
			let content = "analytics: true";
			let hover = parseSetup(content, 3);
			hover
				.then(function(result) {
					assert.equal(result.contents.length, 0);
				})
				.then(done, done);
		});

		it("Hover on first document in multi document", done => {
			let content = "---\nanalytics: true\n...\n---\njson: test\n...";
			let hover = parseSetup(content, 10);
			hover
				.then(function(result) {
					assert.equal(result.contents.length, 1);
				})
				.then(done, done);
		});

		it("Hover on second document in multi document", done => {
			let content = "---\nanalytics: true\n...\n---\njson: test\n...";
			let hover = parseSetup(content, 30);
			hover
				.then(function(result) {
					assert.equal(result.contents.length, 1);
				})
				.then(done, done);
		});

		it("Hover should not return anything on key", done => {
			let content = "my_unknown_hover: test";
			let hover = parseSetup(content, 1);
			hover
				.then(function(result) {
					assert.equal(result.contents.length, 0);
				})
				.then(done, done);
		});

		it("Hover should not return anything on value", done => {
			let content = "my_unknown_hover: test";
			let hover = parseSetup(content, 21);
			hover
				.then(function(result) {
					assert.equal(result.contents.length, 0);
				})
				.then(done, done);
		});

		it("Hover works on array nodes", done => {
			let content = "authors:\n  - name: Josh";
			let hover = parseSetup(content, 14);
			hover
				.then(function(result) {
					assert.notEqual(result.contents.length, 0);
					assert.equal(result.contents[0], "This is my name");
				})
				.then(done, done);
		});

		it("Hover works on additional array nodes", done => {
			let content = "authors:\n  - name: Josh\n  - email: jp";
			let hover = parseSetup(content, 28);
			hover
				.then(function(result) {
					assert.notEqual(result.contents.length, 0);
					assert.equal(result.contents[0], "This is my email");
				})
				.then(done, done);
		});
	});
});
