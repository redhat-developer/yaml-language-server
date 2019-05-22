/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import path = require("path");
import {
	toFsPath,
	setupTextDocument,
	configureLanguageService
} from "./testHelper";
import { parse as parseYAML } from "../src/languageservice/parser/yamlParser";
import { ServiceSetup } from '../src/serviceSetup';
var assert = require("assert");


let uri = toFsPath(
	path.join(__dirname, "./fixtures/customMultipleSchemaSequences.json")
);
let fileMatch = ["*.yml", "*.yaml"];
let languageSettingsSetup = new ServiceSetup()
	.withValidate()
	.withHover()
	.withCustomTags(['!Test', '!Ref sequence'])
	.withSchemaFileMatch({ uri, fileMatch: fileMatch });
let languageService = configureLanguageService(
	languageSettingsSetup.languageSettings
);

// Defines a Mocha test suite to group tests of similar kind together
suite("Multiple Documents Validation Tests", () => {
	// Tests for validator
	describe("Multiple Documents Validation", function() {
		function validatorSetup(content: string) {
			const testTextDocument = setupTextDocument(content);
			const yDoc = parseYAML(
				testTextDocument.getText(),
				languageSettingsSetup.languageSettings.customTags
			);
			return languageService.doValidation(testTextDocument, yDoc);
		}

		it("Should validate multiple documents", done => {
			const content = `
name: jack
age: 22
---
analytics: true
            `;
			const validator = validatorSetup(content);
			validator
				.then(result => {
					assert.equal(result.length, 0);
				})
				.then(done, done);
		});

		it("Should find errors in both documents", done => {
			let content = `name1: jack
age: asd
---
cwd: False`;
			let validator = validatorSetup(content);
			validator
				.then(function(result) {
					assert.equal(result.length, 3);
				})
				.then(done, done);
		});

		it("Should find errors in first document", done => {
			let content = `name: jack
age: age
---
analytics: true`;
			let validator = validatorSetup(content);
			validator
				.then(function(result) {
					assert.equal(result.length, 1);
				})
				.then(done, done);
		});

		it("Should find errors in second document", done => {
			let content = `name: jack
age: 22
---
cwd: False`;
			let validator = validatorSetup(content);
			validator
				.then(function(result) {
					assert.equal(result.length, 1);
				})
				.then(done, done);
		});

	});
});
