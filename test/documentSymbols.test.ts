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
import {getLanguageService} from '../src/languageService/yamlLanguageService'
import Strings = require( '../src/languageService/utils/strings');
import URI from '../src/languageService/utils/uri';
import * as URL from 'url';
import fs = require('fs');
import {JSONSchemaService} from '../src/languageService/services/jsonSchemaService'
import {schemaRequestService, workspaceContext}  from './testHelper';
import { parse as parseYAML } from '../src/languageService/parser/yamlParser';
import { YAMLDocument } from 'vscode-yaml-languageservice';
import { getLineOffsets } from "../src/languageService/utils/arrUtils";
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
            let jsonDocument = parseYAML(testTextDocument.getText()).documents[0];
            return languageService.findDocumentSymbols(testTextDocument, jsonDocument);
        }

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

    });
    
});