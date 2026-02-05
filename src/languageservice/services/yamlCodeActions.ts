/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import * as path from 'path';
import { ErrorCode } from 'vscode-json-languageservice';
import {
  CodeAction,
  CodeActionKind,
  Command,
  Diagnostic,
  Position,
  Range,
  TextEdit,
  WorkspaceEdit,
} from 'vscode-languageserver-types';
import { ClientCapabilities, CodeActionParams } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { CST, isMap, isSeq, isScalar, Scalar, visit, YAMLMap } from 'yaml';
import { SourceToken } from 'yaml/dist/parse/cst';

import { YamlCommands } from '../../commands';
import { TextBuffer } from '../utils/textBuffer';
import { toYamlStringScalar } from '../utils/yamlScalar';
import { LanguageSettings } from '../yamlLanguageService';
import { YAML_SOURCE } from '../parser/schemaValidation/baseValidator';
import { getFirstNonWhitespaceCharacterAfterOffset } from '../utils/strings';
import { matchOffsetToDocument } from '../utils/arrUtils';
import { yamlDocumentsCache } from '../parser/yaml-documents';

import { BlockStringRewriter } from '../utils/block-string-rewriter';
import { FlowStyleRewriter } from '../utils/flow-style-rewriter';

import { ASTNode } from '../jsonASTTypes';

interface YamlDiagnosticData {
  schemaUri: string[];
  values?: string[];
  properties?: string[];
}
export class YamlCodeActions {
  private indentation = '  ';
  private lineWidth = 80;

  constructor(private readonly clientCapabilities: ClientCapabilities) {}

  configure(settings: LanguageSettings, printWidth: number): void {
    this.indentation = settings.indentation;
    this.lineWidth = printWidth;
  }

  getCodeAction(document: TextDocument, params: CodeActionParams): CodeAction[] | undefined {
    if (!params.context.diagnostics) {
      return;
    }

    const result = [];

    result.push(...this.getConvertToBooleanActions(params.context.diagnostics, document));
    result.push(...this.getJumpToSchemaActions(params.context.diagnostics));
    result.push(...this.getTabToSpaceConverting(params.context.diagnostics, document));
    result.push(...this.getUnusedAnchorsDelete(params.context.diagnostics, document));
    result.push(...this.getConvertToBlockStyleActions(params.context.diagnostics, document));
    result.push(...this.getConvertStringToBlockStyleActions(params.range, document));
    result.push(...this.getKeyOrderActions(params.context.diagnostics, document));
    result.push(...this.getQuickFixForPropertyOrValueMismatch(params.context.diagnostics, document));

    return result;
  }

  private getJumpToSchemaActions(diagnostics: Diagnostic[]): CodeAction[] {
    const isOpenTextDocumentEnabled = this.clientCapabilities?.window?.showDocument?.support ?? false;
    if (!isOpenTextDocumentEnabled) {
      return [];
    }
    const schemaUriToDiagnostic = new Map<string, Diagnostic[]>();
    for (const diagnostic of diagnostics) {
      const schemaUri = (diagnostic.data as YamlDiagnosticData)?.schemaUri || [];
      for (const schemaUriStr of schemaUri) {
        if (schemaUriStr) {
          if (!schemaUriToDiagnostic.has(schemaUriStr)) {
            schemaUriToDiagnostic.set(schemaUriStr, []);
          }
          schemaUriToDiagnostic.get(schemaUriStr).push(diagnostic);
        }
      }
    }
    const result = [];
    for (const schemaUri of schemaUriToDiagnostic.keys()) {
      const action = CodeAction.create(
        l10n.t('Jump to schema location ({0})', path.basename(schemaUri)),
        Command.create('JumpToSchema', YamlCommands.JUMP_TO_SCHEMA, schemaUri)
      );
      action.diagnostics = schemaUriToDiagnostic.get(schemaUri);
      result.push(action);
    }

    return result;
  }

