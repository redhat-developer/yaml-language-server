/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  ClientCapabilities,
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Command,
  Diagnostic,
  Position,
  Range,
  TextEdit,
  WorkspaceEdit,
} from 'vscode-languageserver';
import { YamlCommands } from '../../commands';
import * as path from 'path';
import { TextBuffer } from '../utils/textBuffer';
import { LanguageSettings } from '../yamlLanguageService';

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

    result.push(...this.getJumpToSchemaActions(params.context.diagnostics));
    result.push(...this.getTabToSpaceConverting(params.context.diagnostics, document));

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
}

function createWorkspaceEdit(uri: string, edits: TextEdit[]): WorkspaceEdit {
  const changes = {};
  changes[uri] = edits;
  const edit: WorkspaceEdit = {
    changes,
  };

  return edit;
}
