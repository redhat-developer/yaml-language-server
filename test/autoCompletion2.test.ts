/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { configureLanguageService, setupTextDocument }  from './testHelper';
import { completionAdjustor } from '../src/languageservice/utils/completionHelper';
import { ServiceSetup } from '../src/serviceSetup';
import { parse as parseYAML } from '../src/languageservice/parser/yamlParser';
var assert = require('assert');

let uri = 'http://json.schemastore.org/composer';
let fileMatch = ["*.yml", "*.yaml"];
let languageSettingsSetup = new ServiceSetup()
	.withCompletion()
	.withSchemaFileMatch({ uri, fileMatch: fileMatch });
let languageService = configureLanguageService(
	languageSettingsSetup.languageSettings
);

suite("Auto Completion Tests", () => {

	function parseSetup(content: string, position){
		let testTextDocument = setupTextDocument(content);
		const completionAdjusted = completionAdjustor(testTextDocument, testTextDocument.positionAt(position));
		let jsonDocument = parseYAML(completionAdjusted.newText);
		return languageService.doComplete(testTextDocument, completionAdjusted.newPosition, jsonDocument);
	}

	describe('yamlCompletion with composer', function(){

		describe('doComplete', function(){

			it('Array autocomplete without word', (done) => {
				let content = "authors:\n  - ";
				let completion = parseSetup(content, 14);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Array autocomplete without word on array symbol', (done) => {
				let content = "authors:\n  -";
				let completion = parseSetup(content, 13);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Array autocomplete without word on space before array symbol', (done) => {
				let content = "authors:\n  - name: test\n  "
				let completion = parseSetup(content, 24);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Array autocomplete with letter', (done) => {
				let content = "authors:\n  - n";
				let completion = parseSetup(content, 14);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Array autocomplete without word (second item)', (done) => {
				let content = "authors:\n  - name: test\n    ";
				let completion = parseSetup(content, 32);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Array autocomplete with letter (second item)', (done) => {
				let content = "authors:\n  - name: test\n    e";
				let completion = parseSetup(content, 27);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocompletion after array', (done) => {
				let content = "authors:\n  - name: test\n"
				let completion = parseSetup(content, 24);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocompletion after array with depth', (done) => {
				let content = "archive:\n  exclude:\n  - test\n"
				let completion = parseSetup(content, 29);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocompletion after array with depth', (done) => {
				let content = "autoload:\n  classmap:\n  - test\n  exclude-from-classmap:\n  - test\n  "
				let completion = parseSetup(content, 70);
				completion.then(function(result){
					assert.notEqual(result.items.length, 0);
				}).then(done, done);
			});

		});

		describe('Failure tests', function(){

			it('Autocompletion has no results on value when they are not available', (done) => {
				let content = "time: "
				let completion = parseSetup(content, 6);
				completion.then(function(result){
					assert.equal(result.items.length, 0);
				}).then(done, done);
			});

			it('Autocompletion has no results on value when they are not available (with depth)', (done) => {
				let content = "archive:\n  exclude:\n    - test\n    "
				let completion = parseSetup(content, 33);
				completion.then(function(result){
					assert.equal(result.items.length, 0);
				}).then(done, done);
			});

		});

	});
});
