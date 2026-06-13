/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Disposable, Event, NotificationHandler, RequestHandler } from 'vscode-jsonrpc';
import type { Connection, RemoteWorkspace } from 'vscode-languageserver';
import type {
  ApplyWorkspaceEditParams,
  ApplyWorkspaceEditResponse,
  ClientCapabilities,
  ConfigurationItem,
  CreateFilesParams,
  DeleteFilesParams,
  RenameFilesParams,
  ServerCapabilities,
  WorkspaceEdit,
  WorkspaceFolder,
  WorkspaceFoldersChangeEvent,
} from 'vscode-languageserver-protocol';

import type { TelemetryEvent } from '../../src/languageservice/telemetry';

import { TelemetryImpl } from '../../src/languageserver/telemetry';

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
export class TestWorkspace implements RemoteWorkspace {
  connection: Connection;
  applyEdit(paramOrEdit: ApplyWorkspaceEditParams | WorkspaceEdit): Promise<ApplyWorkspaceEditResponse> {
    throw new Error('Method not implemented.');
  }
  fillServerCapabilities(capabilities: ServerCapabilities<any>): void {
    throw new Error('Method not implemented.');
  }
  getConfiguration(): Promise<any>;
  getConfiguration(section: string): Promise<any>;
  getConfiguration(item: ConfigurationItem): Promise<any>;
  getConfiguration(items: ConfigurationItem[]): Promise<any[]>;
  getConfiguration(items?: any): Promise<any | any[]> {
    throw new Error('Method not implemented.');
  }
  getWorkspaceFolders(): Promise<WorkspaceFolder[]> {
    throw new Error('Method not implemented.');
  }
  initialize(capabilities: ClientCapabilities): void {
    throw new Error('Method not implemented.');
  }
  onDidChangeWorkspaceFolders: Event<WorkspaceFoldersChangeEvent>;
  onDidCreateFiles(handler: NotificationHandler<CreateFilesParams>): Disposable {
    throw new Error('Method not implemented.');
  }
  onDidRenameFiles(handler: NotificationHandler<RenameFilesParams>): Disposable {
    throw new Error('Method not implemented.');
  }
  onDidDeleteFiles(handler: NotificationHandler<DeleteFilesParams>): Disposable {
    throw new Error('Method not implemented.');
  }
  onWillCreateFiles(handler: RequestHandler<CreateFilesParams, WorkspaceEdit, never>): Disposable {
    throw new Error('Method not implemented.');
  }
  onWillRenameFiles(handler: RequestHandler<RenameFilesParams, WorkspaceEdit, never>): Disposable {
    throw new Error('Method not implemented.');
  }
  onWillDeleteFiles(handler: RequestHandler<DeleteFilesParams, WorkspaceEdit, never>): Disposable {
    throw new Error('Method not implemented.');
  }
}

export class TestTelemetry extends TelemetryImpl {
  messages: TelemetryEvent[] = [];
  constructor(connection: Connection) {
    super(connection);
  }
  send(event: TelemetryEvent): void {
    this.messages.push(event);
  }

  clearMessages(): void {
    this.messages = [];
  }
}
