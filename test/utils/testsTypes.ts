/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, Event, NotificationHandler, RequestHandler } from 'vscode-jsonrpc';
import {
  ApplyWorkspaceEditParams,
  WorkspaceEdit,
  ApplyWorkspaceEditResponse,
  ConfigurationItem,
  WorkspaceFolder,
  WorkspaceFoldersChangeEvent,
  CreateFilesParams,
  RenameFilesParams,
  DeleteFilesParams,
  ClientCapabilities,
  ServerCapabilities,
} from 'vscode-languageserver-protocol';
import { Connection, RemoteWorkspace } from 'vscode-languageserver';
import { TelemetryImpl } from '../../src/languageserver/telemetry';
import { TelemetryEvent } from '../../src/languageservice/telemetry';

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
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
