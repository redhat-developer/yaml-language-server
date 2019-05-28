/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createJSONLanguageService, configureLanguageService, setupTextDocument}  from './utils/testHelper';
import { createExpectedError } from './utils/verifyError';
import { parse as parseYAML } from '../src/languageservice/parser/yamlParser07';
import { ServiceSetup } from './utils/serviceSetup';
import { StringTypeError, BooleanTypeError, ArrayTypeError, ObjectTypeError, IncludeWithoutValueError, ColonMissingError, BlockMappingEntryError } from './utils/errorMessages';
const assert = require('assert');

const uri = 'http://json.schemastore.org/bowerrc';
const fileMatch = ['*.yml', '*.yaml'];
const languageSettingsSetup = new ServiceSetup()
    .withValidate()
    .withCustomTags(['!Test', '!Ref sequence'])
    .withSchemaFileMatch({ uri, fileMatch: fileMatch });
const languageService = configureLanguageService(
    languageSettingsSetup.languageSettings
);
const jsonLanguageService = createJSONLanguageService();
jsonLanguageService.configure({
    schemas: [{
        uri,
        fileMatch
    }],
    validate: true
});

// Defines a Mocha test suite to group tests of similar kind together
suite('Validation Tests', () => {

    // Tests for validator
    describe('Validation', function () {

        function parseSetup(content: string){
            const testTextDocument = setupTextDocument(content);
            const yDoc = parseYAML(testTextDocument.getText(), languageSettingsSetup.languageSettings.customTags);
            return languageService.doValidation(jsonLanguageService, testTextDocument, yDoc);
        }

        //Validating basic nodes
        describe('Test that validation does not throw errors', function (){

            it('Basic test', done => {
                const content = 'analytics: true';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 0);
                }).then(done, done);
            });

            it('Test that boolean value without quotations is valid', done => {
                const content = 'analytics: no';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 0);
                }).then(done, done);
            });

            it('Test that boolean is valid when inside strings', done => {
                const content = 'cwd: "no"';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 0);
                }).then(done, done);
            });

            it('Basic test', done => {
                const content = 'analytics: true';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 0);
                }).then(done, done);
            });

            it('Basic test on nodes with children', done => {
                const content = 'scripts:\n  preinstall: test1\n  postinstall: test2';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 0);
                }).then(done, done);
            });

            it('Advanced test on nodes with children', done => {
                const content = 'analytics: true\ncwd: this\nscripts:\n  preinstall: test1\n  postinstall: test2';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 0);
                }).then(done, done);
            });

            it('Type string validates under children', done => {
                const content = 'registry:\n  register: file://test_url';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 0);
                }).then(done, done);
            });

            it('Include with value should not error', done => {
                const content = 'customize: !include customize.yaml';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 0);
                }).then(done, done);
            });

            it('Null scalar value should be treated as string', done => {
                const content = 'cwd: Null';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 0);
                }).then(done, done);
            });

            it('Anchor should not not error', done => {
                const content = 'default: &DEFAULT\n  name: Anchor\nanchor_test:\n  <<: *DEFAULT';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 0);
                }).then(done, done);
            });

            it('Anchor with multiple references should not not error', done => {
                const content = 'default: &DEFAULT\n  name: Anchor\nanchor_test:\n  <<: *DEFAULT\nanchor_test2:\n  <<: *DEFAULT';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 0);
                }).then(done, done);
            });

            it('Multiple Anchor in array of references should not not error', done => {
                const content = 'default: &DEFAULT\n  name: Anchor\ncustomname: &CUSTOMNAME\n  custom_name: Anchor\nanchor_test:\n  <<: [*DEFAULT, *CUSTOMNAME]';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 0);
                }).then(done, done);
            });

            it('Multiple Anchors being referenced in same level at same time', done => {
                const content = 'default: &DEFAULT\n  name: Anchor\ncustomname: &CUSTOMNAME\n  custom_name: Anchor\nanchor_test:\n  <<: *DEFAULT\n  <<: *CUSTOMNAME\n';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 0);
                }).then(done, done);
            });

            it('Custom Tags without type', done => {
                const content = 'analytics: !Test false';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 0);
                }).then(done, done);
            });

            it('Custom Tags with type', done => {
                const content = 'resolvers: !Ref\n  - test';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 0);
                }).then(done, done);
            });

            describe('Type tests', function (){

                it('Type String does not error on valid node', done => {
                    const content = 'cwd: this';
                    const validator = parseSetup(content);
                    validator.then(function (result){
                        assert.equal(result.length, 0);
                    }).then(done, done);
                });

                it('Type Boolean does not error on valid node', done => {
                    const content = 'analytics: true';
                    const validator = parseSetup(content);
                    validator.then(function (result){
                        assert.equal(result.length, 0);
                    }).then(done, done);
                });

                it('Type Number does not error on valid node', done => {
                    const content = 'timeout: 60000';
                    const validator = parseSetup(content);
                    validator.then(function (result){
                        assert.equal(result.length, 0);
                    }).then(done, done);
                });

                it('Type Object does not error on valid node', done => {
                    const content = 'registry:\n  search: file://test_url';
                    const validator = parseSetup(content);
                    validator.then(function (result){
                        assert.equal(result.length, 0);
                    }).then(done, done);
                });

                it('Type Array does not error on valid node', done => {
                    const content = 'resolvers:\n  - test\n  - test\n  - test';
                    const validator = parseSetup(content);
                    validator.then(function (result){
                        assert.equal(result.length, 0);
                    }).then(done, done);
                });

                it('Do not error when there are multiple types in schema and theyre valid', done => {
                    const content = 'license: MIT';
                    const validator = parseSetup(content);
                    validator.then(function (result){
                        assert.equal(result.length, 0);
                    }).then(done, done);
                });

            });

        });

        describe('Test that validation DOES throw errors', function (){
            it('Error when theres a finished untyped item', done => {
                const content = 'cwd: hello\nan';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 2);
                    assert.deepEqual(
                        result[0],
                        createExpectedError(BlockMappingEntryError, 1, 13, 1, 13)
                    );
                    assert.deepEqual(
                        result[1],
                        createExpectedError(ColonMissingError, 1, 13, 1, 13)
                    );
                }).then(done, done);
            });

            it('Error when theres no value for a node', done => {
                const content = 'cwd:';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 1);
                    assert.deepEqual(
                        result[0],
                        createExpectedError(StringTypeError, 0, 4, 0, 4)
                    );
                }).then(done, done);
            });

            it('Error on incorrect value type (number)', done => {
                const content = 'cwd: 100000';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 1);
                    assert.deepEqual(
                        result[0],
                        createExpectedError(StringTypeError, 0, 5, 0, 11)
                    );
                }).then(done, done);
            });

            it('Error on incorrect value type (boolean)', done => {
                const content = 'cwd: False';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 1);
                    assert.deepEqual(
                        result[0],
                        createExpectedError(StringTypeError, 0, 5, 0, 10)
                    );
                }).then(done, done);
            });

            it('Error on incorrect value type (string)', done => {
                const content = 'analytics: hello';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 1);
                    assert.deepEqual(
                        result[0],
                        createExpectedError(BooleanTypeError, 0, 11, 0, 16)
                    );
                }).then(done, done);
            });

            it('Error on incorrect value type (object)', done => {
                const content = 'scripts: test';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 1);
                    assert.deepEqual(
                        result[0],
                        createExpectedError(ObjectTypeError, 0, 9, 0, 13),
                    );
                }).then(done, done);
            });

            it('Error on incorrect value type (array)', done => {
                const content = 'resolvers: test';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 1);
                    assert.deepEqual(
                        result[0],
                        createExpectedError(ArrayTypeError, 0, 11, 0, 15)
                    );
                }).then(done, done);
            });

            it('Include without value should error', done => {
                const content = 'customize: !include';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 1);
                    assert.deepEqual(
                        result[0],
                        createExpectedError(IncludeWithoutValueError, 0, 19, 0, 19)
                    );
                }).then(done, done);
            });

            it('Test that boolean value in quotations is not interpreted as boolean i.e. it errors', done => {
                const content = 'analytics: "no"';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 1);
                    assert.deepEqual(
                        result[0],
                        createExpectedError(BooleanTypeError, 0, 11, 0, 15)
                    );
                }).then(done, done);
            });

            it('Test that boolean is invalid when no strings present and schema wants string', done => {
                const content = 'cwd: no';
                const validator = parseSetup(content);
                validator.then(function (result){
                    assert.equal(result.length, 1);
                    assert.deepEqual(
                        result[0],
                        createExpectedError(StringTypeError, 0, 5, 0, 7)
                    );
                }).then(done, done);
            });

        });
    });
});
