/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TextDocument } from 'vscode-languageserver';
import {getLanguageService} from '../src/languageservice/yamlLanguageService'
import path = require('path');
import {JSONSchemaService} from '../src/languageservice/services/jsonSchemaService'
import {schemaRequestService, workspaceContext}  from './testHelper';
import { parse as parseYAML } from '../src/languageservice/parser/yamlParser';
var assert = require('assert');

let languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

let uri = `file:///${path.join(__dirname, '../../../test/fixtures/customMultipleSchemaSequences.json')}`;
let languageSettings = {
    schemas: [],
    validate: true,
    customTags: []
};
let fileMatch = ["*.yml", "*.yaml"];
languageSettings.schemas.push({ uri, fileMatch: fileMatch });
languageSettings.customTags.push("!Test");
languageSettings.customTags.push("!Ref sequence");
languageService.configure(languageSettings);
// Defines a Mocha test suite to group tests of similar kind together
suite("Multiple Documents Validation Tests", () => {

    // Tests for validator
    describe('Multiple Documents Validation', function() {
        function setup(content: string){
            return TextDocument.create("file://~/Desktop/vscode-k8s/test.yaml", "yaml", 0, content);
        }

        function parseSetup(content: string){
            const testTextDocument = setup(content);
            const yDoc = parseYAML(testTextDocument.getText(), languageSettings.customTags);
            return languageService.doValidation(testTextDocument, yDoc);
        }

        it('Should validate multiple documents', (done) => {
            const content = `
name: jack
age: 22
---
analytics: true
            `;
            const validator = parseSetup(content);
            validator.then((result) => {
                assert.equal(result.length, 0);
            }).then(done, done);
        });

        it('Should find errors in both documents', (done) => {
            let content = `name1: jack
age: asd
---
cwd: False`;
            let validator = parseSetup(content);
            validator.then(function(result){
				assert.equal(result.length, 3);
            }).then(done, done);
        });

		it('Should find errors in first document', (done) => {
			let content = `name: jack
age: age
---
analytics: true`;
			let validator = parseSetup(content);
			validator.then(function(result){
				assert.equal(result.length, 1);
			}).then(done, done);
		});

		it('Should find errors in second document', (done) => {
			let content = `name: jack
age: 22
---
cwd: False`;
			let validator = parseSetup(content);
			validator.then(function(result){
				assert.equal(result.length, 1);
			}).then(done, done);
		});
    });
});