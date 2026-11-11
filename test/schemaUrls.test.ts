/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Connection } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { getLanguageService } from '../src/index.js';
import { schemaRequestHandler, workspaceContext } from '../src/languageservice/services/schemaRequestHandler.js';
import type { Telemetry } from '../src/languageservice/telemetry.js';
import { checkSchemaURI } from '../src/languageservice/utils/schemaUrls.js';

const telemetry = { send: () => undefined } as unknown as Telemetry;

describe('Schema URI fragments', () => {
  const root = URI.file(join(tmpdir(), 'schema-workspace'));
  const cases = [
    { name: 'relative JSON pointer', uri: './schemas/shared.json#/definitions/job', fragment: '#/definitions/job' },
    { name: 'relative anchor', uri: './schemas/shared.json#job', fragment: '#job' },
    { name: 'empty fragment', uri: './schemas/shared.json#', fragment: '#' },
    { name: 'no fragment', uri: './schemas/shared.json', fragment: '' },
  ];

  for (const { name, uri, fragment } of cases) {
    it(`resolves a ${name} from the workspace root`, () => {
      assert.equal(
        checkSchemaURI([], root, uri, telemetry),
        URI.file(join(root.fsPath, 'schemas', 'shared.json')).toString() + fragment
      );
    });
  }

  it('resolves a named workspace folder and preserves the JSON pointer', () => {
    const folder = URI.file(join(root.fsPath, 'project-a'));
    assert.equal(
      checkSchemaURI([{ name: 'project-a', uri: folder.toString() }], root, 'project-a/shared.json#/definitions/job', telemetry),
      URI.file(join(folder.fsPath, 'shared.json')).toString() + '#/definitions/job'
    );
  });

  it('does not change an existing URI with a fragment', () => {
    for (const uri of ['https://example.com/shared.json#/definitions/job', root.toString() + '/shared.json#job']) {
      assert.equal(checkSchemaURI([], root, uri, telemetry), uri);
    }
  });

  it('validates YAML against a fragment of a real workspace-relative schema', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'yaml-relative-fragment-'));
    try {
      await mkdir(join(directory, 'schemas'));
      await writeFile(
        join(directory, 'schemas', 'shared.json'),
        JSON.stringify({ definitions: { job: { type: 'object', properties: { count: { type: 'integer' } } } } })
      );
      const workspaceRoot = URI.file(directory);
      const connection = {
        sendRequest: () => assert.fail('A local schema must not use a custom content request'),
      } as unknown as Connection;
      const service = getLanguageService({
        workspaceContext,
        schemaRequestService: (uri) =>
          schemaRequestHandler(connection, uri, [], workspaceRoot, false, { readFile: (path) => readFile(path, 'utf8') }, false),
      });
      service.configure({
        validate: true,
        schemas: [
          {
            uri: checkSchemaURI([], workspaceRoot, './schemas/shared.json#/definitions/job', telemetry),
            fileMatch: ['*.yaml'],
          },
        ],
      });
      const uri = URI.file(join(directory, 'test.yaml')).toString();
      const invalid = await service.doValidation(TextDocument.create(uri, 'yaml', 1, 'count: incorrect'), false);
      assert.equal(invalid.length, 1);
      assert.equal(invalid[0].message, 'Incorrect type. Expected "integer".');
      const valid = await service.doValidation(TextDocument.create(uri, 'yaml', 2, 'count: 3'), false);
      assert.deepEqual(valid, []);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
