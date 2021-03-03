/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentSymbol, SymbolKind, InsertTextFormat, Range } from 'vscode-languageserver-types';
import { CompletionItem, CompletionItemKind, SymbolInformation, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ErrorCode } from 'vscode-json-languageservice';

export function createExpectedError(
  message: string,
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number,
  severity: DiagnosticSeverity = 1,
  source = 'YAML',
  code = ErrorCode.Undefined
): Diagnostic {
  return Diagnostic.create(Range.create(startLine, startCharacter, endLine, endCharacter), message, severity, code, source);
}

export function createDiagnosticWithData(
  message: string,
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number,
  severity: DiagnosticSeverity = 1,
  source = 'YAML',
  schemaUri: string | string[]
): Diagnostic {
  const diagnostic: Diagnostic = createExpectedError(message, startLine, startCharacter, endLine, endCharacter, severity, source);
  diagnostic.data = { schemaUri: typeof schemaUri === 'string' ? [schemaUri] : schemaUri };
  return diagnostic;
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
  children: DocumentSymbol[] = [],
  detail?: string
): DocumentSymbol {
  const docSymbol = DocumentSymbol.create(
    name,
    detail,
    kind,
    Range.create(startLine, startCharacter, endLine, endCharacter),
    Range.create(startLineSelection, startCharacterSelection, endLineSelection, endCharacterSelection),
    children
  );

  return docSymbol;
}

export function createExpectedDocumentSymbolNoDetail(
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
  const docSymbol = DocumentSymbol.create(
    name,
    undefined,
    kind,
    Range.create(startLine, startCharacter, endLine, endCharacter),
    Range.create(startLineSelection, startCharacterSelection, endLineSelection, endCharacterSelection),
    children
  );

  delete docSymbol.detail;
  return docSymbol;
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
