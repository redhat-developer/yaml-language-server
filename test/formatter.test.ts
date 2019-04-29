/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { configureLanguageService, setupTextDocument } from "./testHelper";
import { ServiceSetup } from "../src/serviceSetup";
var assert = require("assert");

let languageSettingsSetup = new ServiceSetup()
	.withFormat()
	.withCustomTags(["!Test"]);
let languageService = configureLanguageService(
	languageSettingsSetup.languageSettings
);

// Defines a Mocha test suite to group tests of similar kind together
suite("Formatter Tests", () => {
	// Tests for validator
	describe("Formatter", function() {
		describe("Test that formatter works with custom tags", function() {
			it("Formatting works without custom tags", () => {
				let content = `cwd: test`;
				let testTextDocument = setupTextDocument(content);
				let edits = languageService.doFormat(testTextDocument, {});
				assert.notEqual(edits.length, 0);
				assert.equal(edits[0].newText, "cwd: test\n");
			});

			it("Formatting works without custom tags", () => {
				let content = `cwd:       !Test test`;
				let testTextDocument = setupTextDocument(content);
				let edits = languageService.doFormat(testTextDocument, {});
				assert.notEqual(edits.length, 0);
			});

			it("Formatting wraps text", () => {
				let content = `comments: >
                test test test test test test test test test test test test`;
				let testTextDocument = setupTextDocument(content);
				let edits = languageService.doFormat(testTextDocument, {
					printWidth: 20,
					proseWrap: "always"
				});
				assert.equal(
					edits[0].newText,
					"comments: >\n  test test test\n  test test test\n  test test test\n  test test test\n"
				);
			});
		});
	});
});
