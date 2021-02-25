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
  Connection,
  Diagnostic,
  Position,
  Range,
  TextEdit,
  WorkspaceEdit,
} from 'vscode-languageserver';
import { YamlCommands } from '../../commands';
import * as path from 'path';
import { CommandExecutor } from '../../languageserver/commandExecutor';
import { TextBuffer } from '../utils/textBuffer';
import { LanguageSettings } from '../yamlLanguageService';

interface YamlDiagnosticData {
  schemaUri: string[];
}
export class YamlCodeActions {
  private indentation = '  ';

  constructor(commandExecutor: CommandExecutor, connection: Connection, private readonly clientCapabilities: ClientCapabilities) {
    commandExecutor.registerCommand(YamlCommands.JUMP_TO_SCHEMA, async (uri: string) => {
      if (!uri) {
        return;
      }
      if (!uri.startsWith('file')) {
        uri = 'json-schema' + uri.substring(uri.indexOf('://'), uri.length);
      }

      const result = await connection.window.showDocument({ uri: uri, external: false, takeFocus: true });
      if (!result) {
        connection.window.showErrorMessage(`Cannot open ${uri}`);
      }
    });
  }

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
        if (schemaUriStr && (schemaUriStr.startsWith('file') || schemaUriStr.startsWith('https'))) {
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
        const changes = {};
        let resultRange = diag.range;
        if (replacedTabs !== diag.range.end.character - diag.range.start.character) {
          resultRange = Range.create(
            diag.range.start,
            Position.create(diag.range.end.line, diag.range.start.character + replacedTabs)
          );
        }
        changes[document.uri] = [TextEdit.replace(resultRange, newText)];
        const edit: WorkspaceEdit = {
          changes,
        };
        result.push(CodeAction.create('Convert Tab to Spaces', edit, CodeActionKind.QuickFix));
      }
    }

    return result;
  }
}
