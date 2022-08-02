/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
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
import { YamlCommands } from '../../commands';
import * as path from 'path';
import { TextBuffer } from '../utils/textBuffer';
import { LanguageSettings } from '../yamlLanguageService';
import { YAML_SOURCE } from '../parser/jsonParser07';
import { getFirstNonWhitespaceCharacterAfterOffset } from '../utils/strings';
import { matchOffsetToDocument } from '../utils/arrUtils';
import { isMap, isSeq } from 'yaml';
import { yamlDocumentsCache } from '../parser/yaml-documents';
import { FlowStyleRewriter } from '../utils/flow-style-rewriter';

interface YamlDiagnosticData {
  schemaUri: string[];
}
export class YamlCodeActions {
  private indentation = '  ';

  constructor(private readonly clientCapabilities: ClientCapabilities) {}

  configure(settings: LanguageSettings): void {
    this.indentation = settings.indentation;
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
        `Jump to schema location (${path.basename(schemaUri)})`,
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
      if (diag.message === 'Using tabs can lead to unpredictable results') {
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
            'Convert Tab to Spaces',
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
            'Convert all Tabs to Spaces',
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
          `Delete unused anchor: ${actual}`,
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
              'Convert to boolean',
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
        const yamlDocuments = yamlDocumentsCache.getYamlDocument(document);
        const startOffset = document.offsetAt(diagnostic.range.start);
        const yamlDoc = matchOffsetToDocument(startOffset, yamlDocuments);
        const node = yamlDoc.getNodeFromOffset(startOffset);
        if (isMap(node.internalNode) || isSeq(node.internalNode)) {
          const blockTypeDescription = isMap(node.internalNode) ? 'map' : 'sequence';
          const rewriter = new FlowStyleRewriter(this.indentation);
          results.push(
            CodeAction.create(
              `Convert to block style ${blockTypeDescription}`,
              createWorkspaceEdit(document.uri, [TextEdit.replace(diagnostic.range, rewriter.write(node))]),
              CodeActionKind.QuickFix
            )
          );
        }
      }
    }
    return results;
  }
}

function createWorkspaceEdit(uri: string, edits: TextEdit[]): WorkspaceEdit {
  const changes = {};
  changes[uri] = edits;
  const edit: WorkspaceEdit = {
    changes,
  };

  return edit;
}
