/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import { CodeAction, CodeActionParams, Command, Connection, Diagnostic } from 'vscode-languageserver';
import { YamlCommands } from '../../commands';
import { CommandExecutor } from '../../languageserver/commandExecutor';

interface YamlDiagnosticData {
  schemaUri: string;
}
export class YamlCodeActions {
  constructor(commandExecutor: CommandExecutor, connection: Connection) {
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

  getCodeAction(document: TextDocument, params: CodeActionParams): CodeAction[] | undefined {
    if (!params.context.diagnostics) {
      return;
    }
    const schemaUriToDiagnostic = new Map<string, Diagnostic[]>();
    for (const diagnostic of params.context.diagnostics) {
      const schemaUri = (diagnostic.data as YamlDiagnosticData)?.schemaUri;
      if (schemaUri && (schemaUri.startsWith('file') || schemaUri.startsWith('https'))) {
        if (!schemaUriToDiagnostic.has(schemaUri)) {
          schemaUriToDiagnostic.set(schemaUri, []);
        }
        schemaUriToDiagnostic.get(schemaUri).push(diagnostic);
      }
    }
    const result = [];
    for (const schemaUri of schemaUriToDiagnostic.keys()) {
      const action = CodeAction.create(
        'Jump to schema location',
        Command.create('JumpToSchema', YamlCommands.JUMP_TO_SCHEMA, schemaUri)
      );
      action.diagnostics = schemaUriToDiagnostic.get(schemaUri);
      result.push(action);
    }

    return result;
  }
}