  private getTabToSpaceConverting(diagnostics: Diagnostic[], document: TextDocument): CodeAction[] {
    const result: CodeAction[] = [];
    const textBuff = new TextBuffer(document);
    const processedLine: number[] = [];
    for (const diag of diagnostics) {
      if (diag.message === 'Tabs are not allowed as indentation') {
        if (processedLine.includes(diag.range.start.line)) {
          continue;
        }
        const lineContent = textBuff.getLineContent(diag.range.start.line);
        let replacedTabs = 0;
        let newText = '';
        for (let i = diag.range.start.character; i <= diag.range.end.character; i++) {
          const char = lineContent.charAt(i);
          if (char !== '\t') {
            break;
          }
          replacedTabs++;
          newText += this.indentation;
        }
        processedLine.push(diag.range.start.line);

        let resultRange = diag.range;
        if (replacedTabs !== diag.range.end.character - diag.range.start.character) {
          resultRange = Range.create(
            diag.range.start,
            Position.create(diag.range.end.line, diag.range.start.character + replacedTabs)
          );
        }
        result.push(
          CodeAction.create(
            l10n.t('Convert Tab to Spaces'),
            createWorkspaceEdit(document.uri, [TextEdit.replace(resultRange, newText)]),
            CodeActionKind.QuickFix
          )
        );
      }
    }

    if (result.length !== 0) {
      const replaceEdits: TextEdit[] = [];
      for (let i = 0; i <= textBuff.getLineCount(); i++) {
        const lineContent = textBuff.getLineContent(i);
        let replacedTabs = 0;
        let newText = '';
        for (let j = 0; j < lineContent.length; j++) {
          const char = lineContent.charAt(j);

          if (char !== ' ' && char !== '\t') {
            if (replacedTabs !== 0) {
              replaceEdits.push(TextEdit.replace(Range.create(i, j - replacedTabs, i, j), newText));
              replacedTabs = 0;
              newText = '';
            }
            break;
          }

          if (char === ' ' && replacedTabs !== 0) {
            replaceEdits.push(TextEdit.replace(Range.create(i, j - replacedTabs, i, j), newText));
            replacedTabs = 0;
            newText = '';
            continue;
          }
          if (char === '\t') {
            newText += this.indentation;
            replacedTabs++;
          }
        }
        // line contains only tabs
        if (replacedTabs !== 0) {
          replaceEdits.push(TextEdit.replace(Range.create(i, 0, i, textBuff.getLineLength(i)), newText));
        }
      }
      if (replaceEdits.length > 0) {
        result.push(
          CodeAction.create(
            l10n.t('Convert all Tabs to Spaces'),
            createWorkspaceEdit(document.uri, replaceEdits),
            CodeActionKind.QuickFix
          )
        );
      }
    }

    return result;
  }

  private getUnusedAnchorsDelete(diagnostics: Diagnostic[], document: TextDocument): CodeAction[] {
    const result = [];
    const buffer = new TextBuffer(document);
    for (const diag of diagnostics) {
      if (diag.message.startsWith('Unused anchor') && diag.source === YAML_SOURCE) {
        const range = Range.create(diag.range.start, diag.range.end);
        const actual = buffer.getText(range);
        const lineContent = buffer.getLineContent(range.end.line);
        const lastWhitespaceChar = getFirstNonWhitespaceCharacterAfterOffset(lineContent, range.end.character);
        range.end.character = lastWhitespaceChar;
        const action = CodeAction.create(
          l10n.t('Delete unused anchor: {0}', actual),
          createWorkspaceEdit(document.uri, [TextEdit.del(range)]),
          CodeActionKind.QuickFix
        );
        action.diagnostics = [diag];
        result.push(action);
      }
    }
    return result;
  }

  private getConvertToBooleanActions(diagnostics: Diagnostic[], document: TextDocument): CodeAction[] {
    const results: CodeAction[] = [];
    for (const diagnostic of diagnostics) {
      if (diagnostic.message === 'Incorrect type. Expected "boolean".') {
        const value = document.getText(diagnostic.range).toLocaleLowerCase();
        if (value === '"true"' || value === '"false"' || value === "'true'" || value === "'false'") {
          const newValue = value.includes('true') ? 'true' : 'false';
          results.push(
            CodeAction.create(
              l10n.t('Convert to boolean'),
              createWorkspaceEdit(document.uri, [TextEdit.replace(diagnostic.range, newValue)]),
              CodeActionKind.QuickFix
            )
          );
        }
      }
    }
    return results;
  }

