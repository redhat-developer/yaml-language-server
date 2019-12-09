/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getLineOffsets } from './arrUtils';
import { TextDocument, Position } from 'vscode-languageserver-types';
import { parse as parseYAML } from '../parser/yamlParser04';

/**
 * The function takes in a document and position and parses the 'fixed' version of the document that
 * corrects simple syntax mistakes so that its possible to parse the document correctly even if a semicolon
 * is missing
 *
 * @param document The text document you want to parse
 * @param textDocumentPosition The position that you want to perform completion on
 */
export function parseFixedYAML(document: TextDocument, textDocumentPosition: Position) {
    const completionFix = completionHelper(document, textDocumentPosition);
    const newText = completionFix.newText;
    return parseYAML(newText);
}

/**
 * Corrects simple syntax mistakes to load possible nodes even if a semicolon is missing
 */
export function completionHelper(document: TextDocument, textDocumentPosition: Position) {
    // Get the string we are looking at via a substring
    const linePos = textDocumentPosition.line;
    const position = textDocumentPosition;
    const lineOffset = getLineOffsets(document.getText());
    const start = lineOffset[linePos]; // Start of where the autocompletion is happening
    let end = 0; // End of where the autocompletion is happening

    if (lineOffset[linePos + 1]) {
        end = lineOffset[linePos + 1];
    } else {
        end = document.getText().length;
    }

    while (end - 1 >= 0 && is_EOL(document.getText().charCodeAt(end - 1))) {
        end--;
    }

    const textLine = document.getText().substring(start, end);

    // Check if the string we are looking at is a node
    if (textLine.indexOf(':') === -1) {
        // We need to add the ":" to load the nodes
        let newText = '';

        // This is for the empty line case
        const trimmedText = textLine.trim();
        if (trimmedText.length === 0 || (trimmedText.length === 1 && trimmedText[0] === '-')) {
            // Add a temp node that is in the document but we don't use at all.
            newText = document.getText().substring(0, start + textLine.length) +
                (trimmedText[0] === '-' && !textLine.endsWith(' ') ? ' ' : '') + 'holder:\r\n' +
                document.getText().substr(lineOffset[linePos + 1] || document.getText().length);

            // For when missing semi colon case
        } else {
            // Add a semicolon to the end of the current line so we can validate the node
            newText = document.getText().substring(0, start + textLine.length) + ':\r\n' + document.getText().substr(lineOffset[linePos + 1] || document.getText().length);
        }

        return {
            'newText': newText,
            'newPosition': textDocumentPosition
        };
    } else {
        // All the nodes are loaded
        position.character = position.character - 1;

        return {
            'newText': document.getText(),
            'newPosition': position
        };
    }
}

function is_EOL(c: number) {
    return (c === 0x0A/* LF */) || (c === 0x0D/* CR */);
}
