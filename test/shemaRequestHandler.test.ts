/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { schemaRequestHandler } from '../src/languageservice/services/schemaRequestHandler';
import * as sinon from 'sinon';
import * as fs from 'fs';
import { IConnection } from 'vscode-languageserver';
import * as assert from 'assert';

suite('Schema Request Handler Tests', () => {
  suite('schemaRequestHandler', () => {
    const sandbox = sinon.createSandbox();
    let readFileStub: sinon.SinonStub;

    setup(() => {
      readFileStub = sandbox.stub(fs, 'readFile');
    });

    teardown(() => {
      sandbox.restore();
    });
    test('Should care Win URI', async () => {
      const connection = <IConnection>{};
      const resultPromise = schemaRequestHandler(connection, 'c:\\some\\window\\path\\scheme.json');
      assert.ok(readFileStub.calledOnceWith('c:\\some\\window\\path\\scheme.json'));
      readFileStub.callArgWith(2, undefined, '{some: "json"}');
      const result = await resultPromise;
      assert.equal(result, '{some: "json"}');
    });

    test('UNIX URI should works', async () => {
      const connection = <IConnection>{};
      const resultPromise = schemaRequestHandler(connection, '/some/unix/path/');
      readFileStub.callArgWith(2, undefined, '{some: "json"}');
      const result = await resultPromise;
      assert.equal(result, '{some: "json"}');
    });
  });
});
