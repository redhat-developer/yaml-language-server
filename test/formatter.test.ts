/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { configureLanguageService, setupTextDocument } from './utils/testHelper';
import { ServiceSetup } from './utils/serviceSetup';
var assert = require('assert');

let languageSettingsSetup = new ServiceSetup()
	.withFormat()
let languageService = configureLanguageService(
	languageSettingsSetup.languageSettings
);

// Defines a Mocha test suite to group tests of similar kind together
suite("Formatter Tests", () => {

    // Tests for validator
    describe('Formatter', function () {

        describe('Test that formatter works with custom tags', function () {

            function parseSetup(content: string, options={}) {
                let testTextDocument = setupTextDocument(content);
                return languageService.doFormat(testTextDocument, options);
            }

            it('Formatting works without custom tags', () => {
                let content = `cwd: test`;
                let edits = parseSetup(content);
                assert.notEqual(edits.length, 0);
                assert.equal(edits[0].newText, "cwd: test\n");
            });

            it('Formatting works with custom tags', () => {
                let content = `cwd:       !Test test`;
                let edits = parseSetup(content);
                assert.notEqual(edits.length, 0);
                assert.equal(edits[0].newText, "cwd: !Test test\n");
            });

            it('Formatting wraps text', () => {
                let content = `comments: >
                test test test test test test test test test test test test`;
                let edits = parseSetup(content, {
                    printWidth: 20,
                    proseWrap: "always"
                });
                assert.equal(edits[0].newText, "comments: >\n  test test test\n  test test test\n  test test test\n  test test test\n");
            });
        });

    });
});