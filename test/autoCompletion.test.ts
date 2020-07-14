/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TextDocument } from 'vscode-languageserver';
import { getLanguageService } from '../src/languageservice/yamlLanguageService';
import { schemaRequestService, workspaceContext, SCHEMA_ID, setupSchemaIDTextDocument } from './utils/testHelper';
import assert = require('assert');
import path = require('path');

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
                    assert.equal(result.items[0].label, 'name');
                    assert.equal(result.items[0].insertText, 'name: $1');
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
                    assert.equal(result.items[0].label, 'name');
                    assert.equal(result.items[0].insertText, 'name: $1');
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
                    assert.equal(result.items[0].label, 'name');
                    assert.equal(result.items[0].insertText, 'name: ${1:yaml}');
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
                    assert.equal(result.items[0].label, 'yaml');
                    assert.equal(result.items[0].insertText, 'yaml');
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
                    assert.equal(result.items[0].label, 'yaml');
                    assert.equal(result.items[0].insertText, 'yaml');
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
                    assert.equal(result.items[0].label, 'true');
                    assert.equal(result.items[0].insertText, 'true');
                    assert.equal(result.items[1].label, 'false');
                    assert.equal(result.items[1].insertText, 'false');
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
                    assert.equal(result.items[0].label, 'true');
                    assert.equal(result.items[0].insertText, 'true');
                    assert.equal(result.items[1].label, 'false');
                    assert.equal(result.items[1].insertText, 'false');
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
                    assert.equal(result.items[0].label, 60000);
                    assert.equal(result.items[0].insertText, 60000);
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
                    assert.equal(result.items[0].label, 60000);
                    assert.equal(result.items[0].insertText, 60000);
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
                    assert.equal(result.items[0].label, 'sample');
                    assert.equal(result.items[0].insertText, 'sample: ${1:test}');
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
                    assert.equal(result.items[0].label, 'sample');
                    assert.equal(result.items[0].insertText, 'sample: ${1:test}');
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
                    assert.equal(result.items[0].label, 'myOtherSample');
                    assert.equal(result.items[0].insertText, 'myOtherSample: ${1:test}');
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
                    assert.equal(result.items[0].label, 'timeout');
                    assert.equal(result.items[0].insertText, 'timeout: ${1:60000}');
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
                    assert.equal(result.items[0].label, 'timeout');
                    assert.equal(result.items[0].insertText, 'timeout: ${1:60000}');
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
                    assert.equal(result.items[0].label, 'ImageBuild');
                    assert.equal(result.items[0].insertText, 'ImageBuild');
                    assert.equal(result.items[1].label, 'ImageBuilder');
                    assert.equal(result.items[1].insertText, 'ImageBuilder');
                    assert.equal(result.items[2].label, 'ImageStream');
                    assert.equal(result.items[2].insertText, 'ImageStream');
                    assert.equal(result.items[3].label, 'ImageStreamBuilder');
                    assert.equal(result.items[3].insertText, 'ImageStreamBuilder');
                }).then(done, done);
            });

            it('Insert required attributes at correct level', done => {
                const schema = require(path.join(__dirname, './fixtures/testRequiredProperties.json'));
                languageService.addSchema(SCHEMA_ID, schema);
                const content = '- top:\n    prop1: demo\n- ';
                const completion = parseSetup(content, content.length);
                completion.then(function (result) {
                    assert.equal(result.items[0].label, 'top');
                    assert.equal(result.items[0].insertText, 'top:\n  \tprop1: $1');
                }).then(done, done);
            });

            it('Insert required attributes at correct level even on first element', done => {
                const schema = require(path.join(__dirname, './fixtures/testRequiredProperties.json'));
                languageService.addSchema(SCHEMA_ID, schema);
                const content = '- ';
                const completion = parseSetup(content, content.length);
                completion.then(function (result) {
                    assert.equal(result.items[0].label, 'top');
                    assert.equal(result.items[0].insertText, 'top:\n  \tprop1: $1');
                }).then(done, done);
            });

            it('Provide the 3 types when none provided', done => {
                const schema = require(path.join(__dirname, './fixtures/testArrayMaxProperties.json'));
                languageService.addSchema(SCHEMA_ID, schema);
                const content = '- ';
                const completion = parseSetup(content, content.length);
                completion.then(function (result) {
                    assert.equal(result.items.length, 3);
                    assert.equal(result.items[0].label, 'prop1');
                    assert.equal(result.items[0].insertText, 'prop1: $1');
                    assert.equal(result.items[1].label, 'prop2');
                    assert.equal(result.items[1].insertText, 'prop2: $1');
                    assert.equal(result.items[2].label, 'prop3');
                    assert.equal(result.items[2].insertText, 'prop3: $1');
                }).then(done, done);
            });

            it('Provide the 3 types when one is provided', done => {
                const schema = require(path.join(__dirname, './fixtures/testArrayMaxProperties.json'));
                languageService.addSchema(SCHEMA_ID, schema);
                const content = '- prop1:\n  ';
                const completion = parseSetup(content, content.length);
                completion.then(function (result) {
                    assert.equal(result.items.length, 2);
                    assert.equal(result.items[0].label, 'prop2');
                    assert.equal(result.items[0].insertText, 'prop2: $1');
                    assert.equal(result.items[1].label, 'prop3');
                    assert.equal(result.items[1].insertText, 'prop3: $1');
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
                    assert.equal(result.items[0].label, 'name');
                    assert.equal(result.items[0].insertText, 'name: $1');
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
                    assert.equal(result.items[0].label, '- (array item)');
                    assert.equal(result.items[0].insertText, '- $1');
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
                    assert.equal(result.items[0].label, '- (array item)');
                    assert.equal(result.items[0].insertText, '- $1');
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
                    assert.equal(result.items[0].label, 'name');
                    assert.equal(result.items[0].insertText, 'name: $1');
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
                    assert.equal(result.items[0].label, 'email');
                    assert.equal(result.items[0].insertText, 'email: $1');
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
                    assert.equal(result.items[0].label, 'email');
                    assert.equal(result.items[0].insertText, 'email: $1');
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
                    assert.equal(result.items[0].label, 'load');
                    assert.equal(result.items[0].insertText, 'load: $1');
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
                    assert.equal(result.items[0].label, '- (array item)');
                    assert.equal(result.items[0].insertText, '- name: ${1:test}');
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
                    assert.equal(result.items[0].label, 'Test');
                    assert.equal(result.items[0].insertText, 'Test');
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
                    assert.equal(result.items[0].label, 'Test');
                    assert.equal(result.items[0].insertText, 'Test');
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
                    assert.equal(result.items[0].label, 'Test');
                    assert.equal(result.items[0].insertText, 'Test');
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
                    assert.equal(result.items[0].label, 'Carrot');
                    assert.equal(result.items[0].insertText, 'Carrot');
                    assert.equal(result.items[1].label, 'Apple');
                    assert.equal(result.items[1].insertText, 'Apple');
                    assert.equal(result.items[2].label, 'Banana');
                    assert.equal(result.items[2].insertText, 'Banana');
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
                    assert.equal(result.items[0].label, 'Apple');
                    assert.equal(result.items[0].insertText, 'Apple');
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
                    assert.equal(result.items[0].insertText, 'helm:\n  \tname: $1');
                }).then(done, done);
            });

            it('Large indent should be considered with position relative to slash', done => {
                const schema = require(path.join(__dirname, './fixtures/testArrayIndent.json'));
                languageService.addSchema(SCHEMA_ID, schema);
                const content = 'install:\n -            he';
                const completion = parseSetup(content, content.lastIndexOf('he') + 2);
                completion.then(function (result) {
                    assert.equal(result.items[0].insertText, 'helm:\n             \tname: $1');
                }).then(done, done);
            });

            it('Tab indent should be considered with position relative to slash', done => {
                const schema = require(path.join(__dirname, './fixtures/testArrayIndent.json'));
                languageService.addSchema(SCHEMA_ID, schema);
                const content = 'install:\n -\t             he';
                const completion = parseSetup(content, content.lastIndexOf('he') + 2);
                completion.then(function (result) {
                    assert.equal(result.items[0].insertText, 'helm:\n \t             \tname: $1');
                }).then(done, done);
            });
        });
    });
});
