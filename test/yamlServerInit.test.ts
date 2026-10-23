/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { it } from 'node:test';
import { StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node';
import { createConnection } from 'vscode-languageserver/node';
import { YAMLServerInit } from '../src/yamlServerInit.js';
import { SettingsState } from '../src/yamlSettings.js';
import { TestTelemetry } from './utils/testsTypes.js';

it('requests automatic completion when either YAML quote is typed', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const connection = createConnection(new StreamMessageReader(input), new StreamMessageWriter(output));
  try {
    const server = new YAMLServerInit(
      connection,
      new SettingsState(),
      { resolveRelativePath: (path) => path },
      async () => '{}',
      new TestTelemetry(connection)
    );
    const result = await server.connectionInitialized({ processId: null, rootUri: null, capabilities: {} });
    for (const quote of ['"', "'"]) {
      assert.ok(result.capabilities.completionProvider?.triggerCharacters?.includes(quote));
    }
  } finally {
    connection.dispose();
    input.destroy();
    output.destroy();
  }
});
