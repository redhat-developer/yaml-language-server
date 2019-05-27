/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createJSONLanguageService, setupTextDocument, configureLanguageService}  from './utils/testHelper';
import { parse as parseYAML } from '../src/languageservice/parser/yamlParser07';
import { ServiceSetup } from './utils/serviceSetup';
import { createExpectedError } from './utils/verifyError';
var assert = require('assert');

let languageSettingsSetup = new ServiceSetup()
	.withValidate()
let languageService = configureLanguageService(
	languageSettingsSetup.languageSettings
);

const jsonLanguageService = createJSONLanguageService();
jsonLanguageService.configure({
    validate: true
})

// Defines a Mocha test suite to group tests of similar kind together
suite("Custom Tag tests Tests", () => {

    function parseSetup(content: string, customTags: string[]){
        let testTextDocument = setupTextDocument(content);
        let yDoc = parseYAML(testTextDocument.getText(), customTags);
        return languageService.doValidation(jsonLanguageService, testTextDocument, yDoc);
    }
    
    describe('Test that validation does not throw errors', function(){
        it('Custom Tags without type not specified', (done) => {
            let content = `scalar_test: !Test test_example`;
            let validator = parseSetup(content, ["!Test"]);
            validator.then(function(result){
                assert.equal(result.length, 0);
            }).then(done, done);
        });

        it('Custom Tags with one type', (done) => {
            let content = `resolvers: !Ref\n  - test`;
            let validator = parseSetup(content, ["!Ref sequence"]);
            validator.then(function(result){
                assert.equal(result.length, 0);
            }).then(done, done);
        });

        it('Custom Tags with multiple types', (done) => {
            let content = `resolvers: !Ref\n  - test`;
            let validator = parseSetup(content, ["!Ref sequence", "!Ref mapping", "!Ref scalar"]);
            validator.then(function(result){
                assert.equal(result.length, 0);
            }).then(done, done);
        });

        it('Allow multiple different custom tag types with different use', (done) => {
            let content = "!test\nhello: !test\n  world";
            let validator = parseSetup(content, ["!test scalar", "!test mapping"]);
            validator.then(function(result){
                assert.equal(result.length, 0);
            }).then(done, done);
        });

        it('Allow multiple different custom tag types with multiple different uses', (done) => {
            let content = "!test\nhello: !test\n  world\nsequence: !ref\n  - item1";
            let validator = parseSetup(content, ["!test scalar", "!test mapping", "!ref sequence", "!ref mapping"]);
            validator.then(function(result){
                assert.equal(result.length, 0);
            }).then(done, done);
        });
    });

    describe('Test that validation does throw errors', function(){ 
        it('Error when custom tag is not available', (done) => {
            let content = "!test";
            let validator = parseSetup(content, []);
            validator.then(function(result){
                assert.equal(result.length, 1);

                // TODO fix the ranges here
                assert.equal(
                    result[0],
                    createExpectedError("unknown tag <!test>", 0, 0, 0, 0)
                )
            }).then(done, done);
        });
    });
});