import { ServiceSetup } from './utils/serviceSetup';
import { createJSONLanguageService, configureLanguageService, setupTextDocument } from './utils/testHelper';
import { parse } from '../src/languageservice/parser/yamlParser07';

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var assert = require("assert");

/**
 * Setup the schema we are going to use with the language settings
 */
let bowerURI = 'http://json.schemastore.org/bowerrc';
let composerURI = 'http://json.schemastore.org/composer';
let fileMatch = ["*.yml", "*.yaml"];
let languageSettingsSetup = new ServiceSetup()
	.withHover()
	.withSchemaFileMatch({ uri: bowerURI, fileMatch: fileMatch });
let languageService = configureLanguageService(
	languageSettingsSetup.languageSettings
);

suite("Hover Tests", () => {
	describe("Hover", function() {
		function parseSetup(content: string, position, schemaURI: string) {
			let testTextDocument = setupTextDocument(content);
			let jsonDocument = parse(testTextDocument.getText());
			const jsonLanguageService = createJSONLanguageService();
			jsonLanguageService.configure({
				schemas: [{
					fileMatch,
					uri: schemaURI
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
			let hover = parseSetup(content, 1, bowerURI);
			hover
				.then(function(result) {
					assert.equal(result.contents.length, 1);
					assert.equal(
						result.contents[0],
						"The directory from which bower should run\\. All relative paths will be calculated according to this setting\\."
					);
				})
				.then(done, done);
		});

		it("Hover on value on root", done => {
			let content = "cwd: test";
			let hover = parseSetup(content, 6, bowerURI);
			hover
				.then(function(result) {
					assert.equal(result.contents.length, 1);
					assert.equal(
						result.contents[0],
						"The directory from which bower should run\\. All relative paths will be calculated according to this setting\\."
					);
				})
				.then(done, done);
		});

		it("Hover on key with depth", done => {
			let content = "scripts:\n  postinstall: test";
			let hover = parseSetup(content, 15, bowerURI);
			hover
				.then(function(result) {
					assert.equal(result.contents.length, 1);
					assert.equal(
						result.contents[0],
						"A script to run after install"
					);
				})
				.then(done, done);
		});

		it("Hover on value with depth", done => {
			let content = "scripts:\n  postinstall: test";
			let hover = parseSetup(content, 26, bowerURI);
			hover
				.then(function(result) {
					assert.equal(result.contents.length, 1);
					assert.equal(
						result.contents[0],
						"A script to run after install"
					);
				})
				.then(done, done);
		});

		it("Hover works on both root node and child nodes works", done => {
			let content = "scripts:\n  postinstall: test";

			let firstHover = parseSetup(content, 3, bowerURI);
			firstHover.then(function(result) {
				assert.equal(result.contents.length, 1);
				assert.equal(
					result.contents[0],
					"Contains custom hooks used to trigger other automated tools"
				);
			});

			let secondHover = parseSetup(content, 15, bowerURI);
			secondHover
				.then(function(result) {
					assert.equal(result.contents.length, 1);
					assert.equal(
						result.contents[0],
						"A script to run after install"
					);
				})
				.then(done, done);
		});

		it("Hover does not show results when there isnt description field", done => {
			let content = "analytics: true";
			let hover = parseSetup(content, 3, bowerURI);
			hover
				.then(function(result) {
					assert.equal(result.contents.length, 1);
					assert.equal(result.contents[0], "");
				})
				.then(done, done);
		});

		it("Hover on first document in multi document", done => {
			let content = "---\nanalytics: true\n...\n---\njson: test\n...";
			let hover = parseSetup(content, 10, bowerURI);
			hover
				.then(function(result) {
					assert.equal(result.contents.length, 1);
					assert.equal(
						result.contents[0],
						""
					);
				})
				.then(done, done);
		});

		it("Hover on second document in multi document", done => {
			let content = "---\nanalytics: true\n...\n---\njson: test\n...";
			let hover = parseSetup(content, 30, bowerURI);
			hover
				.then(function(result) {
					assert.equal(result.contents.length, 1);
					assert.equal(
						result.contents[0],
						"A file path to the Bower configuration file"
					);
				})
				.then(done, done);
		});

		it("Hover should not return anything on key", done => {
			let content = "my_unknown_hover: test";
			let hover = parseSetup(content, 1, bowerURI);
			hover
				.then(function(result) {
					assert.equal(result.contents.length, 1);
					assert.equal(result.contents[0], "");
				})
				.then(done, done);
		});

		it("Hover should not return anything on value", done => {
			let content = "my_unknown_hover: test";
			let hover = parseSetup(content, 21, bowerURI);
			hover
				.then(function(result) {
					assert.equal(result.contents.length, 1);
					assert.equal(result.contents[0], "");
				})
				.then(done, done);
		});

		it("Hover works on array nodes", done => {
			let content = "authors:\n  - name: Josh";
			let hover = parseSetup(content, 14, composerURI);
			hover
				.then(function(result) {
					assert.notEqual(result.contents.length, 0);
					assert.equal(result.contents[0], "Full name of the author\\.");
				})
				.then(done, done);
		});

		it("Hover works on additional array nodes", done => {
			let content = "authors:\n  - name: Josh\n  - email: jp";
			let hover = parseSetup(content, 28, composerURI);
			hover
				.then(function(result) {
					assert.notEqual(result.contents.length, 0);
					assert.equal(result.contents[0], "Email address of the author\\.");
				})
				.then(done, done);
		});
	});
});