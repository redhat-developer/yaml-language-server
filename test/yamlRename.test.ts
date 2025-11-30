import { expect } from 'chai';
import { Position, TextEdit } from 'vscode-languageserver-types';
import { setupLanguageService, setupTextDocument, TEST_URI } from './utils/testHelper';
import { TextDocument } from 'vscode-languageserver-textdocument';

function applyEdits(document: TextDocument, edits: TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => document.offsetAt(b.range.start) - document.offsetAt(a.range.start));
  let content = document.getText();
  for (const edit of sorted) {
    const start = document.offsetAt(edit.range.start);
    const end = document.offsetAt(edit.range.end);
    content = content.slice(0, start) + edit.newText + content.slice(end);
  }
  return content;
}

describe('YAML Rename', () => {
  it('renames anchor and aliases when invoked on alias', () => {
    const { languageService } = setupLanguageService({});
    const document = setupTextDocument('foo: &a value\nbar: *a\nbaz: *a\n');

    const result = languageService.doRename(document, {
      position: Position.create(1, 6),
      textDocument: { uri: TEST_URI },
      newName: 'renamed',
    });

    expect(result).to.not.equal(null);
    const edits = result?.changes?.[TEST_URI];
    expect(edits).to.have.length(3);
    const updated = applyEdits(document, edits);
    expect(updated).to.equal('foo: &renamed value\nbar: *renamed\nbaz: *renamed\n');
  });

  it('renames when cursor is on anchor token', () => {
    const { languageService } = setupLanguageService({});
    const document = setupTextDocument('foo: &bar value\nbar: *bar\n');

    const result = languageService.doRename(document, {
      position: Position.create(0, 6),
      textDocument: { uri: TEST_URI },
      newName: '*newName',
    });

    expect(result).to.not.equal(null);
    const edits = result?.changes?.[TEST_URI];
    expect(edits).to.have.length(2);
    const updated = applyEdits(document, edits);
    expect(updated).to.equal('foo: &newName value\nbar: *newName\n');
  });

  it('limits rename to current YAML document', () => {
    const { languageService } = setupLanguageService({});
    const document = setupTextDocument('---\nfoo: &a 1\nbar: *a\n---\nfoo: &b 1\nbar: *b\n');

    const result = languageService.doRename(document, {
      position: Position.create(5, 6),
      textDocument: { uri: TEST_URI },
      newName: 'c',
    });

    expect(result).to.not.equal(null);
    const edits = result?.changes?.[TEST_URI];
    const updated = applyEdits(document, edits);
    expect(updated).to.equal('---\nfoo: &a 1\nbar: *a\n---\nfoo: &c 1\nbar: *c\n');
  });

  it('returns null for unresolved alias', () => {
    const { languageService } = setupLanguageService({});
    const document = setupTextDocument('*missing\n');

    const result = languageService.doRename(document, {
      position: Position.create(0, 1),
      textDocument: { uri: TEST_URI },
      newName: 'new',
    });

    expect(result).to.equal(null);
  });

  it('prepareRename rejects non-alias/anchor positions', () => {
    const { languageService } = setupLanguageService({});
    const document = setupTextDocument('foo: bar\n');

    const range = languageService.prepareRename(document, {
      position: Position.create(0, 1),
      textDocument: { uri: TEST_URI },
    });

    expect(range).to.equal(null);
  });
});
