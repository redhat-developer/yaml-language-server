/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import * as chai from 'chai';
import { YamlCodeActions } from '../src/languageservice/services/yamlCodeActions';
import {
  ClientCapabilities,
  CodeAction,
  CodeActionContext,
  CodeActionParams,
  Command,
  Range,
  TextDocumentIdentifier,
  TextEdit,
  WorkspaceEdit,
} from 'vscode-languageserver';
import { setupTextDocument, TEST_URI } from './utils/testHelper';
import { createDiagnosticWithData, createExpectedError } from './utils/verifyError';
import { YamlCommands } from '../src/commands';
import { LanguageSettings } from '../src';

const expect = chai.expect;
chai.use(sinonChai);

const JSON_SCHEMA_LOCAL = 'file://some/path/schema.json';
const JSON_SCHEMA2_LOCAL = 'file://some/path/schema2.json';

describe('CodeActions Tests', () => {
  const sandbox = sinon.createSandbox();

  let clientCapabilities: ClientCapabilities;
  beforeEach(() => {
    clientCapabilities = {};
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('JumpToSchema tests', () => {
    it('should not provide any actions if there are no diagnostics', () => {
      const doc = setupTextDocument('');
      const params: CodeActionParams = {
        context: CodeActionContext.create(undefined),
        range: undefined,
        textDocument: TextDocumentIdentifier.create(TEST_URI),
      };
      const actions = new YamlCodeActions(clientCapabilities);
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
      const actions = new YamlCodeActions(clientCapabilities);
      const result = actions.getCodeAction(doc, params);

      const codeAction = CodeAction.create(
        'Jump to schema location (schema.json)',
        Command.create('JumpToSchema', YamlCommands.JUMP_TO_SCHEMA, JSON_SCHEMA_LOCAL)
      );
      codeAction.diagnostics = diagnostics;
      expect(result[0]).to.deep.equal(codeAction);
    });

    it('should provide multiple action if diagnostic has uri for multiple schemas', () => {
      const doc = setupTextDocument('');
      const diagnostics = [
        createDiagnosticWithData('foo', 0, 0, 0, 0, 1, JSON_SCHEMA_LOCAL, [JSON_SCHEMA_LOCAL, JSON_SCHEMA2_LOCAL]),
      ];
      const params: CodeActionParams = {
        context: CodeActionContext.create(diagnostics),
        range: undefined,
        textDocument: TextDocumentIdentifier.create(TEST_URI),
      };
      clientCapabilities.window = { showDocument: { support: true } };
      const actions = new YamlCodeActions(clientCapabilities);
      const result = actions.getCodeAction(doc, params);

      const codeAction = CodeAction.create(
        'Jump to schema location (schema.json)',
        Command.create('JumpToSchema', YamlCommands.JUMP_TO_SCHEMA, JSON_SCHEMA_LOCAL)
      );
      const codeAction2 = CodeAction.create(
        'Jump to schema location (schema2.json)',
        Command.create('JumpToSchema', YamlCommands.JUMP_TO_SCHEMA, JSON_SCHEMA2_LOCAL)
      );
      codeAction.diagnostics = diagnostics;
      codeAction2.diagnostics = diagnostics;
      expect(result[0]).to.deep.equal(codeAction);
      expect(result[1]).to.deep.equal(codeAction2);
    });
  });

  describe('Convert TAB to Spaces', () => {
    it('should add "Convert TAB to Spaces" CodeAction', () => {
      const doc = setupTextDocument('foo:\n\t- bar');
      const diagnostics = [createExpectedError('Using tabs can lead to unpredictable results', 1, 0, 1, 1, 1, JSON_SCHEMA_LOCAL)];
      const params: CodeActionParams = {
        context: CodeActionContext.create(diagnostics),
        range: undefined,
        textDocument: TextDocumentIdentifier.create(TEST_URI),
      };
      const actions = new YamlCodeActions(clientCapabilities);
      const result = actions.getCodeAction(doc, params);
      expect(result).to.has.length(2);
      expect(result[0].title).to.be.equal('Convert Tab to Spaces');
      expect(WorkspaceEdit.is(result[0].edit)).to.be.true;
      expect(result[0].edit.changes[TEST_URI]).deep.equal([TextEdit.replace(Range.create(1, 0, 1, 1), '  ')]);
    });

    it('should support current indentation chars settings', () => {
      const doc = setupTextDocument('foo:\n\t- bar');
      const diagnostics = [createExpectedError('Using tabs can lead to unpredictable results', 1, 0, 1, 1, 1, JSON_SCHEMA_LOCAL)];
      const params: CodeActionParams = {
        context: CodeActionContext.create(diagnostics),
        range: undefined,
        textDocument: TextDocumentIdentifier.create(TEST_URI),
      };
      const actions = new YamlCodeActions(clientCapabilities);
      actions.configure({ indentation: '   ' } as LanguageSettings);
      const result = actions.getCodeAction(doc, params);

      expect(result[0].title).to.be.equal('Convert Tab to Spaces');
      expect(result[0].edit.changes[TEST_URI]).deep.equal([TextEdit.replace(Range.create(1, 0, 1, 1), '   ')]);
    });

    it('should provide "Convert all Tabs to Spaces"', () => {
      const doc = setupTextDocument('foo:\n\t\t\t- bar\n\t\t');
      const diagnostics = [createExpectedError('Using tabs can lead to unpredictable results', 1, 0, 1, 3, 1, JSON_SCHEMA_LOCAL)];
      const params: CodeActionParams = {
        context: CodeActionContext.create(diagnostics),
        range: undefined,
        textDocument: TextDocumentIdentifier.create(TEST_URI),
      };
      const actions = new YamlCodeActions(clientCapabilities);
      const result = actions.getCodeAction(doc, params);

      expect(result[1].title).to.be.equal('Convert all Tabs to Spaces');
      expect(result[1].edit.changes[TEST_URI]).deep.equal([
        TextEdit.replace(Range.create(1, 0, 1, 3), '      '),
        TextEdit.replace(Range.create(2, 0, 2, 2), '    '),
      ]);
    });
  });
});
