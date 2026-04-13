/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { schemaRequestHandler } from '../src/languageservice/services/schemaRequestHandler';
import * as sinon from 'sinon';
import * as request from 'request-light';
import { XHRResponse } from 'request-light';
import { Connection } from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import * as chai from 'chai';
import * as sinonChai from 'sinon-chai';

const expect = chai.expect;
chai.use(sinonChai);
import { testFileSystem } from './utils/testHelper';

describe('Schema Request Handler Tests', () => {
  describe('schemaRequestHandler', () => {
    const sandbox = sinon.createSandbox();
    let readFileStub: sinon.SinonStub;

    beforeEach(() => {
      readFileStub = sandbox.stub(testFileSystem, 'readFile');
      readFileStub.returns(Promise.resolve('{some: "json"}'));
    });

    afterEach(() => {
      sandbox.restore();
    });
    it('Should care Win URI', async () => {
      const connection = {} as Connection;
      const resultPromise = schemaRequestHandler(
        connection,
        'c:\\some\\window\\path\\scheme.json',
        [],
        URI.parse(''),
        false,
        testFileSystem,
        false
      );
      expect(readFileStub).calledOnceWith('c:\\some\\window\\path\\scheme.json');
      const result = await resultPromise;
      expect(result).to.be.equal('{some: "json"}');
    });

    it('UNIX URI should works', async () => {
      const connection = {} as Connection;
      const resultPromise = schemaRequestHandler(connection, '/some/unix/path/', [], URI.parse(''), false, testFileSystem, false);
      const result = await resultPromise;
      expect(result).to.be.equal('{some: "json"}');
    });

    it('should handle not valid Windows path', async () => {
      const connection = {} as Connection;
      const resultPromise = schemaRequestHandler(
        connection,
        'A:/some/window/path/scheme.json',
        [],
        URI.parse(''),
        false,
        testFileSystem,
        false
      );
      expect(readFileStub).calledOnceWith(URI.file('a:/some/window/path/scheme.json').fsPath);
      const result = await resultPromise;
      expect(result).to.be.equal('{some: "json"}');
    });
  });

  describe('HTTP(S) schema requests', () => {
    const sandbox = sinon.createSandbox();
    let xhrStub: sinon.SinonStub;
    const connection = {} as Connection;

    beforeEach(() => {
      xhrStub = sandbox.stub(request, 'xhr');
      xhrStub.resolves({ responseText: '{"$schema":"http://json-schema.org/draft-07/schema"}', status: 200 } as XHRResponse);
    });

    afterEach(() => {
      sandbox.restore();
      delete process.env.YAML_LANGUAGE_SERVER_VERSION;
    });

    it('should send correct User-Agent with version, Node runtime and platform', async () => {
      process.env.YAML_LANGUAGE_SERVER_VERSION = '1.0.0-test';
      await schemaRequestHandler(connection, 'https://example.com/schema.json', [], URI.parse(''), false, testFileSystem, false);

      expect(xhrStub).calledOnce;
      const { headers } = xhrStub.firstCall.args[0];
      expect(headers['User-Agent']).to.equal(
        `yaml-language-server/1.0.0-test (RedHat) node/${process.versions.node} (${process.platform})`
      );
    });

    it('should fall back to "unknown" version when YAML_LANGUAGE_SERVER_VERSION is not set', async () => {
      delete process.env.YAML_LANGUAGE_SERVER_VERSION;
      await schemaRequestHandler(connection, 'https://example.com/schema.json', [], URI.parse(''), false, testFileSystem, false);

      const { headers } = xhrStub.firstCall.args[0];
      expect(headers['User-Agent']).to.match(/^yaml-language-server\/unknown \(RedHat\)/);
    });

    it('should send User-Agent on http:// URIs as well as https://', async () => {
      process.env.YAML_LANGUAGE_SERVER_VERSION = '2.0.0';
      await schemaRequestHandler(connection, 'http://example.com/schema.json', [], URI.parse(''), false, testFileSystem, false);

      const { headers } = xhrStub.firstCall.args[0];
      expect(headers['User-Agent']).to.match(/^yaml-language-server\/2\.0\.0 \(RedHat\)/);
    });

    it('should preserve Accept-Encoding header alongside User-Agent', async () => {
      await schemaRequestHandler(connection, 'https://example.com/schema.json', [], URI.parse(''), false, testFileSystem, false);

      const { headers } = xhrStub.firstCall.args[0];
      expect(headers['Accept-Encoding']).to.equal('gzip, deflate');
    });

    it('should return the response text on success', async () => {
      const result = await schemaRequestHandler(
        connection,
        'https://example.com/schema.json',
        [],
        URI.parse(''),
        false,
        testFileSystem,
        false
      );
      expect(result).to.equal('{"$schema":"http://json-schema.org/draft-07/schema"}');
    });

    it('should reject with responseText on xhr error', async () => {
      xhrStub.rejects({ responseText: 'Not Found', status: 404 } as XHRResponse);
      try {
        await schemaRequestHandler(
          connection,
          'https://example.com/schema.json',
          [],
          URI.parse(''),
          false,
          testFileSystem,
          false
        );
        expect.fail('Expected promise to be rejected');
      } catch (err) {
        expect(err).to.equal('Not Found');
      }
    });
  });
});