  private getConvertToBlockStyleActions(diagnostics: Diagnostic[], document: TextDocument): CodeAction[] {
    const results: CodeAction[] = [];
    for (const diagnostic of diagnostics) {
      if (diagnostic.code === 'flowMap' || diagnostic.code === 'flowSeq') {
        const node = getNodeForDiagnostic(document, diagnostic);
        if (isMap(node.internalNode) || isSeq(node.internalNode)) {
          const blockTypeDescription = isMap(node.internalNode) ? 'map' : 'sequence';
          const rewriter = new FlowStyleRewriter(this.indentation);
          results.push(
            CodeAction.create(
              l10n.t('Convert to block style {0}', blockTypeDescription),
              createWorkspaceEdit(document.uri, [TextEdit.replace(diagnostic.range, rewriter.write(node))]),
              CodeActionKind.QuickFix
            )
          );
        }
      }
    }
    return results;
  }

  private getConvertStringToBlockStyleActions(range: Range, document: TextDocument): CodeAction[] {
    const yamlDocument = yamlDocumentsCache.getYamlDocument(document);

    const startOffset: number = range ? document.offsetAt(range.start) : 0;
    const endOffset: number = range ? document.offsetAt(range.end) : Infinity;

    const results: CodeAction[] = [];
    for (const singleYamlDocument of yamlDocument.documents) {
      const matchingNodes: Scalar<string>[] = [];
      visit(singleYamlDocument.internalDocument, (key, node) => {
        if (isScalar(node)) {
          if (
            (startOffset <= node.range[0] && node.range[2] <= endOffset) ||
            (node.range[0] <= startOffset && endOffset <= node.range[2])
          ) {
            if (node.type === 'QUOTE_DOUBLE' || node.type === 'QUOTE_SINGLE') {
              if (typeof node.value === 'string' && (node.value.indexOf('\n') >= 0 || node.value.length > this.lineWidth)) {
                matchingNodes.push(<Scalar<string>>node);
              }
            }
          }
        }
      });
      for (const node of matchingNodes) {
        const range = Range.create(document.positionAt(node.range[0]), document.positionAt(node.range[2]));
        const rewriter = new BlockStringRewriter(this.indentation, this.lineWidth);
        const foldedBlockScalar = rewriter.writeFoldedBlockScalar(node);
        if (foldedBlockScalar !== null) {
          results.push(
            CodeAction.create(
              l10n.t('Convert string to folded block string'),
              createWorkspaceEdit(document.uri, [TextEdit.replace(range, foldedBlockScalar)]),
              CodeActionKind.Refactor
            )
          );
        }
        const literalBlockScalar = rewriter.writeLiteralBlockScalar(node);
        if (literalBlockScalar !== null) {
          results.push(
            CodeAction.create(
              l10n.t('Convert string to literal block string'),
              createWorkspaceEdit(document.uri, [TextEdit.replace(range, literalBlockScalar)]),
              CodeActionKind.Refactor
            )
          );
        }
      }
    }
    return results;
  }

