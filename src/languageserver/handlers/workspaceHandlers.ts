/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExecuteCommandParams, Connection } from 'vscode-languageserver';
import { CommandExecutor } from '../commandExecutor';

export class WorkspaceHandlers {
  constructor(private readonly connection: Connection, private readonly commandExecutor: CommandExecutor) {}

  registerHandlers(): void {
    this.connection.onExecuteCommand((params) => this.executeCommand(params));
  }

  private executeCommand(params: ExecuteCommandParams): void {
    return this.commandExecutor.executeCommand(params);
  }
}
