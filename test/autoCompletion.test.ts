/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TextDocument } from 'vscode-languageserver';
import { getLanguageService } from '../src/languageservice/yamlLanguageService';
import { schemaRequestService, workspaceContext } from './utils/testHelper';
import assert = require('assert');

const languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

const uri = 'http://json.schemastore.org/bowerrc';
const languageSettings = {
    schemas: [],
    completion: true
};
const fileMatch = ['*.yml', '*.yaml'];
languageSettings.schemas.push({ uri, fileMatch: fileMatch });
languageService.configure(languageSettings);

suite('Auto Completion Tests', () => {

    function setup(content: string) {
        return TextDocument.create('file://~/Desktop/vscode-k8s/test.yaml', 'yaml', 0, content);
    }

    function parseSetup(content: string, position) {
        const testTextDocument = setup(content);
        return languageService.doComplete(testTextDocument, testTextDocument.positionAt(position), false);
    }

    describe('yamlCompletion with bowerrc', function () {

        describe('doComplete', function () {

            it('Autocomplete on root node without word', done => {
                const content = '';
                const completion = parseSetup(content, 0);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it('Autocomplete on root node with word', done => {
                const content = 'analyt';
                const completion = parseSetup(content, 6);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it('Autocomplete on default value (without :)', done => {
                const content = 'directory';
                const completion = parseSetup(content, 10);
                completion.then(function (result) {
                    assert.equal(result.items[0].insertText, 'directory: bower_components');
                }).then(done, done);
            });

            it('Autocomplete on default value (without value content)', done => {
                const content = 'directory: ';
                const completion = parseSetup(content, 12);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it('Autocomplete on default value (with value content)', done => {
                const content = 'directory: bow';
                const completion = parseSetup(content, 15);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it('Autocomplete on boolean value (without value content)', done => {
                const content = 'analytics: ';
                const completion = parseSetup(content, 11);
                completion.then(function (result) {
                    assert.equal(result.items.length, 2);
                }).then(done, done);
            });

            it('Autocomplete on boolean value (with value content)', done => {
                const content = 'analytics: fal';
                const completion = parseSetup(content, 11);
                completion.then(function (result) {
                    assert.equal(result.items.length, 2);
                }).then(done, done);
            });

            it('Autocomplete on number value (without value content)', done => {
                const content = 'timeout: ';
                const completion = parseSetup(content, 9);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                }).then(done, done);
            });

            it('Autocomplete on number value (with value content)', done => {
                const content = 'timeout: 6';
                const completion = parseSetup(content, 10);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                }).then(done, done);
            });

            it('Autocomplete key in middle of file', done => {
                const content = 'scripts:\n  post';
                const completion = parseSetup(content, 11);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it('Autocomplete key in middle of file 2', done => {
                const content = 'scripts:\n  postinstall: /test\n  preinsta';
                const completion = parseSetup(content, 31);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it('Autocomplete does not happen right after :', done => {
                const content = 'analytics:';
                const completion = parseSetup(content, 9);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it('Autocomplete does not happen right after : under an object', done => {
                const content = 'scripts:\n  postinstall:';
                const completion = parseSetup(content, 21);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it('Autocomplete on multi yaml documents in a single file on root', done => {
                const content = '---\nanalytics: true\n...\n---\n...';
                const completion = parseSetup(content, 28);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it('Autocomplete on multi yaml documents in a single file on scalar', done => {
                const content = '---\nanalytics: true\n...\n---\njson: \n...';
                const completion = parseSetup(content, 34);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });
        });

        describe('Autocompletion using custom provided schema', function () {
            it('Test that properties that have multiple enums get auto completed properly', done => {
                const schema = {
                    'definitions': {
                        'ImageBuild': {
                            'type': 'object',
                            'properties': {
                                'kind': {
                                    'type': 'string',
                                    'enum': [
                                        'ImageBuild',
                                        'ImageBuilder'
                                    ]
                                }
                            }
                        },
                        'ImageStream': {
                            'type': 'object',
                            'properties': {
                                'kind': {
                                    'type': 'string',
                                    'enum': [
                                        'ImageStream',
                                        'ImageStreamBuilder'
                                    ]
                                }
                            }
                        }
                    },
                    'oneOf': [
                        {
                            '$ref': '#/definitions/ImageBuild'
                        },
                        {
                            '$ref': '#/definitions/ImageStream'
                        }
                    ]
                };
                languageService.configure({
                    schemas: [{
                        uri: 'file://test.yaml',
                        fileMatch: ['*.yaml', '*.yml'],
                        schema
                    }],
                    completion: true
                });
                const content = 'kind: ';
                const validator = parseSetup(content, 6);
                validator.then(function (result) {
                    assert.equal(result.items.length, 4);
                    assert.equal(result.items[0].label, 'ImageBuild');
                    assert.equal(result.items[1].label, 'ImageBuilder');
                    assert.equal(result.items[2].label, 'ImageStream');
                    assert.equal(result.items[3].label, 'ImageStreamBuilder');
                }).then(done, done);
            });
        });
    });
});
