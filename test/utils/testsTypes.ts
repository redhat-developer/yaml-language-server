/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, NotificationHandler, RequestHandler } from 'vscode-jsonrpc';
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
} from 'vscode-languageserver-protocol';
import { Connection, RemoteWorkspace } from 'vscode-languageserver/lib/common/server';

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
export class TestWorkspace implements RemoteWorkspace {
  connection: Connection;
  applyEdit(paramOrEdit: ApplyWorkspaceEditParams | WorkspaceEdit): Promise<ApplyWorkspaceEditResponse> {
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
  onDidChangeWorkspaceFolders: Event<WorkspaceFoldersChangeEvent>;
  onDidCreateFiles(handler: NotificationHandler<CreateFilesParams>): void {
    throw new Error('Method not implemented.');
  }
  onDidRenameFiles(handler: NotificationHandler<RenameFilesParams>): void {
    throw new Error('Method not implemented.');
  }
  onDidDeleteFiles(handler: NotificationHandler<DeleteFilesParams>): void {
    throw new Error('Method not implemented.');
  }
  onWillCreateFiles(handler: RequestHandler<CreateFilesParams, WorkspaceEdit, never>): void {
    throw new Error('Method not implemented.');
  }
  onWillRenameFiles(handler: RequestHandler<RenameFilesParams, WorkspaceEdit, never>): void {
    throw new Error('Method not implemented.');
  }
  onWillDeleteFiles(handler: RequestHandler<DeleteFilesParams, WorkspaceEdit, never>): void {
    throw new Error('Method not implemented.');
  }
}
