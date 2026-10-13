/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import type { Mock } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import assert from 'node:assert/strict';

import { registerCommands } from '../src/languageservice/services/yamlCommands.js';
import { commandExecutor } from '../src/languageserver/commandExecutor.js';
import type { Connection } from 'vscode-languageserver';
import { URI } from 'vscode-uri';

describe('Yaml Commands', () => {
  const JSON_SCHEMA_LOCAL = 'file://some/path/schema.json';

  let commandExecutorStub: Mock<typeof commandExecutor.registerCommand>;

  beforeEach(() => {
    commandExecutorStub = mock.method(commandExecutor, 'registerCommand', () => undefined);
  });

  afterEach(() => {
    mock.reset();
  });

  it('should register handler for "JumpToSchema" command', () => {
    registerCommands(commandExecutor, {} as Connection);
    assert.equal(commandExecutorStub.mock.calls[0].arguments[0], 'jumpToSchema');
    assert.equal(typeof commandExecutorStub.mock.calls[0].arguments[1], 'function');
  });

  it('JumpToSchema handler should call "showDocument"', async () => {
    const showDocumentStub = mock.fn(async () => ({ success: true }));
    const getWorkspaceFoldersStub = mock.fn(() => Promise.resolve([]));
    const connection = {
      window: {
        showDocument: showDocumentStub,
      },
      workspace: {
        getWorkspaceFolders: getWorkspaceFoldersStub,
      },
    } as unknown as Connection;
    registerCommands(commandExecutor, connection);
    const arg = commandExecutorStub.mock.calls[0].arguments;
    await arg[1](JSON_SCHEMA_LOCAL);
    assert.ok(
      showDocumentStub.mock.calls.some((call) =>
        isDeepStrictEqual(call.arguments.slice(0, 1), [{ uri: JSON_SCHEMA_LOCAL, external: false, takeFocus: true }])
      )
    );
  });

  it('JumpToSchema handler should call "showDocument" with plain win path', async () => {
    const showDocumentStub = mock.fn(async () => ({ success: true }));
    const getWorkspaceFoldersStub = mock.fn(() => Promise.resolve([]));
    const connection = {
      window: {
        showDocument: showDocumentStub,
      },
      workspace: {
        getWorkspaceFolders: getWorkspaceFoldersStub,
      },
    } as unknown as Connection;
    registerCommands(commandExecutor, connection);
    const arg = commandExecutorStub.mock.calls[0].arguments;
    await arg[1]('a:\\some\\path\\to\\schema.json');
    assert.ok(
      showDocumentStub.mock.calls.some((call) =>
        isDeepStrictEqual(call.arguments.slice(0, 1), [
          {
            uri: URI.file('a:\\some\\path\\to\\schema.json').toString(),
            external: false,
            takeFocus: true,
          },
        ])
      )
    );
  });

  it('JumpToSchema handler should call "showDocument" with plain POSIX path', async () => {
    const showDocumentStub = mock.fn(async () => ({ success: true }));
    const getWorkspaceFoldersStub = mock.fn(() => Promise.resolve([]));
    const connection = {
      window: {
        showDocument: showDocumentStub,
      },
      workspace: {
        getWorkspaceFolders: getWorkspaceFoldersStub,
      },
    } as unknown as Connection;
    registerCommands(commandExecutor, connection);
    const arg = commandExecutorStub.mock.calls[0].arguments;
    await arg[1]('/some/path/to/schema.json');
    assert.ok(
      showDocumentStub.mock.calls.some((call) =>
        isDeepStrictEqual(call.arguments.slice(0, 1), [
          {
            uri: URI.file('/some/path/to/schema.json').toString(),
            external: false,
            takeFocus: true,
          },
        ])
      )
    );
  });

  it('JumpToSchema handler should call "showDocument" with custom web schema', async () => {
    const showDocumentStub = mock.fn(async () => ({ success: true }));
    const getWorkspaceFoldersStub = mock.fn(() => Promise.resolve([{ uri: 'vscode-test:///root/' }]));
    const connection = {
      window: {
        showDocument: showDocumentStub,
      },
      workspace: {
        getWorkspaceFolders: getWorkspaceFoldersStub,
      },
    } as unknown as Connection;
    registerCommands(commandExecutor, connection);
    const arg = commandExecutorStub.mock.calls[0].arguments;
    await arg[1]('my-file.json');
    assert.ok(
      showDocumentStub.mock.calls.some((call) =>
        isDeepStrictEqual(call.arguments.slice(0, 1), [
          {
            uri: URI.parse('vscode-test:///root/my-file.json').toString(),
            external: false,
            takeFocus: true,
          },
        ])
      )
    );
  });
});
