/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { setupTextDocument, configureLanguageService }  from './testHelper';
import { completionAdjustor } from '../src/languageservice/utils/completionHelper';
import { ServiceSetup } from '../src/serviceSetup';
import { parse as parseYAML } from '../src/languageservice/parser/yamlParser';
var assert = require('assert');

let uri = 'http://json.schemastore.org/bowerrc';
let fileMatch = ["*.yml", "*.yaml"];
let languageSettingsSetup = new ServiceSetup()
	.withCompletion()
	.withSchemaFileMatch({ uri, fileMatch: fileMatch });
let languageService = configureLanguageService(
	languageSettingsSetup.languageSettings
);

suite("Auto Completion Tests", () => {

	describe('yamlCompletion with bowerrc', function(){

		describe('doComplete', function(){

			function parseSetup(content: string, position){
				let testTextDocument = setupTextDocument(content);
				const completionAdjusted = completionAdjustor(testTextDocument, testTextDocument.positionAt(position));
				let jsonDocument = parseYAML(completionAdjusted.newText);
    			return languageService.doComplete(testTextDocument, completionAdjusted.newPosition, jsonDocument);
			}

			it('Autocomplete on root node without word', (done) => {
				let content = "";
				let completion = parseSetup(content, 0);
				completion.then(function(result){
                    assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocomplete on root node with word', (done) => {
				let content = "analyt";
				let completion = parseSetup(content, 6);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocomplete on default value (without value content)', (done) => {
				let content = "directory: ";
				let completion = parseSetup(content, 12);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocomplete on default value (with value content)', (done) => {
				let content = "directory: bow";
				let completion = parseSetup(content, 15);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocomplete on boolean value (without value content)', (done) => {
				let content = "analytics: ";
				let completion = parseSetup(content, 11);
				completion.then(function(result){
					assert.equal(result.items.length, 2);
				}).then(done, done);
			});

			it('Autocomplete on boolean value (with value content)', (done) => {
				let content = "analytics: fal";
				let completion = parseSetup(content, 11);
				completion.then(function(result){
					assert.equal(result.items.length, 2);
				}).then(done, done);
			});

			it('Autocomplete on number value (without value content)', (done) => {
				let content = "timeout: ";
				let completion = parseSetup(content, 9);
				completion.then(function(result){
					assert.equal(result.items.length, 1);
				}).then(done, done);
			});

			it('Autocomplete on number value (with value content)', (done) => {
				let content = "timeout: 6";
				let completion = parseSetup(content, 10);
				completion.then(function(result){
					assert.equal(result.items.length, 1);
				}).then(done, done);
			});

			it('Autocomplete key in middle of file', (done) => {
				let content = "scripts:\n  post";
				let completion = parseSetup(content, 11);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocomplete key in middle of file 2', (done) => {
				let content = "scripts:\n  postinstall: /test\n  preinsta";
				let completion = parseSetup(content, 31);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocomplete does not happen right after :', (done) => {
				let content = "analytics:";
				let completion = parseSetup(content, 9);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocomplete does not happen right after : under an object', (done) => {
				let content = "scripts:\n  postinstall:";
				let completion = parseSetup(content, 21);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocomplete on multi yaml documents in a single file on root', (done) => {
				let content = `---\nanalytics: true\n...\n---\n...`;
				let completion = parseSetup(content, 28);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocomplete on multi yaml documents in a single file on scalar', (done) => {
				let content = `---\nanalytics: true\n...\n---\njson: \n...`;
				let completion = parseSetup(content, 34);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});
		});
	});
});
