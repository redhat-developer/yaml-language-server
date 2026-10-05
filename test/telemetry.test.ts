/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, beforeEach, afterEach } from 'node:test';
import type { SinonStubbedInstance } from 'sinon';
import { createSandbox } from 'sinon';
import sinonChai from 'sinon-chai';
import * as chai from 'chai';
import { checkSchemaURI } from '../src/languageservice/utils/schemaUrls.js';
import { TelemetryImpl } from '../src/languageserver/telemetry.js';
import { URI } from 'vscode-uri';
import type { Connection } from 'vscode-languageserver';

const expect = chai.expect;
chai.use(sinonChai);

describe('Telemetry Tests', () => {
  const sandbox = createSandbox();

  let telemetry: SinonStubbedInstance<TelemetryImpl>;
  beforeEach(() => {
    const telemetryInstance = new TelemetryImpl({} as Connection);
    telemetry = sandbox.stub(telemetryInstance);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('Kubernetos schema mapping', () => {
    it('should not report if schema is not k8s', () => {
      checkSchemaURI([], URI.parse('file:///some/path'), 'file:///some/path/to/schema.json', telemetry);
      expect(telemetry.send).not.called;
    });

    it('should report if schema is k8s', () => {
      checkSchemaURI([], URI.parse('file:///some/path'), 'kubernetes', telemetry);
      expect(telemetry.send).calledOnceWith({ name: 'yaml.schema.configured', properties: { kubernetes: true } });
    });
  });
});
