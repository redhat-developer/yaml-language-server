/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TextDocument } from 'vscode-languageserver';
import { getLanguageService } from '../src/languageservice/yamlLanguageService';
import { toFsPath, schemaRequestService, workspaceContext }  from './utils/testHelper';
import assert = require('assert');
import path = require('path');

const languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

const languageSettings = {
    schemas: [],
    completion: true
};

const uri = toFsPath(path.join(__dirname, './fixtures/defaultSnippets.json'));
const fileMatch = ['*.yml', '*.yaml'];
languageSettings.schemas.push({ uri, fileMatch: fileMatch });
languageService.configure(languageSettings);

suite('Default Snippet Tests', () => {

        describe('Snippet Tests', function () {

            function setup(content: string) {
                return TextDocument.create('file://~/Desktop/vscode-k8s/test.yaml', 'yaml', 0, content);
            }

            function parseSetup(content: string, position: number) {
                const testTextDocument = setup(content);
                return languageService.doComplete(testTextDocument, testTextDocument.positionAt(position), false);
            }

            it('Snippet in array schema should autocomplete with -', done => {
                const content = 'array:\n  - ';
                const completion = parseSetup(content, 11);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.equal(result.items[0].insertText, 'item1: $1\n\titem2: $2\n');
                    assert.equal(result.items[0].label, 'My array item');
                }).then(done, done);
            });

            it('Snippet in array schema should autocomplete on next line with depth', done => {
                const content = 'array:\n  - item1:\n    - ';
                const completion = parseSetup(content, 24);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.equal(result.items[0].insertText, 'item1: $1\n\titem2: $2\n');
                    assert.equal(result.items[0].label, 'My array item');
                }).then(done, done);
            });

            it('Snippet in array schema should autocomplete correctly after ', done => {
                const content = 'array:\n  - item1: asd\n  - item2: asd\n    ';
                const completion = parseSetup(content, 40);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.equal(result.items[0].insertText, 'item1: $1\nitem2: $2\n');
                    assert.equal(result.items[0].label, 'My array item');
                }).then(done, done);
            });

            it('Snippet in array schema should autocomplete on same line as array', done => {
                const content = 'array:  ';
                const completion = parseSetup(content, 7);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                }).then(done, done);
            });

            it('Snippet in object schema should autocomplete on next line ', done => {
                const content = 'object:\n  ';
                const completion = parseSetup(content, 11);
                completion.then(function (result) {
                    assert.equal(result.items.length, 2);
                    assert.equal(result.items[0].insertText, 'key1: $1\nkey2: $2\n');
                    assert.equal(result.items[0].label, 'Object item');
                    assert.equal(result.items[1].insertText, 'key:\n\t$1');
                    assert.equal(result.items[1].label, 'key');
                }).then(done, done);
            });

            it('Snippet in object schema should autocomplete on next line with depth', done => {
                const content = 'object:\n  key:\n    ';
                const completion = parseSetup(content, 20);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                    assert.equal(result.items[0].insertText, 'key1: $1\nkey2: $2\n');
                    assert.equal(result.items[0].label, 'Object item');
                    assert.equal(result.items[1].insertText, 'key:\n\t$1');
                    assert.equal(result.items[1].label, 'key');
                }).then(done, done);
            });

            it('Snippet in object schema should autocomplete on same line', done => {
                const content = 'object:  ';
                const completion = parseSetup(content, 8);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                }).then(done, done);
            });

            it('Snippet in string schema should autocomplete on same line', done => {
                const content = 'string:  ';
                const completion = parseSetup(content, 8);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                    assert.equal(result.items[0].insertText, 'test $1');
                    assert.equal(result.items[0].label, 'My string item');
                }).then(done, done);
            });

            it('Snippet in boolean schema should autocomplete on same line', done => {
                const content = 'boolean:  ';
                const completion = parseSetup(content, 9);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                    assert.equal(result.items[0].label, 'My boolean item');
                    assert.equal(result.items[0].insertText, 'false');
                }).then(done, done);
            });
        });
    });
