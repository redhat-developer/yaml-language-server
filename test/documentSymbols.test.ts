/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getLanguageService } from '../src/languageservice/yamlLanguageService'
import { schemaRequestService, workspaceContext, createJSONLanguageService, setupTextDocument, TEST_URI }  from './utils/testHelper';
import { parse as parseYAML } from '../src/languageservice/parser/yamlParser07';
import { createExpectedSymbolInformation, createExpectedDocumentSymbol } from './utils/verifyError';
import { DocumentSymbol, SymbolInformation, SymbolKind } from 'vscode-languageserver-types';
var assert = require('assert');

let languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

suite("Document Symbols Tests", () => {
	
	describe('Document Symbols Tests (Non Hierarchical)', function(){

        function parseNonHierarchicalSetup(content: string){
            let testTextDocument = setupTextDocument(content);
            let jsonDocument = parseYAML(testTextDocument.getText());
            const jsonLanguageService = createJSONLanguageService();
            return languageService.findDocumentSymbols(jsonLanguageService, testTextDocument, jsonDocument);
        }

        it('Document is empty', (done) => {
            let content = "";
            let symbols = parseNonHierarchicalSetup(content);
            assert.equal(symbols, null);
            done();
        })

        it('Simple document symbols', () => {
            let content = "cwd: test";
            let symbols = parseNonHierarchicalSetup(content);
            assert.equal(symbols.length, 1);
            assert.deepEqual(
                symbols[0],
                createExpectedSymbolInformation("cwd", 15, undefined, TEST_URI, 0, 0, 0, 9)
            )
        });

        it('Document Symbols with number', () => {
            let content = "node1: 10000";
            let symbols = parseNonHierarchicalSetup(content);
            assert.equal(symbols.length, 1);
            assert.deepEqual(
                symbols[0],
                createExpectedSymbolInformation("node1", 16, undefined, TEST_URI, 0, 0, 0, 12)
            )
        });

        it('Document Symbols with boolean', () => {
            let content = "node1: False";
            let symbols = parseNonHierarchicalSetup(content);
            assert.equal(symbols.length, 1);
            assert.deepEqual(
                symbols[0],
                createExpectedSymbolInformation("node1", 17, undefined, TEST_URI, 0, 0, 0, 12)
            )
        });

        it('Document Symbols with object', () => {
            let content = "scripts:\n  node1: test\n  node2: test";
            let symbols = parseNonHierarchicalSetup(content);
            assert.equal(symbols.length, 3);
            assert.deepEqual(
                symbols[0],
                createExpectedSymbolInformation("scripts", 2, undefined, TEST_URI, 0, 0, 2, 13)
            );
            assert.deepEqual(
                symbols[1],
                createExpectedSymbolInformation("node1", 15, "scripts", TEST_URI, 1, 2, 1, 13)
            );
            assert.deepEqual(
                symbols[2],
                createExpectedSymbolInformation("node2", 15, "scripts", TEST_URI, 2, 2, 2, 13)
            );
        });

        it('Document Symbols with null', () => {
            let content = "apiVersion: null";
            let symbols = parseNonHierarchicalSetup(content);
            assert.equal(symbols.length, 1);
            assert.deepEqual(
                symbols[0],
                createExpectedSymbolInformation("apiVersion", 15, undefined, TEST_URI, 0, 0, 0, 16)
            )
        });

        it('Document Symbols with array of strings', () => {
            let content = "items:\n  - test\n  - test";
            let symbols = parseNonHierarchicalSetup(content);
            assert.equal(symbols.length, 1);
            assert.deepEqual(
                symbols[0],
                createExpectedSymbolInformation("items", 18, undefined, TEST_URI, 0, 0, 2, 8)
            );
        });

        it('Document Symbols with array', () => {
            let content = "authors:\n  - name: Josh\n  - email: jp";
            let symbols = parseNonHierarchicalSetup(content);
            assert.equal(symbols.length, 3);
            assert.deepEqual(
                symbols[0],
                createExpectedSymbolInformation("authors", 18, undefined, TEST_URI, 0, 0, 2, 13)
            );
            assert.deepEqual(
                symbols[1],
                createExpectedSymbolInformation("name", 15, "authors", TEST_URI, 1, 4, 1, 14)
            );
            assert.deepEqual(
                symbols[2],
                createExpectedSymbolInformation("email", 15, "authors", TEST_URI, 2, 4, 2, 13)
            );
        });
    
        it('Document Symbols with object and array', () => {
            let content = "scripts:\n  node1: test\n  node2: test\nauthors:\n  - name: Josh\n  - email: jp";
            let symbols = parseNonHierarchicalSetup(content);
            assert.equal(symbols.length, 6);
            assert.deepEqual(
                symbols[0],
                createExpectedSymbolInformation("scripts", 2, undefined, TEST_URI, 0, 0, 2, 13)
            );
            assert.deepEqual(
                symbols[1],
                createExpectedSymbolInformation("node1", 15, "scripts", TEST_URI, 1, 2, 1, 13)
            );
            assert.deepEqual(
                symbols[2],
                createExpectedSymbolInformation("node2", 15, "scripts", TEST_URI, 2, 2, 2, 13)
            );
            assert.deepEqual(
                symbols[3],
                createExpectedSymbolInformation("authors", 18, undefined, TEST_URI, 3, 0, 5, 13)
            );
            assert.deepEqual(
                symbols[4],
                createExpectedSymbolInformation("name", 15, "authors", TEST_URI, 4, 4, 4, 14)
            );
            assert.deepEqual(
                symbols[5],
                createExpectedSymbolInformation("email", 15, "authors", TEST_URI, 5, 4, 5, 13)
            );
        });

        it('Document Symbols with multi documents', () => {
            let content = '---\nanalytics: true\n...\n---\njson: test\n...';
            let symbols = parseNonHierarchicalSetup(content);
            assert.equal(symbols.length, 2);
            assert.deepEqual(
                symbols[0],
                createExpectedSymbolInformation("analytics", 17, undefined, TEST_URI, 1, 0, 1, 15)
            );
            assert.deepEqual(
                symbols[1],
                createExpectedSymbolInformation("json", 15, undefined, TEST_URI, 4, 0, 4, 10)
            );
        });

    });

    describe('Document Symbols Tests (Hierarchical)', function(){

        function parseHierarchicalSetup(content: string): DocumentSymbol[] {
            let testTextDocument = setupTextDocument(content);
            let jsonDocument = parseYAML(testTextDocument.getText());
            const jsonLanguageService = createJSONLanguageService();
            return languageService.findDocumentSymbols2(jsonLanguageService, testTextDocument, jsonDocument);
        }

        it('Document is empty', (done) => {
            let content = "";
            let symbols = parseHierarchicalSetup(content);
            assert.equal(symbols, null);
            done();
        })

        it('Simple document symbols', () => {
            let content = "cwd: test";
            let symbols = parseHierarchicalSetup(content);
            assert.equal(symbols.length, 1);
            assert.deepEqual(
                symbols[0],
                createExpectedDocumentSymbol("cwd", 15, 0, 0, 0, 9, 0, 0, 0, 3)
            );
        });

        it('Document Symbols with number', () => {
            let content = "node1: 10000";
            let symbols = parseHierarchicalSetup(content);
            assert.equal(symbols.length, 1);
            assert.deepEqual(
                symbols[0],
                createExpectedDocumentSymbol("node1", 16, 0, 0, 0, 12, 0, 0, 0, 5)
            )
        });

        it('Document Symbols with boolean', () => {
            let content = "node1: False";
            let symbols = parseHierarchicalSetup(content);
            assert.equal(symbols.length, 1);
            assert.deepEqual(
                symbols[0],
                createExpectedDocumentSymbol("node1", 17, 0, 0, 0, 12, 0, 0, 0, 5)
            )
        });

        it('Document Symbols with object', () => {
            let content = "scripts:\n  node1: test\n  node2: test";
            let symbols = parseHierarchicalSetup(content);
            assert.equal(symbols.length, 1);
            const child1 = createExpectedDocumentSymbol("node1", SymbolKind.String, 1, 2, 1, 13, 1, 2, 1, 7);
            const child2 = createExpectedDocumentSymbol("node2", SymbolKind.String, 2, 2, 2, 13, 2, 2, 2, 7);
            const children = [child1, child2];
            assert.deepEqual(
                symbols[0],
                createExpectedDocumentSymbol("scripts", SymbolKind.Module, 0, 0, 2, 13, 0, 0, 0, 7, children)
            );
        });

        it('Document Symbols with null', () => {
            let content = "apiVersion: null";
            let symbols = parseHierarchicalSetup(content);
            assert.equal(symbols.length, 1);
            assert.deepEqual(
                symbols[0],
                createExpectedDocumentSymbol("apiVersion", SymbolKind.String, 0, 0, 0, 16, 0, 0, 0, 10)
            )
        });

        it('Document Symbols with array of strings', () => {
            let content = "items:\n  - test\n  - test";
            let symbols = parseHierarchicalSetup(content);
            assert.equal(symbols.length, 1);
            const child1 = createExpectedDocumentSymbol("0", SymbolKind.String, 1, 4, 1, 8, 1, 4, 1, 8);
            const child2 = createExpectedDocumentSymbol("1", SymbolKind.String, 2, 4, 2, 8, 2, 4, 2, 8);
            const children = [child1, child2];
            assert.deepEqual(
                symbols[0],
                createExpectedDocumentSymbol("items", SymbolKind.Array, 0, 0, 2, 8, 0, 0, 0, 5, children)
            );
        });

        it('Document Symbols with array', () => {
            let content = "authors:\n  - name: Josh\n  - email: jp";
            let symbols = parseHierarchicalSetup(content);

            const object1 = createExpectedDocumentSymbol("name", SymbolKind.String, 1, 4, 1, 14, 1, 4, 1, 8);
            const arrayChild1 = createExpectedDocumentSymbol("0", SymbolKind.Module, 1, 4, 1, 14, 1, 4, 1, 14, [object1]);

            const object2 = createExpectedDocumentSymbol("email", SymbolKind.String, 2, 4, 2, 13, 2, 4, 2, 9);
            const arrayChild2 = createExpectedDocumentSymbol("1", SymbolKind.Module, 2, 4, 2, 13, 2, 4, 2, 13, [object2]);
            const children = [arrayChild1, arrayChild2];
            assert.deepEqual(
                symbols[0],
                createExpectedDocumentSymbol("authors", SymbolKind.Array, 0, 0, 2, 13, 0, 0, 0, 7, children)
            );
        });
    
        it('Document Symbols with object and array', () => {
            let content = "scripts:\n  node1: test\n  node2: test\nauthors:\n  - name: Josh\n  - email: jp";
            let symbols = parseHierarchicalSetup(content);
            assert.equal(symbols.length, 2);

            const child1 = createExpectedDocumentSymbol("node1", SymbolKind.String, 1, 2, 1, 13, 1, 2, 1, 7);
            const child2 = createExpectedDocumentSymbol("node2", SymbolKind.String, 2, 2, 2, 13, 2, 2, 2, 7);
            const children = [child1, child2];
            assert.deepEqual(
                symbols[0],
                createExpectedDocumentSymbol("scripts", SymbolKind.Module, 0, 0, 2, 13, 0, 0, 0, 7, children)
            );

            const object1 = createExpectedDocumentSymbol("name", SymbolKind.String, 4, 4, 4, 14, 4, 4, 4, 8);
            const arrayChild1 = createExpectedDocumentSymbol("0", SymbolKind.Module, 4, 4, 4, 14, 4, 4, 4, 14, [object1]);

            const object2 = createExpectedDocumentSymbol("email", SymbolKind.String, 5, 4, 5, 13, 5, 4, 5, 9);
            const arrayChild2 = createExpectedDocumentSymbol("1", SymbolKind.Module, 5, 4, 5, 13, 5, 4, 5, 13, [object2]);
            const children2 = [arrayChild1, arrayChild2];

            assert.deepEqual(
                symbols[1],
                createExpectedDocumentSymbol("authors", SymbolKind.Array, 3, 0, 5, 13, 3, 0, 3, 7, children2)
            );
        });

        it('Document Symbols with multi documents', () => {
            let content = '---\nanalytics: true\n...\n---\njson: test\n...';
            let symbols = parseHierarchicalSetup(content);
            assert.equal(symbols.length, 2);
            assert.deepEqual(
                symbols[0],
                createExpectedDocumentSymbol("analytics", SymbolKind.Boolean, 1, 0, 1, 15, 1, 0, 1, 9)
            );
            assert.deepEqual(
                symbols[1],
                createExpectedDocumentSymbol("json", SymbolKind.String, 4, 0, 4, 10, 4, 0, 4, 4)
            );
        });

    });

});