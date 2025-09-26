/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import * as chai from 'chai';
import { YamlCodeActions } from '../src/languageservice/services/yamlCodeActions';
import {
  CodeAction,
  CodeActionContext,
  Command,
  DiagnosticSeverity,
  Range,
  TextDocumentIdentifier,
  TextEdit,
  WorkspaceEdit,
} from 'vscode-languageserver-types';
import { ClientCapabilities, CodeActionParams } from 'vscode-languageserver';
import { setupTextDocument, TEST_URI } from './utils/testHelper';
import { createDiagnosticWithData, createExpectedError, createUnusedAnchorDiagnostic } from './utils/verifyError';
import { YamlCommands } from '../src/commands';
import { LanguageSettings } from '../src';
import { ErrorCode } from 'vscode-json-languageservice';

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
      const diagnostics = [createExpectedError('Tabs are not allowed as indentation', 1, 0, 1, 1, 1, JSON_SCHEMA_LOCAL)];
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
      const diagnostics = [createExpectedError('Tabs are not allowed as indentation', 1, 0, 1, 1, 1, JSON_SCHEMA_LOCAL)];
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
      const diagnostics = [createExpectedError('Tabs are not allowed as indentation', 1, 0, 1, 3, 1, JSON_SCHEMA_LOCAL)];
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

  describe('Remove Unused Anchor', () => {
    it('should generate proper action', () => {
      const doc = setupTextDocument('foo: &bar bar\n');
      const diagnostics = [createUnusedAnchorDiagnostic('Unused anchor "&bar"', 0, 5, 0, 9)];
      const params: CodeActionParams = {
        context: CodeActionContext.create(diagnostics),
        range: undefined,
        textDocument: TextDocumentIdentifier.create(TEST_URI),
      };
      const actions = new YamlCodeActions(clientCapabilities);
      const result = actions.getCodeAction(doc, params);
      expect(result[0].title).to.be.equal('Delete unused anchor: &bar');
      expect(result[0].edit.changes[TEST_URI]).deep.equal([TextEdit.del(Range.create(0, 5, 0, 10))]);
    });

    it('should delete all whitespace after unused anchor', () => {
      const doc = setupTextDocument('foo: &bar   \tbar\n');
      const diagnostics = [createUnusedAnchorDiagnostic('Unused anchor "&bar"', 0, 5, 0, 9)];
      const params: CodeActionParams = {
        context: CodeActionContext.create(diagnostics),
        range: undefined,
        textDocument: TextDocumentIdentifier.create(TEST_URI),
      };
      const actions = new YamlCodeActions(clientCapabilities);
      const result = actions.getCodeAction(doc, params);
      expect(result[0].title).to.be.equal('Delete unused anchor: &bar');
      expect(result[0].edit.changes[TEST_URI]).deep.equal([TextEdit.del(Range.create(0, 5, 0, 13))]);
    });
  });

  describe('Convert to Block Style', () => {
    it(' should generate action to convert flow map to block map ', () => {
      const yaml = `host: phl-42
datacenter: {location: canada , cab: 15}
animals: [dog , cat , mouse]  `;
      const doc = setupTextDocument(yaml);
      const diagnostics = [
        createExpectedError('Flow style mapping is forbidden', 1, 12, 1, 39, DiagnosticSeverity.Error, 'YAML', 'flowMap'),
        createExpectedError('Flow style sequence is forbidden', 2, 9, 2, 27, DiagnosticSeverity.Error, 'YAML', 'flowSeq'),
      ];
      const params: CodeActionParams = {
        context: CodeActionContext.create(diagnostics),
        range: undefined,
        textDocument: TextDocumentIdentifier.create(TEST_URI),
      };
      const actions = new YamlCodeActions(clientCapabilities);
      const result = actions.getCodeAction(doc, params);
      expect(result).to.be.not.empty;
      expect(result).to.have.lengthOf(2);
      expect(result[0].edit.changes[TEST_URI]).deep.equal([
        TextEdit.replace(Range.create(1, 12, 1, 39), `\n  location: canada \n  cab: 15`),
      ]);
      expect(result[1].edit.changes[TEST_URI]).deep.equal([
        TextEdit.replace(Range.create(2, 9, 2, 27), `\n  - dog \n  - cat \n  - mouse`),
      ]);
    });
  });

  describe('Map Key Order', () => {
    it(' should generate action to order a map with incorrect key order', () => {
      const yaml = '- key 2: v\n  key 1: val\n  key 5: valu\n  key 3: ff';
      const doc = setupTextDocument(yaml);
      const diagnostics = [
        createExpectedError(
          'Wrong ordering of key "key 2" in mapping',
          0,
          2,
          0,
          9,
          DiagnosticSeverity.Error,
          'YAML',
          'mapKeyOrder'
        ),
        createExpectedError(
          'Wrong ordering of key "key 5" in mapping',
          2,
          0,
          2,
          9,
          DiagnosticSeverity.Error,
          'YAML',
          'mapKeyOrder'
        ),
      ];
      const params: CodeActionParams = {
        context: CodeActionContext.create(diagnostics),
        range: undefined,
        textDocument: TextDocumentIdentifier.create(TEST_URI),
      };
      const actions = new YamlCodeActions(clientCapabilities);
      const result = actions.getCodeAction(doc, params);
      expect(result).to.be.not.empty;
      expect(result).to.have.lengthOf(2);
      expect(result[0].edit.changes[TEST_URI]).deep.equal([
        TextEdit.replace(Range.create(0, 2, 3, 11), `key 1: val\n  key 2: v\n  key 3: ff\n  key 5: valu`),
      ]);
      expect(result[1].edit.changes[TEST_URI]).deep.equal([
        TextEdit.replace(Range.create(0, 2, 3, 11), `key 1: val\n  key 2: v\n  key 3: ff\n  key 5: valu`),
      ]);
    });
    it(' should generate action to order nested and block maps', () => {
      const yaml = '- key 2: v\n  key 1: val\n  key 5: {b: 1, a: 2}\n  ';
      const doc = setupTextDocument(yaml);
      const diagnostics = [
        createExpectedError(
          'Wrong ordering of key "key 2" in mapping',
          0,
          2,
          0,
          9,
          DiagnosticSeverity.Error,
          'YAML',
          'mapKeyOrder'
        ),
        createExpectedError(
          'Wrong ordering of key "key b" in mapping',
          2,
          9,
          3,
          0,
          DiagnosticSeverity.Error,
          'YAML',
          'mapKeyOrder'
        ),
      ];
      const params: CodeActionParams = {
        context: CodeActionContext.create(diagnostics),
        range: undefined,
        textDocument: TextDocumentIdentifier.create(TEST_URI),
      };
      const actions = new YamlCodeActions(clientCapabilities);
      const result = actions.getCodeAction(doc, params);
      expect(result).to.be.not.empty;
      expect(result).to.have.lengthOf(2);
      expect(result[0].edit.changes[TEST_URI]).deep.equal([
        TextEdit.replace(Range.create(0, 2, 3, 0), `key 1: val\n  key 2: v\n  key 5: {b: 1, a: 2}\n`),
      ]);
      expect(result[1].edit.changes[TEST_URI]).deep.equal([TextEdit.replace(Range.create(2, 9, 2, 21), `{a: 2, b: 1}\n`)]);
    });
    it(' should generate action to order maps with multi-line strings', () => {
      const yaml = '- cc: 1\n  gg: 2\n  aa: >\n    some\n    text\n  vv: 4';
      const doc = setupTextDocument(yaml);
      const diagnostics = [
        createExpectedError(
          'Wrong ordering of key "key gg" in mapping',
          1,
          0,
          1,
          8,
          DiagnosticSeverity.Error,
          'YAML',
          'mapKeyOrder'
        ),
      ];
      const params: CodeActionParams = {
        context: CodeActionContext.create(diagnostics),
        range: undefined,
        textDocument: TextDocumentIdentifier.create(TEST_URI),
      };
      const actions = new YamlCodeActions(clientCapabilities);
      const result = actions.getCodeAction(doc, params);
      expect(result).to.be.not.empty;
      expect(result).to.have.lengthOf(1);
      expect(result[0].edit.changes[TEST_URI]).deep.equal([
        TextEdit.replace(Range.create(0, 2, 5, 7), `aa: >\n    some\n    text\n  cc: 1\n  gg: 2\n  vv: 4`),
      ]);
    });
    it(' should generate actions when values are missing', () => {
      const yaml = '- cc: 1\n  gg: 2\n  aa:';
      const doc = setupTextDocument(yaml);
      const diagnostics = [
        createExpectedError(
          'Wrong ordering of key "key gg" in mapping',
          1,
          0,
          1,
          8,
          DiagnosticSeverity.Error,
          'YAML',
          'mapKeyOrder'
        ),
      ];
      const params: CodeActionParams = {
        context: CodeActionContext.create(diagnostics),
        range: undefined,
        textDocument: TextDocumentIdentifier.create(TEST_URI),
      };
      const actions = new YamlCodeActions(clientCapabilities);
      const result = actions.getCodeAction(doc, params);
      expect(result).to.be.not.empty;
      expect(result).to.have.lengthOf(1);
      expect(result[0].edit.changes[TEST_URI]).deep.equal([TextEdit.replace(Range.create(0, 2, 2, 5), `aa:  cc: 1\n  gg: 2`)]);
    });
    it(' should preserve comments', () => {
      const yaml = '- cc: 1\n  gg: 2  #a comment\n  aa: 1';
      const doc = setupTextDocument(yaml);
      const diagnostics = [
        createExpectedError(
          'Wrong ordering of key "key gg" in mapping',
          1,
          0,
          1,
          8,
          DiagnosticSeverity.Error,
          'YAML',
          'mapKeyOrder'
        ),
      ];
      const params: CodeActionParams = {
        context: CodeActionContext.create(diagnostics),
        range: undefined,
        textDocument: TextDocumentIdentifier.create(TEST_URI),
      };
      const actions = new YamlCodeActions(clientCapabilities);
      const result = actions.getCodeAction(doc, params);
      expect(result).to.be.not.empty;
      expect(result).to.have.lengthOf(1);
      expect(result[0].edit.changes[TEST_URI]).deep.equal([
        TextEdit.replace(Range.create(0, 2, 2, 7), `aa: 1\n  cc: 1\n  gg: 2  #a comment`),
      ]);
    });
  });

  describe('Enum value or property mismatch quick fix', () => {
    it('should generate proper action for enum mismatch', () => {
      const doc = setupTextDocument('foo: value1');
      const diagnostic = createDiagnosticWithData(
        'message',
        0,
        5,
        0,
        11,
        DiagnosticSeverity.Hint,
        'YAML',
        'schemaUri',
        ErrorCode.EnumValueMismatch,
        { values: ['valueX', 'valueY'] }
      );
      const params: CodeActionParams = {
        context: CodeActionContext.create([diagnostic]),
        range: undefined,
        textDocument: TextDocumentIdentifier.create(TEST_URI),
      };
      const actions = new YamlCodeActions(clientCapabilities);
      const result = actions.getCodeAction(doc, params);
      expect(result.map((r) => r.title)).deep.equal(['valueX', 'valueY']);
      expect(result[0].edit.changes[TEST_URI]).deep.equal([TextEdit.replace(Range.create(0, 5, 0, 11), 'valueX')]);
    });

    it('should generate proper action for wrong property', () => {
      const doc = setupTextDocument('foo: value1');
      const diagnostic = createDiagnosticWithData(
        'message',
        0,
        0,
        0,
        3,
        DiagnosticSeverity.Hint,
        'YAML',
        'schemaUri',
        ErrorCode.PropertyExpected,
        {
          properties: ['fooX', 'fooY'],
        }
      );
      const params: CodeActionParams = {
        context: CodeActionContext.create([diagnostic]),
        range: undefined,
        textDocument: TextDocumentIdentifier.create(TEST_URI),
      };
      const actions = new YamlCodeActions(clientCapabilities);
      const result = actions.getCodeAction(doc, params);
      expect(result.map((r) => r.title)).deep.equal(['fooX', 'fooY']);
      expect(result[0].edit.changes[TEST_URI]).deep.equal([TextEdit.replace(Range.create(0, 0, 0, 3), 'fooX')]);
    });

    it('should generate proper action for enum mismatch, title converted to string value', () => {
      const doc = setupTextDocument('foo: value1');
      const diagnostic = createDiagnosticWithData(
        'message',
        0,
        5,
        0,
        11,
        DiagnosticSeverity.Hint,
        'YAML',
        'schemaUri',
        ErrorCode.EnumValueMismatch,
        { values: [5, 10] }
      );
      const params: CodeActionParams = {
        context: CodeActionContext.create([diagnostic]),
        range: undefined,
        textDocument: TextDocumentIdentifier.create(TEST_URI),
      };
      const actions = new YamlCodeActions(clientCapabilities);
      const result = actions.getCodeAction(doc, params);
      expect(result.map((r) => r.title)).deep.equal(['5', '10']);
      expect(result[0].edit.changes[TEST_URI]).deep.equal([TextEdit.replace(Range.create(0, 5, 0, 11), '5')]);
    });
  });
});
