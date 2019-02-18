/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import {
    IPCMessageReader, IPCMessageWriter,
    createConnection, IConnection, TextDocumentSyncKind,
    TextDocuments, TextDocument, Diagnostic, DiagnosticSeverity,
    InitializeParams, InitializeResult, TextDocumentPositionParams,
    CompletionItem, CompletionItemKind, RequestType
} from 'vscode-languageserver';
import { xhr, XHRResponse, configure as configureHttpRequests, getErrorStatusDescription } from 'request-light';
import { getLanguageService } from '../src/languageservice/yamlLanguageService'
import Strings = require('../src/languageservice/utils/strings');
import URI from '../src/languageservice/utils/uri';
import * as URL from 'url';
import fs = require('fs');
import { JSONSchemaService } from '../src/languageservice/services/jsonSchemaService'
import { schemaRequestService, workspaceContext } from './testHelper';
import { parse as parseYAML } from '../src/languageservice/parser/yamlParser';
var assert = require('assert');

let languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

let schemaService = new JSONSchemaService(schemaRequestService, workspaceContext);

let uri = 'http://json.schemastore.org/bowerrc';
let languageSettings = {
    schemas: [],
    validate: true,
    customTags: []
};
let fileMatch = ["*.yml", "*.yaml"];
languageSettings.schemas.push({ uri, fileMatch: fileMatch });
languageSettings.customTags.push("!Test");
languageService.configure(languageSettings);

// Defines a Mocha test suite to group tests of similar kind together
suite("Formatter Tests", () => {

    // Tests for validator
    describe('Formatter', function () {

        function setup(content: string) {
            return TextDocument.create("file://~/Desktop/vscode-k8s/test.yaml", "yaml", 0, content);
        }

        describe('Test that formatter works with custom tags', function () {

            it('Formatting works without custom tags', () => {
                let content = `cwd: test`;
                let testTextDocument = setup(content);
                let edits = languageService.doFormat(testTextDocument, {});
                assert.notEqual(edits.length, 0);
                assert.equal(edits[0].newText, "cwd: test\n");
            });

            it('Formatting works without custom tags', () => {
                let content = `cwd:       !Test test`;
                let testTextDocument = setup(content);
                let edits = languageService.doFormat(testTextDocument, {});
                assert.notEqual(edits.length, 0);
            });

            it('Formatting wraps text', () => {
                let content = `comments: >
                test test test test test test test test test test test test`;
                let testTextDocument = setup(content);
                let edits = languageService.doFormat(testTextDocument, {
                    printWidth: 20,
                    proseWrap: "always"
                });
                assert.equal(edits[0].newText, "comments: >\n  test test test\n  test test test\n  test test test\n  test test test\n");
            });
        });

    });
});