/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-json-languageservice';
import { Range } from 'vscode-languageserver-types';

interface FullTextDocument {
  getLineOffsets(): number[];
}

export class TextBuffer {
  constructor(private doc: TextDocument) {}

  getLineCount(): number {
    return this.doc.lineCount;
  }

  getLineLength(lineNumber: number): number {
    const lineOffsets = ((this.doc as unknown) as FullTextDocument).getLineOffsets();
    if (lineNumber >= lineOffsets.length) {
      return this.doc.getText().length;
    } else if (lineNumber < 0) {
      return 0;
    }

    const nextLineOffset = lineNumber + 1 < lineOffsets.length ? lineOffsets[lineNumber + 1] : this.doc.getText().length;
    return nextLineOffset - lineOffsets[lineNumber];
  }

  getLineContent(lineNumber: number): string {
    const lineOffsets = ((this.doc as unknown) as FullTextDocument).getLineOffsets();
    if (lineNumber >= lineOffsets.length) {
      return this.doc.getText();
    } else if (lineNumber < 0) {
      return '';
    }
    const nextLineOffset = lineNumber + 1 < lineOffsets.length ? lineOffsets[lineNumber + 1] : this.doc.getText().length;
    return this.doc.getText().substring(lineOffsets[lineNumber], nextLineOffset);
  }

  getLineCharCode(lineNumber: number, index: number): number {
    return this.doc.getText(Range.create(lineNumber - 1, index - 1, lineNumber - 1, index)).charCodeAt(0);
  }

  getText(range?: Range): string {
    return this.doc.getText(range);
  }
}
