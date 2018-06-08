/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import {
	IPCMessageReader, IPCMessageWriter,
	createConnection, IConnection, TextDocumentSyncKind,
	TextDocuments, TextDocument, Diagnostic, DiagnosticSeverity,
	InitializeParams, InitializeResult, TextDocumentPositionParams,
	RequestType
} from 'vscode-languageserver';
import { xhr, XHRResponse, configure as configureHttpRequests, getErrorStatusDescription } from 'request-light';
import {getLanguageService} from '../src/languageservice/yamlLanguageService'
import Strings = require( '../src/languageservice/utils/strings');
import URI from '../src/languageservice/utils/uri';
import * as URL from 'url';
import fs = require('fs');
import {JSONSchemaService} from '../src/languageservice/services/jsonSchemaService'
import {schemaRequestService, workspaceContext}  from './testHelper';
import { parse as parseYAML } from '../src/languageservice/parser/yamlParser';
import { getLineOffsets } from "../src/languageservice/utils/arrUtils";
var assert = require('assert');

let languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

let schemaService = new JSONSchemaService(schemaRequestService, workspaceContext);

suite("Document Symbols Tests", () => {
	
	describe('Document Symbols Tests', function(){
				
        function setup(content: string){
            return TextDocument.create("file://~/Desktop/vscode-k8s/test.yaml", "yaml", 0, content);
        }

        function parseSetup(content: string){
            let testTextDocument = setup(content);
            let jsonDocument = parseYAML(testTextDocument.getText());
            return languageService.findDocumentSymbols(testTextDocument, jsonDocument);
        }

        it('Document is empty', (done) => {
            let content = "";
            let symbols = parseSetup(content);
            assert.equal(symbols, null);	
            done();
        })

        it('Simple document symbols', (done) => {
            let content = "cwd: test";
            let symbols = parseSetup(content);
            assert.equal(symbols.length, 1);	
            done();			
        });

        it('Document Symbols with number', (done) => {
            let content = "node1: 10000";
            let symbols = parseSetup(content);
            assert.equal(symbols.length, 1);	
            done();			
        });

        it('Document Symbols with boolean', (done) => {
            let content = "node1: False";
            let symbols = parseSetup(content);
            assert.equal(symbols.length, 1);	
            done();			
        });

        it('Document Symbols with object', (done) => {
            let content = "scripts:\n  node1: test\n  node2: test";
            let symbols = parseSetup(content);
            assert.equal(symbols.length, 3);	
            done();			
        });

        it('Document Symbols with null', (done) => {
            let content = "apiVersion: null";
            let symbols = parseSetup(content);
            assert.equal(symbols.length, 1);	
            done();			
        });

        it('Document Symbols with array of strings', (done) => {
            let content = "items:\n  - test\n  - test";
            let symbols = parseSetup(content);
            assert.equal(symbols.length, 1);	
            done();			
        });

        it('Document Symbols with array', (done) => {
            let content = "authors:\n  - name: Josh\n  - email: jp";
            let symbols = parseSetup(content);
            assert.equal(symbols.length, 3);	
            done();			
        });
    
        it('Document Symbols with object and array', (done) => {
            let content = "scripts:\n  node1: test\n  node2: test\nauthors:\n  - name: Josh\n  - email: jp";
            let symbols = parseSetup(content);
            assert.equal(symbols.length, 6);	
            done();			
        });

        it('Document Symbols with multi documents', (done) => {
            let content = '---\nanalytics: true\n...\n---\njson: test\n...';
            let symbols = parseSetup(content);
            assert.equal(symbols.length, 2);	
            done();			
        });

    });
    
});