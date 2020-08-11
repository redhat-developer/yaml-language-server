/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentSymbol, SymbolKind } from 'vscode-languageserver-types';

export function createExpectedError(
  message: string,
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number,
  severity = 2
) {
  return {
    message,
    range: {
      start: {
        line: startLine,
        character: startCharacter,
      },
      end: {
        line: endLine,
        character: endCharacter,
      },
    },
    severity,
  };
}

export function createExpectedSymbolInformation(
  name: string,
  kind: SymbolKind,
  containerName: string | undefined,
  uri: string,
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number
) {
  return {
    name,
    kind,
    containerName,
    location: {
      uri,
      range: {
        start: {
          line: startLine,
          character: startCharacter,
        },
        end: {
          line: endLine,
          character: endCharacter,
        },
      },
    },
  };
}

export function createExpectedDocumentSymbol(
  name: string,
  kind: SymbolKind,
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number,
  startLineSelection: number,
  startCharacterSelection: number,
  endLineSelection: number,
  endCharacterSelection: number,
  children: DocumentSymbol[] = []
): DocumentSymbol {
  return {
    name,
    kind,
    range: {
      start: {
        character: startCharacter,
        line: startLine,
      },
      end: {
        character: endCharacter,
        line: endLine,
      },
    },
    selectionRange: {
      start: {
        character: startCharacterSelection,
        line: startLineSelection,
      },
      end: {
        character: endCharacterSelection,
        line: endLineSelection,
      },
    },
    children,
  };
}

export function createExpectedCompletion(
  label: string | number,
  insertText: string | number,
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number,
  kind: number,
  insertTextFormat = 2,
  extra = {}
) {
  return {
    ...{
      insertText,
      label,
      insertTextFormat,
      kind,
      textEdit: {
        newText: insertText,
        range: {
          start: {
            line: startLine,
            character: startCharacter,
          },
          end: {
            line: endLine,
            character: endCharacter,
          },
        },
      },
    },
    ...extra,
  };
}
