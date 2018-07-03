/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Adam Voss. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TextDocument, Range, Position, FormattingOptions, TextEdit } from 'vscode-languageserver-types';
const prettier = require("prettier");

export function format(document: TextDocument): TextEdit[] {
    const formatted = prettier.format(document.getText(), { parser: "yaml" });
    return [TextEdit.replace(Range.create(Position.create(0, 0), document.positionAt(document.getText().length)), formatted)];
}