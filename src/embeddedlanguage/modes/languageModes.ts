/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  CompletionItem,
  CompletionList,
  Definition,
  Hover,
  Position,
  Range,
  SignatureHelp,
  WorkspaceFolder,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Telemetry } from '../../languageservice/telemetry';
import { LanguageModelCache, getLanguageModelCache } from '../languageModelCache';
import { YamlEmbeddedDocument, getYamlEmbeddedDocument } from './embeddedSupport';
import { getJavaScriptMode } from './javascriptMode';

export {
  Color,
  ColorInformation,
  ColorPresentation,
  CompletionItem,
  CompletionItemKind,
  CompletionList,
  Definition,
  Diagnostic,
  DiagnosticSeverity,
  DocumentHighlight,
  DocumentHighlightKind,
  DocumentLink,
  FoldingRange,
  FoldingRangeKind,
  FormattingOptions,
  Hover,
  Location,
  ParameterInformation,
  Position,
  Range,
  SelectionRange,
  SignatureHelp,
  SignatureInformation,
  SymbolInformation,
  SymbolKind,
  TextDocumentIdentifier,
  TextEdit,
  WorkspaceEdit,
  WorkspaceFolder,
} from 'vscode-languageserver';

export { TextDocument } from 'vscode-languageserver-textdocument';

export interface Workspace {
  readonly folders: WorkspaceFolder[];
  readonly root: string;
}

export interface SemanticTokenData {
  start: Position;
  length: number;
  typeIdx: number;
  modifierSet: number;
}

export type CompletionItemData = {
  languageId: string;
  uri: string;
  offset: number;
};

export function isCompletionItemData(value: any): value is CompletionItemData {
  return value && typeof value.languageId === 'string' && typeof value.uri === 'string' && typeof value.offset === 'number';
}

export interface LanguageMode {
  getId(): string;
  // getSelectionRange?: (document: TextDocument, position: Position) => Promise<SelectionRange>;
  // doValidation?: (document: TextDocument) => Promise<Diagnostic[]>;
  doComplete?: (document: TextDocument, position: Position) => Promise<CompletionList>;
  doResolve?: (document: TextDocument, item: CompletionItem) => Promise<CompletionItem>;
  doHover?: (document: TextDocument, position: Position) => Promise<Hover | null>;
  doSignatureHelp?: (document: TextDocument, position: Position) => Promise<SignatureHelp | null>;
  // doRename?: (document: TextDocument, position: Position, newName: string) => Promise<WorkspaceEdit | null>;
  // doLinkedEditing?: (document: TextDocument, position: Position) => Promise<Range[] | null>;
  // findDocumentHighlight?: (document: TextDocument, position: Position) => Promise<DocumentHighlight[]>;
  // findDocumentSymbols?: (document: TextDocument) => Promise<SymbolInformation[]>;
  // findDocumentLinks?: (document: TextDocument, documentContext: DocumentContext) => Promise<DocumentLink[]>;
  findDefinition?: (document: TextDocument, position: Position) => Promise<Definition | null>;
  // findReferences?: (document: TextDocument, position: Position) => Promise<Location[]>;
  // format?: (document: TextDocument, range: Range, options: FormattingOptions) => Promise<TextEdit[]>;
  // findDocumentColors?: (document: TextDocument) => Promise<ColorInformation[]>;
  // getColorPresentations?: (document: TextDocument, color: Color, range: Range) => Promise<ColorPresentation[]>;
  // doAutoInsert?: (document: TextDocument, position: Position, kind: 'autoClose' | 'autoQuote') => Promise<string | null>;
  // findMatchingTagPosition?: (document: TextDocument, position: Position) => Promise<Position | null>;
  // getFoldingRanges?: (document: TextDocument) => Promise<FoldingRange[]>;
  // onDocumentRemoved(document: TextDocument): void;
  // getSemanticTokens?(document: TextDocument): Promise<SemanticTokenData[]>;
  // getSemanticTokenLegend?(): { types: string[]; modifiers: string[] };
  dispose(): void;
}

export interface LanguageModes {
  getModeAtPosition(document: TextDocument, position: Position): LanguageMode | undefined;
  onDocumentRemoved(document: TextDocument): void;
  dispose(): void;
}

export interface LanguageModeRange extends Range {
  mode: LanguageMode | undefined;
  attributeValue?: boolean;
}

export function getLanguageModes(workspace: Workspace, telemetry: Telemetry): LanguageModes {
  const yamlEmbeddedDocument = getLanguageModelCache<YamlEmbeddedDocument>(10, 60, (document) =>
    getYamlEmbeddedDocument(document, workspace, telemetry)
  );

  let modelCaches: LanguageModelCache<any>[] = [];
  modelCaches.push(yamlEmbeddedDocument);

  let modes = Object.create(null);

  modes['javascript'] = getJavaScriptMode('javascript', workspace);

  return {
    getModeAtPosition(document: TextDocument, position: Position): LanguageMode | undefined {
      const languageId = yamlEmbeddedDocument.get(document).getLanguageAtPosition(position);
      // const languageId = getYamlEmbeddedDocument(document, workspace, telemetry).getLanguageAtPosition(position);

      if (languageId) {
        return modes[languageId];
      }
      return undefined;
    },
    onDocumentRemoved(document: TextDocument) {
      modelCaches.forEach((mc) => mc.onDocumentRemoved(document));
      for (const mode in modes) {
        modes[mode].onDocumentRemoved(document);
      }
    },
    dispose(): void {
      modelCaches.forEach((mc) => mc.dispose());
      modelCaches = [];
      for (const mode in modes) {
        modes[mode].dispose();
      }
      modes = {};
    },
  };
}
