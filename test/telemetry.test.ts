/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import * as chai from 'chai';
import { checkSchemaURI } from '../src/languageservice/utils/schemaUrls';
import { Telemetry } from '../src/languageserver/telemetry';
import { URI } from 'vscode-uri';
import { Connection } from 'vscode-languageserver';

const expect = chai.expect;
chai.use(sinonChai);

describe('Telemetry Tests', () => {
  const sandbox = sinon.createSandbox();

  let telemetry: sinon.SinonStubbedInstance<Telemetry>;
  beforeEach(() => {
    const telemetryInstance = new Telemetry({} as Connection);
    telemetry = sandbox.stub(telemetryInstance);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('Kubernetos schema mapping', () => {
    it('should not report if schema is not k8s', () => {
      checkSchemaURI([], URI.parse('file:///some/path'), 'file:///some/path/to/schema.json', (telemetry as unknown) as Telemetry);
      expect(telemetry.send).not.called;
    });

    it('should report if schema is k8s', () => {
      checkSchemaURI([], URI.parse('file:///some/path'), 'kubernetes', (telemetry as unknown) as Telemetry);
      expect(telemetry.send).calledOnceWith({ name: 'yaml.schema.configured', properties: { kubernetes: true } });
    });
  });
});
