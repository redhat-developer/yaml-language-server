/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { schemaRequestHandler } from '../src/languageservice/services/schemaRequestHandler';
import * as sinon from 'sinon';
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
        testFileSystem
      );
      expect(readFileStub).calledOnceWith('c:\\some\\window\\path\\scheme.json');
      const result = await resultPromise;
      expect(result).to.be.equal('{some: "json"}');
    });

    it('UNIX URI should works', async () => {
      const connection = {} as Connection;
      const resultPromise = schemaRequestHandler(connection, '/some/unix/path/', [], URI.parse(''), false, testFileSystem);
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
        testFileSystem
      );
      expect(readFileStub).calledOnceWith(URI.file('a:/some/window/path/scheme.json').fsPath);
      const result = await resultPromise;
      expect(result).to.be.equal('{some: "json"}');
    });
  });
});