  private getKeyOrderActions(diagnostics: Diagnostic[], document: TextDocument): CodeAction[] {
    const results: CodeAction[] = [];
    for (const diagnostic of diagnostics) {
      if (diagnostic?.code === 'mapKeyOrder') {
        let node = getNodeForDiagnostic(document, diagnostic);
        while (node && node.type !== 'object') {
          node = node.parent;
        }
        if (node && isMap(node.internalNode)) {
          const sorted: YAMLMap = structuredClone(node.internalNode);
          if (
            (sorted.srcToken.type === 'block-map' || sorted.srcToken.type === 'flow-collection') &&
            (node.internalNode.srcToken.type === 'block-map' || node.internalNode.srcToken.type === 'flow-collection')
          ) {
            sorted.srcToken.items.sort((a, b) => {
              if (a.key && b.key && CST.isScalar(a.key) && CST.isScalar(b.key)) {
                return a.key.source.localeCompare(b.key.source);
              }
              if (!a.key && b.key) {
                return -1;
              }
              if (a.key && !b.key) {
                return 1;
              }
              if (!a.key && !b.key) {
                return 0;
              }
            });

            for (let i = 0; i < sorted.srcToken.items.length; i++) {
              const item = sorted.srcToken.items[i];
              const uItem = node.internalNode.srcToken.items[i];
              item.start = uItem.start;
              if (
                item.value?.type === 'alias' ||
                item.value?.type === 'scalar' ||
                item.value?.type === 'single-quoted-scalar' ||
                item.value?.type === 'double-quoted-scalar'
              ) {
                const newLineIndex = item.value?.end?.findIndex((p) => p.type === 'newline') ?? -1;
                let newLineToken = null;
                if (uItem.value?.type === 'block-scalar') {
                  newLineToken = uItem.value?.props?.find((p) => p.type === 'newline');
                } else if (CST.isScalar(uItem.value)) {
                  newLineToken = uItem.value?.end?.find((p) => p.type === 'newline');
                }
                if (newLineToken && newLineIndex < 0) {
                  item.value.end = item.value.end ?? [];
                  item.value.end.push(newLineToken as SourceToken);
                }
                if (!newLineToken && newLineIndex > -1) {
                  item.value.end.splice(newLineIndex, 1);
                }
              } else if (item.value?.type === 'block-scalar') {
                const newline = item.value.props.find((p) => p.type === 'newline');
                if (!newline) {
                  item.value.props.push({ type: 'newline', indent: 0, offset: item.value.offset, source: '\n' } as SourceToken);
                }
              }
            }
          }
          const replaceRange = Range.create(document.positionAt(node.offset), document.positionAt(node.offset + node.length));
          results.push(
            CodeAction.create(
              l10n.t('Fix key order for this map'),
              createWorkspaceEdit(document.uri, [TextEdit.replace(replaceRange, CST.stringify(sorted.srcToken))]),
              CodeActionKind.QuickFix
            )
          );
        }
      }
    }
    return results;
  }

  /**
   * Check if diagnostic contains info for quick fix
   * Supports Enum/Const/Property mismatch
   */
  private getPossibleQuickFixValues(diagnostic: Diagnostic): string[] | undefined {
    if (typeof diagnostic.data !== 'object') {
      return;
    }
    if (
      diagnostic.code === ErrorCode.EnumValueMismatch &&
      'values' in diagnostic.data &&
      Array.isArray((diagnostic.data as YamlDiagnosticData).values)
    ) {
      return (diagnostic.data as YamlDiagnosticData).values;
    } else if (
      diagnostic.code === ErrorCode.PropertyExpected &&
      'properties' in diagnostic.data &&
      Array.isArray((diagnostic.data as YamlDiagnosticData).properties)
    ) {
      return (diagnostic.data as YamlDiagnosticData).properties;
    }
  }

  private getQuickFixForPropertyOrValueMismatch(diagnostics: Diagnostic[], document: TextDocument): CodeAction[] {
    const results: CodeAction[] = [];
    for (const diagnostic of diagnostics) {
      const values = this.getPossibleQuickFixValues(diagnostic);
      if (!values?.length) {
        continue;
      }
      for (const value of values) {
        const scalar = typeof value === 'string' ? toYamlStringScalar(value) : String(value);
        results.push(
          CodeAction.create(
            scalar,
            createWorkspaceEdit(document.uri, [TextEdit.replace(diagnostic.range, scalar)]),
            CodeActionKind.QuickFix
          )
        );
      }
    }
    return results;
  }
}

function getNodeForDiagnostic(document: TextDocument, diagnostic: Diagnostic): ASTNode {
  const yamlDocuments = yamlDocumentsCache.getYamlDocument(document);
  const startOffset = document.offsetAt(diagnostic.range.start);
  const yamlDoc = matchOffsetToDocument(startOffset, yamlDocuments);
  const node = yamlDoc.getNodeFromOffset(startOffset);
  return node;
}

function createWorkspaceEdit(uri: string, edits: TextEdit[]): WorkspaceEdit {
  const changes = {};
  changes[uri] = edits;
  const edit: WorkspaceEdit = {
    changes,
  };

  return edit;
}
