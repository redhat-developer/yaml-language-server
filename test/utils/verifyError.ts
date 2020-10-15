/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentSymbol, SymbolKind, InsertTextFormat, Range } from 'vscode-languageserver-types';
import { CompletionItem, CompletionItemKind, SymbolInformation, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';

export function createExpectedError(
  message: string,
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number,
  severity: DiagnosticSeverity = 2,
  source = 'YAML'
): Diagnostic {
  return Diagnostic.create(Range.create(startLine, startCharacter, endLine, endCharacter), message, severity, undefined, source);
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
): SymbolInformation {
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
  label: string,
  insertText: string,
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number,
  kind: CompletionItemKind,
  insertTextFormat: InsertTextFormat = 2,
  extra = {}
): CompletionItem {
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
