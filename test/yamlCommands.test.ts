/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import * as chai from 'chai';
import { registerCommands } from '../src/languageservice/services/yamlCommands';
import { commandExecutor } from '../src/languageserver/commandExecutor';
import { Connection } from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';

const expect = chai.expect;
chai.use(sinonChai);

describe('Yaml Commands', () => {
  const JSON_SCHEMA_LOCAL = 'file://some/path/schema.json';
  const sandbox = sinon.createSandbox();

  let commandExecutorStub: sinon.SinonStub;

  beforeEach(() => {
    commandExecutorStub = sandbox.stub(commandExecutor, 'registerCommand');
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should register handler for "JumpToSchema" command', () => {
    registerCommands(commandExecutor, {} as Connection);
    expect(commandExecutorStub).to.have.been.calledWithMatch(sinon.match('jumpToSchema'), sinon.match.func);
  });

  it('JumpToSchema handler should call "showDocument"', async () => {
    const showDocumentStub = sandbox.stub();
    const connection = ({
      window: {
        showDocument: showDocumentStub,
      },
    } as unknown) as Connection;
    showDocumentStub.resolves(true);
    registerCommands(commandExecutor, connection);
    const arg = commandExecutorStub.args[0];
    await arg[1](JSON_SCHEMA_LOCAL);
    expect(showDocumentStub).to.have.been.calledWith({ uri: JSON_SCHEMA_LOCAL, external: false, takeFocus: true });
  });

  it('JumpToSchema handler should call "showDocument" with plain win path', async () => {
    const showDocumentStub = sandbox.stub();
    const connection = ({
      window: {
        showDocument: showDocumentStub,
      },
    } as unknown) as Connection;
    showDocumentStub.resolves(true);
    registerCommands(commandExecutor, connection);
    const arg = commandExecutorStub.args[0];
    await arg[1]('a:\\some\\path\\to\\schema.json');
    expect(showDocumentStub).to.have.been.calledWith({
      uri: URI.file('a:\\some\\path\\to\\schema.json').toString(),
      external: false,
      takeFocus: true,
    });
  });
});
