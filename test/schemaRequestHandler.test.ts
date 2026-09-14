/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { schemaRequestHandler } from '../src/languageservice/services/schemaRequestHandler';
import type { SchemaRequestRetryOptions } from '../src/languageservice/services/schemaRequestHandler';
import * as sinon from 'sinon';
import * as request from 'request-light';
import type { XHRResponse } from 'request-light';
import type { Connection } from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import * as chai from 'chai';
import sinonChai from 'sinon-chai';

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

  describe('HTTP(S) schema request retries', () => {
    const sandbox = sinon.createSandbox();
    let xhrStub: sinon.SinonStub;
    let delays: number[];
    const connection = {} as Connection;

    const retryOptions = {
      delay: async (ms: number): Promise<void> => {
        delays.push(ms);
      },
    };

    const success = { responseText: '{"$schema":"http://json-schema.org/draft-07/schema"}', status: 200 } as XHRResponse;

    const doRequest = (options: SchemaRequestRetryOptions = retryOptions): Promise<string> =>
      schemaRequestHandler(
        connection,
        'https://example.com/schema.json',
        [],
        URI.parse(''),
        false,
        testFileSystem,
        false,
        options
      );

    beforeEach(() => {
      delays = [];
      xhrStub = sandbox.stub(request, 'xhr');
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should retry a transient status and return the eventual response', async () => {
      xhrStub.onFirstCall().rejects({ responseText: '', status: 429 } as XHRResponse);
      xhrStub.onSecondCall().resolves(success);

      const result = await doRequest();

      expect(xhrStub).calledTwice;
      expect(result).to.equal(success.responseText);
    });

    it('should retry connection level failures', async () => {
      xhrStub.onFirstCall().rejects({ code: 'ECONNRESET', message: 'socket hang up' });
      xhrStub.onSecondCall().resolves(success);

      const result = await doRequest();

      expect(xhrStub).calledTwice;
      expect(result).to.equal(success.responseText);
    });

    it('should not retry a permanent status', async () => {
      xhrStub.rejects({ responseText: 'Not Found', status: 404 } as XHRResponse);

      try {
        await doRequest();
        expect.fail('Expected promise to be rejected');
      } catch (err) {
        expect(err).to.equal('Not Found');
      }
      expect(xhrStub).calledOnce;
    });

    it('should give up after the retry budget is exhausted', async () => {
      xhrStub.rejects({ responseText: 'Service Unavailable', status: 503 } as XHRResponse);

      try {
        await doRequest();
        expect.fail('Expected promise to be rejected');
      } catch (err) {
        expect(err).to.equal('Service Unavailable');
      }
      // The initial attempt plus the default budget of 2 retries.
      expect(xhrStub).calledThrice;
    });

    it('should honour a Retry-After header in preference to backoff', async () => {
      xhrStub
        .onFirstCall()
        .rejects({ responseText: '', status: 429, headers: { 'retry-after': '0.5' } } as unknown as XHRResponse);
      xhrStub.onSecondCall().resolves(success);

      await doRequest();

      expect(delays).to.eql([500]);
    });

    it('should cap an excessive Retry-After value', async () => {
      xhrStub
        .onFirstCall()
        .rejects({ responseText: '', status: 429, headers: { 'retry-after': '600' } } as unknown as XHRResponse);
      xhrStub.onSecondCall().resolves(success);

      await doRequest();

      expect(delays).to.eql([1000]);
    });

    it('should back off between attempts when no Retry-After is given', async () => {
      xhrStub.rejects({ responseText: 'Service Unavailable', status: 503 } as XHRResponse);

      try {
        await doRequest();
      } catch {
        // expected once the budget is exhausted
      }

      expect(delays).to.have.length(2);
      // Exponential with jitter, each capped.
      expect(delays[0]).to.be.at.least(200).and.at.most(1000);
      expect(delays[1]).to.be.at.least(400).and.at.most(1000);
      expect(delays[1]).to.be.at.least(delays[0]);
    });

    it('should not retry when the budget is zero', async () => {
      xhrStub.rejects({ responseText: 'Too Many Requests', status: 429 } as XHRResponse);

      try {
        await doRequest({ ...retryOptions, maxRetries: 0 });
        expect.fail('Expected promise to be rejected');
      } catch (err) {
        expect(err).to.equal('Too Many Requests');
      }
      expect(xhrStub).calledOnce;
    });
  });
});
