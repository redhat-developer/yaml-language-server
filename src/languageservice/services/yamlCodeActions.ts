/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClientCapabilities, CodeAction, CodeActionParams, Command, Connection, Diagnostic } from 'vscode-languageserver';
import { YamlCommands } from '../../commands';
import * as path from 'path';
import { CommandExecutor } from '../../languageserver/commandExecutor';
import { Globals } from '../utils/jigx/globals';

interface YamlDiagnosticData {
  schemaUri: string[];
}
export class YamlCodeActions {
  constructor(commandExecutor: CommandExecutor, connection: Connection, private readonly clientCapabilities: ClientCapabilities) {
    commandExecutor.registerCommand(YamlCommands.JUMP_TO_SCHEMA, async (uri: string) => {
      if (!uri) {
        return;
      }
      if (!uri.startsWith('file') && !uri.startsWith(Globals.dynamicSchema)) {
        uri = 'json-schema' + uri.substring(uri.indexOf('://'), uri.length);
      }

      const result = await connection.window.showDocument({ uri: uri, external: false, takeFocus: true });
      if (!result) {
        connection.window.showErrorMessage(`Cannot open ${uri}`);
      }
    });
  }

  getCodeAction(document: TextDocument, params: CodeActionParams): CodeAction[] | undefined {
    if (!params.context.diagnostics) {
      return;
    }

    const result = [];

    result.push(...this.getJumpToSchemaActions(params.context.diagnostics));

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
        if (
          schemaUriStr &&
          (schemaUriStr.startsWith('file') || schemaUriStr.startsWith('https') || schemaUriStr.startsWith(Globals.dynamicSchema))
        ) {
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
}
