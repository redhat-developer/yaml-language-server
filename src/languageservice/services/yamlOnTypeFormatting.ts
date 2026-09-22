/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DocumentOnTypeFormattingParams } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Range, TextEdit } from 'vscode-languageserver-types';
import { TextBuffer } from '../utils/textBuffer';

export function doDocumentOnTypeFormatting(
  document: TextDocument,
  params: DocumentOnTypeFormattingParams
): TextEdit[] | undefined {
  const { position } = params;
  const tb = new TextBuffer(document);
  if (params.ch === '\n') {
    const previousLine = tb.getLineContent(position.line - 1);
    if (previousLine.trimEnd().endsWith(':')) {
      let expectedIndentationLength = previousLine.length - previousLine.trimStart().length + params.options.tabSize;
      if (previousLine.trimStart().startsWith('-')) {
        expectedIndentationLength += params.options.tabSize;
      }
      const currentLine = tb.getLineContent(position.line).replace('\r', '').replace('\n', '');
      if (currentLine.trim().length !== 0) {
        // non-space content, do nothing
        return;
      } else if (currentLine.length === expectedIndentationLength) {
        // already right; do nothing
        return;
      } else if (currentLine.length < expectedIndentationLength) {
        return [TextEdit.insert(position, ' '.repeat(expectedIndentationLength - currentLine.length))];
      } else {
        return [
          TextEdit.del(
            Range.create(
              Position.create(position.line, 0),
              Position.create(position.line, currentLine.length - expectedIndentationLength)
            )
          ),
        ];
      }
    }

    if (previousLine.trimEnd().endsWith('|')) {
      return [TextEdit.insert(position, ' '.repeat(params.options.tabSize))];
    }

    if (previousLine.trimStart().startsWith('-') && !previousLine.includes(': ')) {
      const indentation = previousLine.slice(0, previousLine.length - previousLine.trimStart().length);
      const expectedText = indentation + '- ';
      const currentLine = tb.getLineContent(position.line).replace('\r', '').replace('\n', '');
      if (currentLine.trim().length !== 0) {
        // non-space content, do nothing
        return;
      }
      if (currentLine === expectedText) {
        // already right; do nothing
        return;
      }
      if (position.character >= indentation.length) {
        // The client already auto-indented the line and placed the cursor at
        // (or past) the indentation; just append the dash.
        return [TextEdit.insert(Position.create(position.line, currentLine.length), '- ')];
      }
      // The client sent a position before the existing whitespace
      // (e.g. lsp-mode, eglot send column 0 even though the line already has
      // auto-indented spaces).  Replace the whole line content so the
      // result is always correct.
      return [
        TextEdit.replace(
          Range.create(Position.create(position.line, 0), Position.create(position.line, currentLine.length)),
          expectedText
        ),
      ];
    }

    if (previousLine.includes(' - ') && previousLine.includes(': ')) {
      return [TextEdit.insert(position, '  ')];
    }
  }
}
