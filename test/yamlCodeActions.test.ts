/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import * as chai from 'chai';
import { commandExecutor } from '../src/languageserver/commandExecutor';
import { YamlCodeActions } from '../src/languageservice/services/yamlCodeActions';
import {
  ClientCapabilities,
  CodeAction,
  CodeActionContext,
  CodeActionParams,
  Command,
  Connection,
  TextDocumentIdentifier,
} from 'vscode-languageserver';
import { setupTextDocument, TEST_URI } from './utils/testHelper';
import { createDiagnosticWithData } from './utils/verifyError';
import { YamlCommands } from '../src/commands';

const expect = chai.expect;
chai.use(sinonChai);

const JSON_SCHEMA_LOCAL = 'file://some/path/schema.json';

describe('CodeActions Tests', () => {
  const sandbox = sinon.createSandbox();

  let commandExecutorStub: sinon.SinonStub;
  let clientCapabilities: ClientCapabilities;
  beforeEach(() => {
    commandExecutorStub = sandbox.stub(commandExecutor, 'registerCommand');
    clientCapabilities = {};
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('JumpToSchema tests', () => {
    it('should register handler for "JumpToSchema" command', () => {
      new YamlCodeActions(commandExecutor, ({} as unknown) as Connection, clientCapabilities);
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
      new YamlCodeActions(commandExecutor, connection, clientCapabilities);
      const arg = commandExecutorStub.args[0];
      await arg[1](JSON_SCHEMA_LOCAL);
      expect(showDocumentStub).to.have.been.calledWith({ uri: JSON_SCHEMA_LOCAL, external: false, takeFocus: true });
    });

    it('should not provide any actions if there are no diagnostics', () => {
      const doc = setupTextDocument('');
      const params: CodeActionParams = {
        context: CodeActionContext.create(undefined),
        range: undefined,
        textDocument: TextDocumentIdentifier.create(TEST_URI),
      };
      const actions = new YamlCodeActions(commandExecutor, ({} as unknown) as Connection, clientCapabilities);
      const result = actions.getCodeAction(doc, params);
      expect(result).to.be.undefined;
    });

    it('should provide action if diagnostic has uri for schema', () => {
      const doc = setupTextDocument('');
      const diagnostics = [createDiagnosticWithData('foo', 0, 0, 0, 0, 1, JSON_SCHEMA_LOCAL, JSON_SCHEMA_LOCAL)];
      const params: CodeActionParams = {
        context: CodeActionContext.create(diagnostics),
        range: undefined,
        textDocument: TextDocumentIdentifier.create(TEST_URI),
      };
      clientCapabilities.window = { showDocument: { support: true } };
      const actions = new YamlCodeActions(commandExecutor, ({} as unknown) as Connection, clientCapabilities);
      const result = actions.getCodeAction(doc, params);

      const codeAction = CodeAction.create(
        'Jump to schema location',
        Command.create('JumpToSchema', YamlCommands.JUMP_TO_SCHEMA, JSON_SCHEMA_LOCAL)
      );
      codeAction.diagnostics = diagnostics;
      expect(result[0]).to.deep.equal(codeAction);
    });
  });
});
