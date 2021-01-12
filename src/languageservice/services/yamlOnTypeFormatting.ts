/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentOnTypeFormattingParams, Position, Range, TextDocument, TextEdit } from 'vscode-languageserver';
import { TextBuffer } from '../utils/textBuffer';

export function doDocumentOnTypeFormatting(
  document: TextDocument,
  params: DocumentOnTypeFormattingParams
): TextEdit[] | undefined {
  const { position } = params;
  const tb = new TextBuffer(document);
  if (params.ch === '\n') {
    const previousLine = tb.getLineContent(position.line - 1);
    if (previousLine.trimRight().endsWith(':')) {
      const currentLine = tb.getLineContent(position.line);
      const subLine = currentLine.substring(position.character, currentLine.length);
      const isInArray = previousLine.indexOf(' - ') !== -1;
      if (subLine.trimRight().length === 0) {
        const indentationFix = position.character - (previousLine.length - previousLine.trimLeft().length);
        if (indentationFix === params.options.tabSize && !isInArray) {
          return;
        }
        return [
          TextEdit.del(Range.create(position, Position.create(position.line, currentLine.length - 1))),
          TextEdit.insert(position, ' '.repeat(params.options.tabSize + (isInArray ? 2 - indentationFix : 0))),
        ];
      }
      if (isInArray) {
        return [TextEdit.insert(position, ' '.repeat(params.options.tabSize))];
      }
    }

    if (previousLine.trimRight().endsWith('|')) {
      return [TextEdit.insert(position, ' '.repeat(params.options.tabSize))];
    }

    if (previousLine.includes(' - ') && !previousLine.includes(': ')) {
      return [TextEdit.insert(position, '- ')];
    }

    if (previousLine.includes(' - ') && previousLine.includes(': ')) {
      return [TextEdit.insert(position, '  ')];
    }
  }
  return;
}
