/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getLanguageService } from '../src/languageservice/yamlLanguageService';
import { schemaRequestService, workspaceContext, setupTextDocument, TEST_URI }  from './utils/testHelper';
import { createExpectedSymbolInformation, createExpectedDocumentSymbol } from './utils/verifyError';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver-types';
import assert = require('assert');

const languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

suite('Document Symbols Tests', () => {

    describe('Document Symbols Tests (Non Hierarchical)', function () {

        function parseNonHierarchicalSetup(content: string) {
            const testTextDocument = setupTextDocument(content);
            return languageService.findDocumentSymbols(testTextDocument );
        }

        it('Document is empty', done => {
            const content = '';
            const symbols = parseNonHierarchicalSetup(content);
            assert.equal(symbols, null);
            done();
        });

        it('Simple document symbols', () => {
            const content = 'cwd: test';
            const symbols = parseNonHierarchicalSetup(content);
            assert.equal(symbols.length, 1);
            assert.deepEqual(
                symbols[0],
                createExpectedSymbolInformation('cwd', 15, undefined, TEST_URI, 0, 0, 0, 9)
            );
        });

        it('Document Symbols with number', () => {
            const content = 'node1: 10000';
            const symbols = parseNonHierarchicalSetup(content);
            assert.equal(symbols.length, 1);
            assert.deepEqual(
                symbols[0],
                createExpectedSymbolInformation('node1', 16, undefined, TEST_URI, 0, 0, 0, 12)
            );
        });

        it('Document Symbols with boolean', () => {
            const content = 'node1: False';
            const symbols = parseNonHierarchicalSetup(content);
            assert.equal(symbols.length, 1);
            assert.deepEqual(
                symbols[0],
                createExpectedSymbolInformation('node1', 17, undefined, TEST_URI, 0, 0, 0, 12)
            );
        });

        it('Document Symbols with object', () => {
            const content = 'scripts:\n  node1: test\n  node2: test';
            const symbols = parseNonHierarchicalSetup(content);
            assert.equal(symbols.length, 3);
            assert.deepEqual(
                symbols[0],
                createExpectedSymbolInformation('scripts', 2, undefined, TEST_URI, 0, 0, 2, 13)
            );
            assert.deepEqual(
                symbols[1],
                createExpectedSymbolInformation('node1', 15, 'scripts', TEST_URI, 1, 2, 1, 13)
            );
            assert.deepEqual(
                symbols[2],
                createExpectedSymbolInformation('node2', 15, 'scripts', TEST_URI, 2, 2, 2, 13)
            );
        });

        it('Document Symbols with null', () => {
            const content = 'apiVersion: null';
            const symbols = parseNonHierarchicalSetup(content);
            assert.equal(symbols.length, 1);
            assert.deepEqual(
                symbols[0],
                createExpectedSymbolInformation('apiVersion', 15, undefined, TEST_URI, 0, 0, 0, 16)
            );
        });

        it('Document Symbols with array of strings', () => {
            const content = 'items:\n  - test\n  - test';
            const symbols = parseNonHierarchicalSetup(content);
            assert.equal(symbols.length, 1);
            assert.deepEqual(
                symbols[0],
                createExpectedSymbolInformation('items', 18, undefined, TEST_URI, 0, 0, 2, 8)
            );
        });

        it('Document Symbols with array', () => {
            const content = 'authors:\n  - name: Josh\n  - email: jp';
            const symbols = parseNonHierarchicalSetup(content);
            assert.equal(symbols.length, 3);
            assert.deepEqual(
                symbols[0],
                createExpectedSymbolInformation('authors', 18, undefined, TEST_URI, 0, 0, 2, 13)
            );
            assert.deepEqual(
                symbols[1],
                createExpectedSymbolInformation('name', 15, 'authors', TEST_URI, 1, 4, 1, 14)
            );
            assert.deepEqual(
                symbols[2],
                createExpectedSymbolInformation('email', 15, 'authors', TEST_URI, 2, 4, 2, 13)
            );
        });

        it('Document Symbols with object and array', () => {
            const content = 'scripts:\n  node1: test\n  node2: test\nauthors:\n  - name: Josh\n  - email: jp';
            const symbols = parseNonHierarchicalSetup(content);
            assert.equal(symbols.length, 6);
            assert.deepEqual(
                symbols[0],
                createExpectedSymbolInformation('scripts', 2, undefined, TEST_URI, 0, 0, 2, 13)
            );
            assert.deepEqual(
                symbols[1],
                createExpectedSymbolInformation('node1', 15, 'scripts', TEST_URI, 1, 2, 1, 13)
            );
            assert.deepEqual(
                symbols[2],
                createExpectedSymbolInformation('node2', 15, 'scripts', TEST_URI, 2, 2, 2, 13)
            );
            assert.deepEqual(
                symbols[3],
                createExpectedSymbolInformation('authors', 18, undefined, TEST_URI, 3, 0, 5, 13)
            );
            assert.deepEqual(
                symbols[4],
                createExpectedSymbolInformation('name', 15, 'authors', TEST_URI, 4, 4, 4, 14)
            );
            assert.deepEqual(
                symbols[5],
                createExpectedSymbolInformation('email', 15, 'authors', TEST_URI, 5, 4, 5, 13)
            );
        });

        it('Document Symbols with multi documents', () => {
            const content = '---\nanalytics: true\n...\n---\njson: test\n...';
            const symbols = parseNonHierarchicalSetup(content);
            assert.equal(symbols.length, 2);
            assert.deepEqual(
                symbols[0],
                createExpectedSymbolInformation('analytics', 17, undefined, TEST_URI, 1, 0, 1, 15)
            );
            assert.deepEqual(
                symbols[1],
                createExpectedSymbolInformation('json', 15, undefined, TEST_URI, 4, 0, 4, 10)
            );
        });

    });

    describe('Document Symbols Tests (Hierarchical)', function () {

        function parseHierarchicalSetup(content: string): DocumentSymbol[] {
            const testTextDocument = setupTextDocument(content);
            return languageService.findDocumentSymbols2(testTextDocument);
        }

        it('Document is empty', done => {
            const content = '';
            const symbols = parseHierarchicalSetup(content);
            assert.equal(symbols, null);
            done();
        });

        it('Simple document symbols', () => {
            const content = 'cwd: test';
            const symbols = parseHierarchicalSetup(content);
            assert.equal(symbols.length, 1);
            assert.deepEqual(
                symbols[0],
                createExpectedDocumentSymbol('cwd', 15, 0, 0, 0, 9, 0, 0, 0, 3)
            );
        });

        it('Document Symbols with number', () => {
            const content = 'node1: 10000';
            const symbols = parseHierarchicalSetup(content);
            assert.equal(symbols.length, 1);
            assert.deepEqual(
                symbols[0],
                createExpectedDocumentSymbol('node1', 16, 0, 0, 0, 12, 0, 0, 0, 5)
            );
        });

        it('Document Symbols with boolean', () => {
            const content = 'node1: False';
            const symbols = parseHierarchicalSetup(content);
            assert.equal(symbols.length, 1);
            assert.deepEqual(
                symbols[0],
                createExpectedDocumentSymbol('node1', 17, 0, 0, 0, 12, 0, 0, 0, 5)
            );
        });

        it('Document Symbols with object', () => {
            const content = 'scripts:\n  node1: test\n  node2: test';
            const symbols = parseHierarchicalSetup(content);
            assert.equal(symbols.length, 1);
            const child1 = createExpectedDocumentSymbol('node1', SymbolKind.String, 1, 2, 1, 13, 1, 2, 1, 7);
            const child2 = createExpectedDocumentSymbol('node2', SymbolKind.String, 2, 2, 2, 13, 2, 2, 2, 7);
            const children = [child1, child2];
            assert.deepEqual(
                symbols[0],
                createExpectedDocumentSymbol('scripts', SymbolKind.Module, 0, 0, 2, 13, 0, 0, 0, 7, children)
            );
        });

        it('Document Symbols with null', () => {
            const content = 'apiVersion: null';
            const symbols = parseHierarchicalSetup(content);
            assert.equal(symbols.length, 1);
            assert.deepEqual(
                symbols[0],
                createExpectedDocumentSymbol('apiVersion', SymbolKind.String, 0, 0, 0, 16, 0, 0, 0, 10)
            );
        });

        it('Document Symbols with array of strings', () => {
            const content = 'items:\n  - test\n  - test';
            const symbols = parseHierarchicalSetup(content);
            assert.equal(symbols.length, 1);
            const child1 = createExpectedDocumentSymbol('0', SymbolKind.String, 1, 4, 1, 8, 1, 4, 1, 8);
            const child2 = createExpectedDocumentSymbol('1', SymbolKind.String, 2, 4, 2, 8, 2, 4, 2, 8);
            const children = [child1, child2];
            assert.deepEqual(
                symbols[0],
                createExpectedDocumentSymbol('items', SymbolKind.Array, 0, 0, 2, 8, 0, 0, 0, 5, children)
            );
        });

        it('Document Symbols with array', () => {
            const content = 'authors:\n  - name: Josh\n  - email: jp';
            const symbols = parseHierarchicalSetup(content);

            const object1 = createExpectedDocumentSymbol('name', SymbolKind.String, 1, 4, 1, 14, 1, 4, 1, 8);
            const arrayChild1 = createExpectedDocumentSymbol('0', SymbolKind.Module, 1, 4, 1, 14, 1, 4, 1, 14, [object1]);

            const object2 = createExpectedDocumentSymbol('email', SymbolKind.String, 2, 4, 2, 13, 2, 4, 2, 9);
            const arrayChild2 = createExpectedDocumentSymbol('1', SymbolKind.Module, 2, 4, 2, 13, 2, 4, 2, 13, [object2]);
            const children = [arrayChild1, arrayChild2];
            assert.deepEqual(
                symbols[0],
                createExpectedDocumentSymbol('authors', SymbolKind.Array, 0, 0, 2, 13, 0, 0, 0, 7, children)
            );
        });

        it('Document Symbols with object and array', () => {
            const content = 'scripts:\n  node1: test\n  node2: test\nauthors:\n  - name: Josh\n  - email: jp';
            const symbols = parseHierarchicalSetup(content);
            assert.equal(symbols.length, 2);

            const child1 = createExpectedDocumentSymbol('node1', SymbolKind.String, 1, 2, 1, 13, 1, 2, 1, 7);
            const child2 = createExpectedDocumentSymbol('node2', SymbolKind.String, 2, 2, 2, 13, 2, 2, 2, 7);
            const children = [child1, child2];
            assert.deepEqual(
                symbols[0],
                createExpectedDocumentSymbol('scripts', SymbolKind.Module, 0, 0, 2, 13, 0, 0, 0, 7, children)
            );

            const object1 = createExpectedDocumentSymbol('name', SymbolKind.String, 4, 4, 4, 14, 4, 4, 4, 8);
            const arrayChild1 = createExpectedDocumentSymbol('0', SymbolKind.Module, 4, 4, 4, 14, 4, 4, 4, 14, [object1]);

            const object2 = createExpectedDocumentSymbol('email', SymbolKind.String, 5, 4, 5, 13, 5, 4, 5, 9);
            const arrayChild2 = createExpectedDocumentSymbol('1', SymbolKind.Module, 5, 4, 5, 13, 5, 4, 5, 13, [object2]);
            const children2 = [arrayChild1, arrayChild2];

            assert.deepEqual(
                symbols[1],
                createExpectedDocumentSymbol('authors', SymbolKind.Array, 3, 0, 5, 13, 3, 0, 3, 7, children2)
            );
        });

        it('Document Symbols with multi documents', () => {
            const content = '---\nanalytics: true\n...\n---\njson: test\n...';
            const symbols = parseHierarchicalSetup(content);
            assert.equal(symbols.length, 2);
            assert.deepEqual(
                symbols[0],
                createExpectedDocumentSymbol('analytics', SymbolKind.Boolean, 1, 0, 1, 15, 1, 0, 1, 9)
            );
            assert.deepEqual(
                symbols[1],
                createExpectedDocumentSymbol('json', SymbolKind.String, 4, 0, 4, 10, 4, 0, 4, 4)
            );
        });

    });

});
