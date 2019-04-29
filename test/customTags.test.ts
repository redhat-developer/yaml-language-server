/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { configureLanguageService, setupTextDocument } from "./testHelper";
import { parse as parseYAML } from "../src/languageservice/parser/yamlParser";
import { ServiceSetup } from "../src/serviceSetup";
var assert = require("assert");

// Defines a Mocha test suite to group tests of similar kind together
suite("Custom Tag tests Tests", () => {
	function createLanguageServiceWithCustomTags(customTags: string[]) {
		let languageSettingsSetup = new ServiceSetup()
			.withValidate()
			.withCustomTags(customTags);

		return configureLanguageService(languageSettingsSetup.languageSettings);
	}

	function parseSetup(content: string, customTags: string[]) {
		let testTextDocument = setupTextDocument(content);
		let languageService = createLanguageServiceWithCustomTags(customTags);
		let yDoc = parseYAML(testTextDocument.getText(), customTags);
		return languageService.doValidation(testTextDocument, yDoc);
	}

	describe("Test that validation does not throw errors", function() {
		it("Custom Tags without type not specified", done => {
			let content = `scalar_test: !Test test_example`;
			let validator = parseSetup(content, ["!Test"]);
			validator
				.then(function(result) {
					assert.equal(result.length, 0);
				})
				.then(done, done);
		});

		it("Custom Tags with one type", done => {
			let content = `resolvers: !Ref\n  - test`;
			let validator = parseSetup(content, ["!Ref sequence"]);
			validator
				.then(function(result) {
					assert.equal(result.length, 0);
				})
				.then(done, done);
		});

		it("Custom Tags with multiple types", done => {
			let content = `resolvers: !Ref\n  - test`;
			let validator = parseSetup(content, [
				"!Ref sequence",
				"!Ref mapping",
				"!Ref scalar"
			]);
			validator
				.then(function(result) {
					assert.equal(result.length, 0);
				})
				.then(done, done);
		});

		it("Allow multiple different custom tag types with different use", done => {
			let content = "!test\nhello: !test\n  world";
			let validator = parseSetup(content, [
				"!test scalar",
				"!test mapping"
			]);
			validator
				.then(function(result) {
					assert.equal(result.length, 0);
				})
				.then(done, done);
		});

		it("Allow multiple different custom tag types with multiple different uses", done => {
			let content =
				"!test\nhello: !test\n  world\nsequence: !ref\n  - item1";
			let validator = parseSetup(content, [
				"!test scalar",
				"!test mapping",
				"!ref sequence",
				"!ref mapping"
			]);
			validator
				.then(function(result) {
					assert.equal(result.length, 0);
				})
				.then(done, done);
		});
	});

	describe("Test that validation does throw errors", function() {
		it("Error when custom tag is not available", done => {
			let content = "!test";
			let validator = parseSetup(content, []);
			validator
				.then(function(result) {
					assert.equal(result.length, 1);
				})
				.then(done, done);
		});
	});
});
