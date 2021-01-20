/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import { CodeAction, CodeActionParams, Command, Connection, Diagnostic } from 'vscode-languageserver';
import { YamlCommands } from '../../commands';
import { CommandExecutor } from '../../languageserver/commandExecutor';
import { isIntersect as isRangesIntersect } from '../utils/ranges';
import { LATEST_DIAGNOSTIC } from './yamlValidation';

export class YamlCodeActions {
  constructor(commandExecutor: CommandExecutor, connection: Connection) {
    commandExecutor.registerCommand(YamlCommands.JUMP_TO_SCHEMA, async (param: string) => {
      let [uri] = param;
      if (!uri.startsWith('file')) {
        uri = 'json-schema' + uri.substring(uri.indexOf('://'), uri.length);
      }
      console.error(uri);
      const result = await connection.window.showDocument({ uri: uri, external: false, takeFocus: true });
      if (!result) {
        connection.window.showErrorMessage(`Cannot open ${uri}`);
      }
    });
  }

  getCodeAction(document: TextDocument, params: CodeActionParams): CodeAction[] | undefined {
    const diagnostics = LATEST_DIAGNOSTIC.get(document.uri);
    if (!diagnostics || diagnostics.length === 0) {
      return;
    }
    const schemaUriToDiagnostic = new Map<string, Diagnostic[]>();

    for (const diagnostic of diagnostics) {
      const schemaUri = diagnostic.schemaUri;
      if (
        schemaUri &&
        (schemaUri.startsWith('file') || schemaUri.startsWith('https')) &&
        isRangesIntersect(params.range, diagnostic.range)
      ) {
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
