/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getLanguageService } from '../src/languageservice/yamlLanguageService';
import { schemaRequestService, workspaceContext, SCHEMA_ID, setupSchemaIDTextDocument } from './utils/testHelper';
import assert = require('assert');
import path = require('path');
import { createExpectedCompletion } from './utils/verifyError';

const languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

const languageSettings = {
    schemas: [],
    completion: true
};
languageService.configure(languageSettings);

suite('Auto Completion Tests', () => {

    function parseSetup (content: string, position) {
        const testTextDocument = setupSchemaIDTextDocument(content);
        return languageService.doComplete(testTextDocument, testTextDocument.positionAt(position), false);
    }

    afterEach(() => {
        languageService.deleteSchema(SCHEMA_ID);
    });

    describe('YAML Completion Tests', function () {

        describe('JSON Schema Tests', function () {

            it('Autocomplete on root without word', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        'name': {
                            type: 'string'
                        }
                    }
                });
                const content = '';
                const completion = parseSetup(content, 0);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('name', 'name: $1', 0, 0, 0, 0, 10, 2, {
                        documentation: ''
                    }));
                }).then(done, done);
            });

            it('Autocomplete on root with partial word', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        'name': {
                            type: 'string'
                        }
                    }
                });
                const content = 'na';
                const completion = parseSetup(content, 2);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('name', 'name: $1', 0, 0, 0, 2, 10, 2, {
                        documentation: ''
                    }));
                }).then(done, done);
            });

            it('Autocomplete on default value (without :)', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        'name': {
                            type: 'string',
                            default: 'yaml'
                        }
                    }
                });
                const content = 'name';
                const completion = parseSetup(content, 10);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('name', 'name: ${1:yaml}', 0, 0, 0, 4, 10, 2, {
                        documentation: ''
                    }));
                }).then(done, done);
            });

            it('Autocomplete on default value (without value content)', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        'name': {
                            type: 'string',
                            default: 'yaml'
                        }
                    }
                });
                const content = 'name: ';
                const completion = parseSetup(content, 12);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('yaml', 'yaml', 0, 6, 0, 6, 12, 2, {
                        detail: 'Default value'
                    }));
                }).then(done, done);
            });

            it('Autocomplete on default value (with value content)', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        'name': {
                            type: 'string',
                            default: 'yaml'
                        }
                    }
                });
                const content = 'name: ya';
                const completion = parseSetup(content, 15);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('yaml', 'yaml', 0, 6, 0, 8, 12, 2, {
                        detail: 'Default value'
                    }));
                }).then(done, done);
            });

            it('Autocomplete on boolean value (without value content)', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        'yaml': {
                            type: 'boolean'
                        }
                    }
                });
                const content = 'yaml: ';
                const completion = parseSetup(content, 11);
                completion.then(function (result) {
                    assert.equal(result.items.length, 2);
                    assert.deepEqual(result.items[0], createExpectedCompletion('true', 'true', 0, 6, 0, 6, 12, 2, {
                        documentation: ''
                    }));
                    assert.deepEqual(result.items[1], createExpectedCompletion('false', 'false', 0, 6, 0, 6, 12, 2, {
                        documentation: ''
                    }));
                }).then(done, done);
            });

            it('Autocomplete on boolean value (with value content)', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        'yaml': {
                            type: 'boolean'
                        }
                    }
                });
                const content = 'yaml: fal';
                const completion = parseSetup(content, 11);
                completion.then(function (result) {
                    assert.equal(result.items.length, 2);
                    assert.deepEqual(result.items[0], createExpectedCompletion('true', 'true', 0, 6, 0, 9, 12, 2, {
                        documentation: ''
                    }));
                    assert.deepEqual(result.items[1], createExpectedCompletion('false', 'false', 0, 6, 0, 9, 12, 2, {
                        documentation: ''
                    }));
                }).then(done, done);
            });

            it('Autocomplete on number value (without value content)', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        'timeout': {
                            type: 'number',
                            default: 60000
                        }
                    }
                });
                const content = 'timeout: ';
                const completion = parseSetup(content, 9);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('60000', '60000', 0, 9, 0, 9, 12, 2, {
                        detail: 'Default value'
                    }));
                }).then(done, done);
            });

            it('Autocomplete on number value (with value content)', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        'timeout': {
                            type: 'number',
                            default: 60000
                        }
                    }
                });
                const content = 'timeout: 6';
                const completion = parseSetup(content, 10);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('60000', '60000', 0, 9, 0, 10, 12, 2, {
                        detail: 'Default value'
                    }));
                }).then(done, done);
            });

            it('Autocomplete key in middle of file', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        'scripts': {
                            type: 'object',
                            properties: {
                                'sample': {
                                    type: 'string',
                                    enum: [
                                        'test'
                                    ]
                                }
                            }
                        }
                    }
                });
                const content = 'scripts:\n  sample';
                const completion = parseSetup(content, 11);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('sample', 'sample: ${1:test}', 1, 2, 1, 8, 10, 2, {
                        documentation: ''
                    }));
                }).then(done, done);
            });

            it('Autocomplete key with default value in middle of file', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        'scripts': {
                            type: 'object',
                            properties: {
                                'sample': {
                                    type: 'string',
                                    default: 'test'
                                }
                            }
                        }
                    }
                });
                const content = 'scripts:\n  sam';
                const completion = parseSetup(content, 11);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('sample', 'sample: ${1:test}', 1, 2, 1, 5, 10, 2, {
                        documentation: ''
                    }));
                }).then(done, done);
            });


            it('Autocomplete second key in middle of file', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        'scripts': {
                            type: 'object',
                            properties: {
                                'sample': {
                                    type: 'string',
                                    enum: [
                                        'test'
                                    ]
                                },
                                'myOtherSample': {
                                    type: 'string',
                                    enum: [
                                        'test'
                                    ]
                                }
                            }
                        }
                    }
                });
                const content = 'scripts:\n  sample: test\n  myOther';
                const completion = parseSetup(content, 31);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('myOtherSample', 'myOtherSample: ${1:test}', 2, 2, 2, 9, 10, 2, {
                        documentation: ''
                    }));
                }).then(done, done);
            });

            it('Autocomplete does not happen right after key object', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        'timeout': {
                            type: 'number',
                            default: 60000
                        }
                    }
                });
                const content = 'timeout:';
                const completion = parseSetup(content, 9);
                completion.then(function (result) {
                    assert.equal(result.items.length, 0);
                }).then(done, done);
            });

            it('Autocomplete does not happen right after : under an object', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        'scripts': {
                            type: 'object',
                            properties: {
                                'sample': {
                                    type: 'string',
                                    enum: [
                                        'test'
                                    ]
                                },
                                'myOtherSample': {
                                    type: 'string',
                                    enum: [
                                        'test'
                                    ]
                                }
                            }
                        }
                    }
                });
                const content = 'scripts:\n  sample:';
                const completion = parseSetup(content, 21);
                completion.then(function (result) {
                    assert.equal(result.items.length, 0);
                }).then(done, done);
            });

            it('Autocomplete on multi yaml documents in a single file on root', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        'timeout': {
                            type: 'number',
                            default: 60000
                        }
                    }
                });
                const content = '---\ntimeout: 10\n...\n---\n...';
                const completion = parseSetup(content, 28);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('timeout', 'timeout: ${1:60000}', 4, 0, 4, 3, 10, 2, {
                        documentation: ''
                    }));
                }).then(done, done);
            });

            it('Autocomplete on multi yaml documents in a single file on scalar', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        'timeout': {
                            type: 'number',
                            default: 60000
                        }
                    }
                });
                const content = '---\ntimeout: 10\n...\n---\ntime: \n...';
                const completion = parseSetup(content, 26);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('timeout', 'timeout: ${1:60000}', 4, 0, 4, 4, 10, 2, {
                        documentation: ''
                    }));
                }).then(done, done);
            });

            it('Autocompletion has no results on value when they are not available', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        'time': {
                            type: 'string'
                        }
                    }
                });
                const content = 'time: ';
                const completion = parseSetup(content, 6);
                completion.then(function (result) {
                    assert.equal(result.items.length, 0);
                }).then(done, done);
            });

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
                languageService.addSchema(SCHEMA_ID, schema);
                const content = 'kind: ';
                const validator = parseSetup(content, 6);
                validator.then(function (result) {
                    assert.equal(result.items.length, 4);
                    assert.deepEqual(result.items[0], createExpectedCompletion('ImageBuild', 'ImageBuild', 0, 6, 0, 6, 12, 2, {
                        documentation: undefined
                    }));
                    assert.deepEqual(result.items[1], createExpectedCompletion('ImageBuilder', 'ImageBuilder', 0, 6, 0, 6, 12, 2, {
                        documentation: undefined
                    }));
                    assert.deepEqual(result.items[2], createExpectedCompletion('ImageStream', 'ImageStream', 0, 6, 0, 6, 12, 2, {
                        documentation: undefined
                    }));
                    assert.deepEqual(result.items[3], createExpectedCompletion('ImageStreamBuilder', 'ImageStreamBuilder', 0, 6, 0, 6, 12, 2, {
                        documentation: undefined
                    }));
                }).then(done, done);
            });

            it('Insert required attributes at correct level', done => {
                const schema = require(path.join(__dirname, './fixtures/testRequiredProperties.json'));
                languageService.addSchema(SCHEMA_ID, schema);
                const content = '- top:\n    prop1: demo\n- ';
                const completion = parseSetup(content, content.length);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('top', 'top:\n  \tprop1: $1', 2, 2, 2, 2, 10, 2, {
                        documentation: ''
                    }));
                }).then(done, done);
            });

            it('Insert required attributes at correct level even on first element', done => {
                const schema = require(path.join(__dirname, './fixtures/testRequiredProperties.json'));
                languageService.addSchema(SCHEMA_ID, schema);
                const content = '- ';
                const completion = parseSetup(content, content.length);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('top', 'top:\n  \tprop1: $1', 0, 2, 0, 2, 10, 2, {
                        documentation: ''
                    }));
                }).then(done, done);
            });

            it('Provide the 3 types when none provided', done => {
                const schema = require(path.join(__dirname, './fixtures/testArrayMaxProperties.json'));
                languageService.addSchema(SCHEMA_ID, schema);
                const content = '- ';
                const completion = parseSetup(content, content.length);
                completion.then(function (result) {
                    assert.equal(result.items.length, 3);
                    assert.deepEqual(result.items[0], createExpectedCompletion('prop1', 'prop1: $1', 0, 2, 0, 2, 10, 2, {
                        documentation: ''
                    }));
                    assert.deepEqual(result.items[1], createExpectedCompletion('prop2', 'prop2: $1', 0, 2, 0, 2, 10, 2, {
                        documentation: ''
                    }));
                    assert.deepEqual(result.items[2], createExpectedCompletion('prop3', 'prop3: $1', 0, 2, 0, 2, 10, 2, {
                        documentation: ''
                    }));
                }).then(done, done);
            });

            it('Provide the 3 types when one is provided', done => {
                const schema = require(path.join(__dirname, './fixtures/testArrayMaxProperties.json'));
                languageService.addSchema(SCHEMA_ID, schema);
                const content = '- prop1:\n  ';
                const completion = parseSetup(content, content.length);
                completion.then(function (result) {
                    assert.equal(result.items.length, 2);
                    assert.deepEqual(result.items[0], createExpectedCompletion('prop2', 'prop2: $1', 1, 2, 1, 2, 10, 2, {
                        documentation: ''
                    }));
                    assert.deepEqual(result.items[1], createExpectedCompletion('prop3', 'prop3: $1', 1, 2, 1, 2, 10, 2, {
                        documentation: ''
                    }));
                }).then(done, done);
            });

            it('Provide no completion when maxProperties reached', done => {
                const schema = require(path.join(__dirname, './fixtures/testArrayMaxProperties.json'));
                languageService.addSchema(SCHEMA_ID, schema);
                const content = '- prop1:\n  prop2:\n  ';
                const completion = parseSetup(content, content.length);
                completion.then(function (result) {
                    assert.equal(result.items.length, 0);
                }).then(done, done);
            });
        });

        describe('Array Specific Tests', function () {
            it('Array autocomplete without word and extra space', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        authors: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    name: {
                                        type: 'string'
                                    }
                                }
                            }
                        }
                    }
                });
                const content = 'authors:\n  - ';
                const completion = parseSetup(content, 14);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('name', 'name: $1', 1, 4, 1, 4, 10, 2, {
                        documentation: ''
                    }));
                }).then(done, done);
            });

            it('Array autocomplete without word and autocompletion beside -', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        authors: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    name: {
                                        type: 'string'
                                    }
                                }
                            }
                        }
                    }
                });
                const content = 'authors:\n  -';
                const completion = parseSetup(content, 13);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('- (array item)', '- $1', 1, 2, 1, 3, 9, 2, {
                        documentation: 'Create an item of an array'
                    }));
                }).then(done, done);
            });

            it('Array autocomplete without word on space before array symbol', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        authors: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    name: {
                                        type: 'string'
                                    },
                                    email: {
                                        type: 'string'
                                    }
                                }
                            }
                        }
                    }
                });
                const content = 'authors:\n  - name: test\n  ';
                const completion = parseSetup(content, 24);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('- (array item)', '- $1', 2, 0, 2, 0, 9, 2, {
                        documentation: 'Create an item of an array'
                    }));
                }).then(done, done);
            });

            it('Array autocomplete with letter', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        authors: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    name: {
                                        type: 'string'
                                    }
                                }
                            }
                        }
                    }
                });
                const content = 'authors:\n  - n';
                const completion = parseSetup(content, 14);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('name', 'name: $1', 1, 4, 1, 5, 10, 2, {
                        documentation: ''
                    }));
                }).then(done, done);
            });

            it('Array autocomplete without word (second item)', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        authors: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    name: {
                                        type: 'string'
                                    },
                                    email: {
                                        type: 'string'
                                    }
                                }
                            }
                        }
                    }
                });
                const content = 'authors:\n  - name: test\n    ';
                const completion = parseSetup(content, 32);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('email', 'email: $1', 2, 4, 2, 4, 10, 2, {
                        documentation: ''
                    }));
                }).then(done, done);
            });

            it('Array autocomplete with letter (second item)', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        authors: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    name: {
                                        type: 'string'
                                    },
                                    email: {
                                        type: 'string'
                                    }
                                }
                            }
                        }
                    }
                });
                const content = 'authors:\n  - name: test\n    e';
                const completion = parseSetup(content, 27);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('email', 'email: $1', 2, 3, 2, 3, 10, 2, {
                        documentation: ''
                    }));
                }).then(done, done);
            });

            it('Autocompletion after array', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        authors: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    name: {
                                        type: 'string'
                                    },
                                    email: {
                                        type: 'string'
                                    }
                                }
                            }
                        },
                        load: {
                            type: 'boolean'
                        }
                    }
                });
                const content = 'authors:\n  - name: test\n';
                const completion = parseSetup(content, 24);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('load', 'load: $1', 2, 0, 2, 0, 10, 2, {
                        documentation: ''
                    }));
                }).then(done, done);
            });

            it('Autocompletion after array with depth', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        archive: {
                            type: 'object',
                            properties: {
                                exclude: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            name: {
                                                type: 'string',
                                                default: 'test'
                                            }
                                        }
                                    }
                                },
                            }
                        }
                    }
                });
                const content = 'archive:\n  exclude:\n  - nam\n';
                const completion = parseSetup(content, 29);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('- (array item)', '- name: ${1:test}', 3, 0, 3, 0, 9, 2, {
                        documentation: 'Create an item of an array'
                    }));
                }).then(done, done);
            });

            it('Array of enum autocomplete without word on array symbol', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        references: {
                            type: 'array',
                            items: {
                                enum: [
                                    'Test'
                                ]
                            }
                        }
                    }
                });
                const content = 'references:\n  -';
                const completion = parseSetup(content, 29);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('Test', 'Test', 1, 2, 1, 3, 12, 2, {
                        documentation: undefined
                    }));
                }).then(done, done);
            });

            it('Array of enum autocomplete without word', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        references: {
                            type: 'array',
                            items: {
                                enum: [
                                    'Test'
                                ]
                            }
                        }
                    }
                });
                const content = 'references:\n  - ';
                const completion = parseSetup(content, 30);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('Test', 'Test', 1, 4, 1, 4, 12, 2, {
                        documentation: undefined
                    }));
                }).then(done, done);
            });

            it('Array of enum autocomplete with letter', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        references: {
                            type: 'array',
                            items: {
                                enum: [
                                    'Test'
                                ]
                            }
                        }
                    }
                });
                const content = 'references:\n  - T';
                const completion = parseSetup(content, 31);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('Test', 'Test', 1, 4, 1, 5, 12, 2, {
                        documentation: undefined
                    }));
                }).then(done, done);
            });
        });

        describe('JSON Schema 7 Specific Tests', function () {
            it('Autocomplete works with examples', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        foodItems: {
                            type: 'string',
                            examples: [
                                'Apple',
                                'Banana'
                            ],
                            default: 'Carrot'
                        }
                    }
                });
                const content = 'foodItems: ';
                const completion = parseSetup(content, 12);
                completion.then(function (result) {
                    assert.equal(result.items.length, 3);
                    assert.deepEqual(result.items[0], createExpectedCompletion('Carrot', 'Carrot', 0, 11, 0, 11, 12, 2, {
                        detail: 'Default value'
                    }));
                    assert.deepEqual(result.items[1], createExpectedCompletion('Apple', 'Apple', 0, 11, 0, 11, 12, 2, {}));
                    assert.deepEqual(result.items[2], createExpectedCompletion('Banana', 'Banana', 0, 11, 0, 11, 12, 2, {}));
                }).then(done, done);
            });

            it('Autocomplete works with const', done => {
                languageService.addSchema(SCHEMA_ID, {
                    type: 'object',
                    properties: {
                        fruit: {
                            const: 'Apple'
                        }
                    }
                });
                const content = 'fruit: App';
                const completion = parseSetup(content, 9);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('Apple', 'Apple', 0, 7, 0, 10, 12, 2, {
                        documentation: undefined
                    }));
                }).then(done, done);
            });
        });

        describe('Indentation Specific Tests', function () {
            it('Indent should be considered with position relative to slash', done => {
                const schema = require(path.join(__dirname, './fixtures/testArrayIndent.json'));
                languageService.addSchema(SCHEMA_ID, schema);
                const content = 'install:\n  - he';
                const completion = parseSetup(content, content.lastIndexOf('he') + 2);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('helm', 'helm:\n  \tname: $1', 1, 4, 1, 6, 10, 2, {
                        documentation: ''
                    }));
                }).then(done, done);
            });

            it('Large indent should be considered with position relative to slash', done => {
                const schema = require(path.join(__dirname, './fixtures/testArrayIndent.json'));
                languageService.addSchema(SCHEMA_ID, schema);
                const content = 'install:\n -            he';
                const completion = parseSetup(content, content.lastIndexOf('he') + 2);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('helm', 'helm:\n             \tname: $1', 1, 14, 1, 16, 10, 2, {
                        documentation: ''
                    }));
                }).then(done, done);
            });

            it('Tab indent should be considered with position relative to slash', done => {
                const schema = require(path.join(__dirname, './fixtures/testArrayIndent.json'));
                languageService.addSchema(SCHEMA_ID, schema);
                const content = 'install:\n -\t             he';
                const completion = parseSetup(content, content.lastIndexOf('he') + 2);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                    assert.deepEqual(result.items[0], createExpectedCompletion('helm', 'helm:\n \t             \tname: $1', 1, 16, 1, 18, 10, 2, {
                        documentation: ''
                    }));
                }).then(done, done);
            });
        });
    });
});
