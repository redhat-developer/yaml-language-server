/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createJSONLanguageService, setupTextDocument } from './testHelper';
import { parse } from '../src/languageservice/parser/yamlParser';
import { ASTNode } from 'vscode-json-languageservice';
import { PropertyASTNodeImpl, ArrayASTNodeImpl, ObjectASTNodeImpl, StringASTNodeImpl } from '../src/languageservice/parser/jsonParser2';
var assert = require("assert");


suite("YAML Parser Tests", () => {
	describe("YAML Parser", function() {
		it("Empty YAML", () => {
            const jsonLanguageService = createJSONLanguageService();
            const text = '';
            const parsedResult = parse(jsonLanguageService, text);
            assert.equal(parsedResult.documents.length, 0);
        });
        
        it("String", () => {
            const jsonLanguageService = createJSONLanguageService();
            const text = 'test';
            const parsedResult = parse(jsonLanguageService, text);
            const firstDocumentRoot = parsedResult.documents[0].root as ASTNode;

            const s = `{
                "key": "value"
            }`
            const textDoc = setupTextDocument(s);
            const jsonDoc = jsonLanguageService.parseJSONDocument(textDoc);
            console.log(compare(jsonDoc["root"], firstDocumentRoot));

            assert.equal(firstDocumentRoot.children.length, 0);
            assert.equal(firstDocumentRoot.type, 'string');
            assert.equal(firstDocumentRoot.offset, 0);
            assert.equal(firstDocumentRoot.length, 4);
        });
        
        it("Object", () => {
            const jsonLanguageService = createJSONLanguageService();
            const text = 'key: value';
            const parsedResult = parse(jsonLanguageService, text);
            assert.equal(parsedResult.documents.length, 1);

            const s = `{ "key": "value" }`
            const textDoc = setupTextDocument(s);
            const jsonDoc = jsonLanguageService.parseJSONDocument(textDoc);
            const firstDocumentRoot = parsedResult.documents[0].root as ASTNode;
            assert.equal(compare(jsonDoc["root"], firstDocumentRoot), true);

            const propertyNode = firstDocumentRoot.children[0] as PropertyASTNodeImpl;
            assert.equal(compare(jsonDoc["root"]["children"][0], propertyNode), true);

            const keyNode = propertyNode.keyNode;
            assert.equal(compare(jsonDoc["root"]["children"][0]["keyNode"], keyNode), true);

            const valueNode = propertyNode.valueNode;
            assert.equal(compare(jsonDoc["root"]["children"][0]["valueNode"], valueNode), true);
        });
        
        it("Array", () => {
            const jsonLanguageService = createJSONLanguageService();
            const text = 'key:\n  - test';
            const parsedResult = parse(jsonLanguageService, text);
            assert.equal(parsedResult.documents.length, 1);

            const s = `{ "key": [ "test" ] }`
            const textDoc = setupTextDocument(s);
            const jsonDoc = jsonLanguageService.parseJSONDocument(textDoc);
            const firstDocumentRoot = parsedResult.documents[0].root as ObjectASTNodeImpl;
            assert.equal(compare(jsonDoc["root"], firstDocumentRoot), true);

            const propertyNode = firstDocumentRoot.children[0] as PropertyASTNodeImpl;
            assert.equal(compare(jsonDoc["root"]["children"][0], propertyNode), true);

            const keyNode = propertyNode.keyNode;
            assert.equal(compare(jsonDoc["root"]["children"][0]["keyNode"], keyNode), true);

            const valueNode = propertyNode.valueNode as ArrayASTNodeImpl;
            assert.equal(compare(jsonDoc["root"]["children"][0]["valueNode"], valueNode), true);

            const firstItem = valueNode.items[0] as StringASTNodeImpl;
            assert.equal(compare(jsonDoc["root"]["children"][0]["valueNode"]["items"][0], firstItem), true);
        });
        
        it("Unfinished Array", () => {
            const jsonLanguageService = createJSONLanguageService();
            const text = 'authors:\n  - ';
            const parsedResult = parse(jsonLanguageService, text);
            assert.equal(parsedResult.documents.length, 1);

            const s = `{ "authors": [ ] }`
            const textDoc = setupTextDocument(s);
            const jsonDoc = jsonLanguageService.parseJSONDocument(textDoc);
            const firstDocumentRoot = parsedResult.documents[0].root as ObjectASTNodeImpl;
            assert.equal(compare(jsonDoc["root"], firstDocumentRoot), true);

            const propertyNode = firstDocumentRoot.children[0] as PropertyASTNodeImpl;
            assert.equal(compare(jsonDoc["root"]["children"][0], propertyNode), true);

            const keyNode = propertyNode.keyNode;
            assert.equal(compare(jsonDoc["root"]["children"][0]["keyNode"], keyNode), true);

            const valueNode = propertyNode.valueNode as ArrayASTNodeImpl;
            assert.equal(compare(jsonDoc["root"]["children"][0]["valueNode"], valueNode), true);

            const firstItem = valueNode.items;
            console.log(valueNode);
            assert.equal(compare(jsonDoc["root"]["children"][0]["valueNode"]["items"], firstItem), true);
		});
	});
});

function compare(r1, r2) {
    if (r1.children && r2.children && r1.children.length !== r2.children.length) {
        return false;
    }
    if (r1.type !== r2.type) {
        return false;
    }
    if (r1.value !== r2.value) {
        return false;
    }
    return true;
}