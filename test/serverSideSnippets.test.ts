/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TextDocument } from 'vscode-languageserver';
import { getLanguageService, SnippetContext } from '../src/languageservice/yamlLanguageService';
import { schemaRequestService, workspaceContext } from './utils/testHelper';
import { matchOffsetToDocument } from '../src/languageservice/utils/arrUtils';
import { parseFixedYAML } from '../src/languageservice/utils/completion-utils';
import { determineNodeContext } from '../src/languageservice/utils/node-contexts';
import assert = require('assert');

const languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

suite('Auto Completion Tests', () => {

    function setup(content: string) {
        return TextDocument.create('file://~/Desktop/vscode-k8s/test.yaml', 'yaml', 0, content);
    }

    function parseSetup(content: string, position) {
        const testTextDocument = setup(content);
        return languageService.doComplete(testTextDocument, testTextDocument.positionAt(position), false);
    }

    function createNode(content: string, offset: number) {
        const testTextDocument = setup(content);
        const doc = parseFixedYAML(testTextDocument, testTextDocument.positionAt(offset));
        const currentDoc = matchOffsetToDocument(offset, doc);
        return currentDoc.getNodeFromOffsetEndInclusive(offset);
    }

    describe('Determine the correct context for each scenario', function () {

        describe('Detecting OBJECT context', () => {

            it('When content is none it should be OBJECT context', () => {
                const createdNode = createNode('', 0);
                const nodeContext = determineNodeContext(createdNode);
                assert.equal(nodeContext, 'object', 'The node context was NOT an object when one was expected');
            });

            it('When key is NOT NONE AND ATTEMPTING TO AUTOCOMPLETE ON NEXT LINE it should be OBJECT context', () => {
                const createdNode = createNode('hello:\n  ', 7);
                const nodeContext = determineNodeContext(createdNode);
                assert.equal(nodeContext, 'object', 'The node context was NOT an object when one was expected');
            });

            it('When DEEP key is NOT NONE AND ATTEMPTING TO AUTOCOMPLETE ON NEXT LINE it should be OBJECT context', () => {
                const createdNode = createNode('hello:\n  hello2:\n    ', 19);
                const nodeContext = determineNodeContext(createdNode);
                assert.equal(nodeContext, 'object', 'The node context was NOT an object when one was expected');
            });
        });

        describe('Detecting SCALAR context', () => {
            it('When key is NOT NONE it should be SCALAR context', () => {
                const createdNode = createNode('hello: ', 6);
                const nodeContext = determineNodeContext(createdNode);
                assert.equal(nodeContext, 'scalar', 'The node context was NOT an scalar when one was expected');
            });
        });

        describe('Detecting ARRAY context', () => {
            it('When key is NOT NONE AND ATTEMPTING TO AUTOCOMPLETE ON NEXT LINE THAT HAS - it should be ARRAY context', () => {
                const createdNode = createNode('hello:\n- ', 7);
                const nodeContext = determineNodeContext(createdNode);
                assert.equal(nodeContext, 'array', 'The node context was NOT an array when one was expected');
            });
        });
    });

    describe('Snippets on no schema', function () {
        it('Test that all snippets are returned when you have no content', done => {
            languageService.addSnippet('test', {
                snippet: 'test_snippet',
                context: SnippetContext.object
            });
            languageService.configure({
                completion: true
            });
            const content = '';
            const completion = parseSetup(content, 0);
            completion.then(function (result) {
                assert.equal(result.items.length, 1);
            }).then(done, done);
        });

        it('Test that only scalar snippets are returned when we are in an object', done => {
            languageService.addSnippet('test', {
                snippet: 'test_snippet',
                context: SnippetContext.scalar
            });
            languageService.configure({
                completion: true
            });
            const content = 'hello: ';
            const completion = parseSetup(content, 7);
            completion.then(function (result) {
                assert.equal(result.items.length, 1);
            }).then(done, done);
        });

        it('Test that object/array snippets are returned when we are underneath an object', done => {
            languageService.addSnippet('test', {
                snippet: 'test_snippet',
                context: SnippetContext.object
            });
            languageService.configure({
                completion: true
            });
            const content = 'hello:\n  ';
            const completion = parseSetup(content, 7);
            completion.then(function (result) {
                assert.equal(result.items.length, 1);
            }).then(done, done);
        });

        it('Test that array snippets are returned when - is present in array node', done => {
            languageService.addSnippet('test', {
                snippet: 'test_snippet',
                context: SnippetContext.array
            });
            languageService.configure({
                completion: true
            });
            const content = 'hello:\n- ';
            const completion = parseSetup(content, 7);
            completion.then(function (result) {
                assert.equal(result.items.length, 1);
            }).then(done, done);
        });
    });

    describe('Snippets on basic schemas', function () {
        it('Test that snippets are returned when they match the schema', done => {
            const schema = {
                    'type': 'object',
                    'properties': {
                        'hello': {
                            'type': 'string'
                        }
                    }
            };
            languageService.configure({
                schemas: [{
                    uri: 'file://test.yaml',
                    fileMatch: ['*.yaml', '*.yml'],
                    schema
                }],
                completion: true
            });
            languageService.addSnippet('test', {
                snippet: 'test_snippet',
                context: SnippetContext.scalar
            });
            languageService.configure({
                completion: true
            });
            const content = 'hello: ';
            const completion = parseSetup(content, 7);
            completion.then(function (result) {
                assert.equal(result.items.length, 1);
            }).then(done, done);
        });

        it('Test that snippets are not returned when they dont match the schema', done => {
            const schema = {
                    'type': 'object',
                    'properties': {
                        'hello': {
                            'type': 'object'
                        }
                    }
            };
            languageService.configure({
                schemas: [{
                    uri: 'file://test.yaml',
                    fileMatch: ['*.yaml', '*.yml'],
                    schema
                }],
                completion: true
            });
            languageService.addSnippet('test', {
                snippet: 'test_snippet',
                context: SnippetContext.scalar
            });
            languageService.configure({
                completion: true
            });
            const content = 'hello: ';
            const completion = parseSetup(content, 7);
            completion.then(function (result) {
                assert.equal(result.items.length, 0);
            }).then(done, done);
        });
    });
});
