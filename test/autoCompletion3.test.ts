/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { configureLanguageService, setupTextDocument}  from './testHelper';
import { completionAdjustor } from '../src/languageservice/utils/completionHelper';
import { ServiceSetup } from '../src/serviceSetup';
import { parse as parseYAML } from '../src/languageservice/parser/yamlParser';

var assert = require('assert');

let uri = 'http://json.schemastore.org/asmdef';
let fileMatch = ["*.yml", "*.yaml"];
let languageSettingsSetup = new ServiceSetup()
	.withCompletion()
	.withSchemaFileMatch({ uri, fileMatch: fileMatch });
let languageService = configureLanguageService(
	languageSettingsSetup.languageSettings
);

suite("Auto Completion Tests", () => {

	describe('yamlCompletion with asmdef', function(){

		describe('doComplete', function(){

			function parseSetup(content: string, position){
				let testTextDocument = setupTextDocument(content);
				const completionAdjusted = completionAdjustor(testTextDocument, testTextDocument.positionAt(position));
				let jsonDocument = parseYAML(completionAdjusted.newText);
    			return languageService.doComplete(testTextDocument, completionAdjusted.newPosition, jsonDocument);
			}

			it('Array of enum autocomplete without word on array symbol', (done) => {
				let content = "optionalUnityReferences:\n  -";
				let completion = parseSetup(content, 29);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
            });
            
            it('Array of enum autocomplete without word', (done) => {
				let content = "optionalUnityReferences:\n  - ";
				let completion = parseSetup(content, 30);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
            });
            
            it('Array of enum autocomplete with letter', (done) => {
				let content = "optionalUnityReferences:\n  - T";
				let completion = parseSetup(content, 31);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Array of enum autocomplete with multiline text', (done) => {
				let content = "optionalUnityReferences:\n  - T\n    e\n";
				let completion = parseSetup(content, 31);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
					// textEdit must be single line
					assert.equal(result.items[0].textEdit, undefined)
				}).then(done, done);
			});
		});
	});
});
