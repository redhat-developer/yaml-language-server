/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TextDocument } from "vscode-languageserver";
import { getLanguageService } from "../src/languageservice/yamlLanguageService";
import { schemaRequestService, workspaceContext } from "./utils/testHelper";
import { parse as parseYAML } from "../src/languageservice/parser/yamlParser04";
import { getLineOffsets } from "../src/languageservice/utils/arrUtils";
import assert = require("assert");

const languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

const uri = "http://json.schemastore.org/bowerrc";
const languageSettings = {
    schemas: [],
    completion: true
};
const fileMatch = ["*.yml", "*.yaml"];
languageSettings.schemas.push({ uri, fileMatch: fileMatch });
languageService.configure(languageSettings);

suite("Auto Completion Tests", () => {

    describe("yamlCompletion with bowerrc", function () {

        describe("doComplete", function () {

            function setup(content: string) {
                return TextDocument.create("file://~/Desktop/vscode-k8s/test.yaml", "yaml", 0, content);
            }

            function parseSetup(content: string, position) {
                const testTextDocument = setup(content);
                return completionHelper(testTextDocument, testTextDocument.positionAt(position));
            }

            it("Autocomplete on root node without word", done => {
                const content = "";
                const completion = parseSetup(content, 0);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it("Autocomplete on root node with word", done => {
                const content = "analyt";
                const completion = parseSetup(content, 6);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it("Autocomplete on default value (without value content)", done => {
                const content = "directory: ";
                const completion = parseSetup(content, 12);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it("Autocomplete on default value (with value content)", done => {
                const content = "directory: bow";
                const completion = parseSetup(content, 15);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it("Autocomplete on boolean value (without value content)", done => {
                const content = "analytics: ";
                const completion = parseSetup(content, 11);
                completion.then(function (result) {
                    assert.equal(result.items.length, 2);
                }).then(done, done);
            });

            it("Autocomplete on boolean value (with value content)", done => {
                const content = "analytics: fal";
                const completion = parseSetup(content, 11);
                completion.then(function (result) {
                    assert.equal(result.items.length, 2);
                }).then(done, done);
            });

            it("Autocomplete on number value (without value content)", done => {
                const content = "timeout: ";
                const completion = parseSetup(content, 9);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                }).then(done, done);
            });

            it("Autocomplete on number value (with value content)", done => {
                const content = "timeout: 6";
                const completion = parseSetup(content, 10);
                completion.then(function (result) {
                    assert.equal(result.items.length, 1);
                }).then(done, done);
            });

            it("Autocomplete key in middle of file", done => {
                const content = "scripts:\n  post";
                const completion = parseSetup(content, 11);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it("Autocomplete key in middle of file 2", done => {
                const content = "scripts:\n  postinstall: /test\n  preinsta";
                const completion = parseSetup(content, 31);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it("Autocomplete does not happen right after :", done => {
                const content = "analytics:";
                const completion = parseSetup(content, 9);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it("Autocomplete does not happen right after : under an object", done => {
                const content = "scripts:\n  postinstall:";
                const completion = parseSetup(content, 21);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it("Autocomplete on multi yaml documents in a single file on root", done => {
                const content = "---\nanalytics: true\n...\n---\n...";
                const completion = parseSetup(content, 28);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });

            it("Autocomplete on multi yaml documents in a single file on scalar", done => {
                const content = "---\nanalytics: true\n...\n---\njson: \n...";
                const completion = parseSetup(content, 34);
                completion.then(function (result) {
                    assert.notEqual(result.items.length, 0);
                }).then(done, done);
            });
        });
    });
});

function is_EOL(c) {
    return (c === 0x0A/* LF */) || (c === 0x0D/* CR */);
}

function completionHelper(document: TextDocument, textDocumentPosition) {

    //Get the string we are looking at via a substring
    const linePos = textDocumentPosition.line;
    const position = textDocumentPosition;
    const lineOffset = getLineOffsets(document.getText());
    const start = lineOffset[linePos]; //Start of where the autocompletion is happening
    let end = 0; //End of where the autocompletion is happening
    if (lineOffset[linePos + 1]) {
        end = lineOffset[linePos + 1];
    } else {
        end = document.getText().length;
    }

    while (end - 1 >= 0 && is_EOL(document.getText().charCodeAt(end - 1))) {
        end--;
    }

    const textLine = document.getText().substring(start, end);

    //Check if the string we are looking at is a node
    if (textLine.indexOf(":") === -1) {
        //We need to add the ":" to load the nodes

        let newText = "";

        //This is for the empty line case
        const trimmedText = textLine.trim();
        if (trimmedText.length === 0 || (trimmedText.length === 1 && trimmedText[0] === "-")) {
            //Add a temp node that is in the document but we don't use at all.
            newText = document.getText().substring(0,
                start + textLine.length) + (trimmedText[0] === "-" && !textLine.endsWith(" ") ? " " : "") + "holder:\r\n" +
                document.getText().substr(lineOffset[linePos + 1] || document.getText().length);
            //For when missing semi colon case
        } else {
            //Add a semicolon to the end of the current line so we can validate the node
            newText = document.getText().substring(0, start + textLine.length) + ":\r\n" + document.getText().substr(lineOffset[linePos + 1] || document.getText().length);
        }
        const jsonDocument = parseYAML(newText);
        return languageService.doComplete(document, position, jsonDocument);
    } else {

        //All the nodes are loaded
        position.character = position.character - 1;
        const jsonDocument = parseYAML(document.getText());
        return languageService.doComplete(document, position, jsonDocument);
    }

}
