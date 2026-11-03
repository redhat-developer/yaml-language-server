/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import type { Mock } from 'node:test';
import assert from 'node:assert/strict';
import { checkSchemaURI } from '../src/languageservice/utils/schemaUrls.js';
import type { Telemetry } from '../src/languageservice/telemetry.js';
import { URI } from 'vscode-uri';

describe('Telemetry Tests', () => {
  let telemetry: Telemetry & { send: Mock<Telemetry['send']> };
  beforeEach(() => {
    telemetry = { send: mock.fn(), sendError: mock.fn(), sendTrack: mock.fn() };
  });

  afterEach(() => {
    mock.reset();
  });

  describe('Kubernetos schema mapping', () => {
    it('should not report if schema is not k8s', () => {
      checkSchemaURI([], URI.parse('file:///some/path'), 'file:///some/path/to/schema.json', telemetry);
      assert.equal(telemetry.send.mock.callCount(), 0);
    });

    it('should report if schema is k8s', () => {
      checkSchemaURI([], URI.parse('file:///some/path'), 'kubernetes', telemetry);
      assert.equal(telemetry.send.mock.callCount(), 1);
      assert.deepEqual(telemetry.send.mock.calls[0].arguments.slice(0, 1), [
        { name: 'yaml.schema.configured', properties: { kubernetes: true } },
      ]);
    });
  });
});
