/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Connection } from 'vscode-languageserver';
import { YamlCommands } from '../../commands';
import { CommandExecutor } from '../../languageserver/commandExecutor';
import { URI } from 'vscode-uri';

export function registerCommands(commandExecutor: CommandExecutor, connection: Connection): void {
  commandExecutor.registerCommand(YamlCommands.JUMP_TO_SCHEMA, async (uri: string) => {
    if (!uri) {
      return;
    }
    const wsFolders = await connection.workspace.getWorkspaceFolders();

    if (uri.indexOf(':') < 0 && !uri.startsWith('/')) {
      if (wsFolders.length === 1) {
        const wsUri = URI.parse(wsFolders[0].uri);
        uri = wsUri.with({ path: wsUri.path + uri }).toString();
      }
    } else if (uri.startsWith('file://') && wsFolders.length === 1 && URI.parse(wsFolders[0].uri).scheme != 'file') {
      const wsUri = URI.parse(wsFolders[0].uri);
      const pathFromUri = URI.parse(uri).path;
      uri = wsUri.with({ path: pathFromUri }).toString();
    } else if (!uri.startsWith('file') && !uri.startsWith('/') && !/^[a-z]:[\\/]/i.test(uri)) {
      // if uri points to local file of its a windows path
      const origUri = URI.parse(uri);
      const customUri = URI.from({
        scheme: 'json-schema',
        authority: origUri.authority,
        path: origUri.path.endsWith('.json') ? origUri.path : origUri.path + '.json',
        fragment: uri,
      });
      uri = customUri.toString();
    }

    // test if uri is a plain local file path and convert it to URI
    if (uri.startsWith('/') || /^[a-z]:[\\/]/i.test(uri)) {
      const fileUri = URI.file(uri);
      uri = fileUri.toString();
    }

    const result = await connection.window.showDocument({ uri: uri, external: false, takeFocus: true });
    if (!result) {
      connection.window.showErrorMessage(`Cannot open ${uri}`);
    }
  });
}
