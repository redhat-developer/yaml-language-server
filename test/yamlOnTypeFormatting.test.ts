/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { expect } from 'chai';
import { DocumentOnTypeFormattingParams, FormattingOptions, Position, Range, TextEdit } from 'vscode-languageserver';
import { doDocumentOnTypeFormatting } from '../src/languageservice/services/yamlOnTypeFormatting';
import { setupTextDocument } from './utils/testHelper';

function createParams(position: Position): DocumentOnTypeFormattingParams {
  return {
    textDocument: setupTextDocument(''),
    ch: '\n',
    options: FormattingOptions.create(2, true),
    position,
  };
}
describe('YAML On Type Formatter', () => {
  it('should react on "\n" only', () => {
    const doc = setupTextDocument('foo:');
    const params = createParams(Position.create(1, 0));
    params.ch = '\t';
    const result = doDocumentOnTypeFormatting(doc, params);
    expect(result).is.undefined;
  });

  it('should add indentation for mapping', () => {
    const doc = setupTextDocument('foo:\n');
    const params = createParams(Position.create(1, 0));
    const result = doDocumentOnTypeFormatting(doc, params);
    expect(result).to.deep.include(TextEdit.insert(Position.create(1, 0), '  '));
  });

  it('should add indentation for scalar array items', () => {
    const doc = setupTextDocument('foo:\n  - some\n  ');
    const pos = Position.create(2, 2);
    const params = createParams(pos);
    const result = doDocumentOnTypeFormatting(doc, params);
    expect(result[0]).to.eqls(TextEdit.insert(pos, '- '));
  });

  it('should add indentation for mapping in array', () => {
    const doc = setupTextDocument('some:\n  - arr:\n  ');
    const pos = Position.create(2, 2);
    const params = createParams(pos);
    const result = doDocumentOnTypeFormatting(doc, params);
    expect(result).to.deep.include(TextEdit.insert(pos, '    '));
  });

  it('should replace all spaces in newline', () => {
    const doc = setupTextDocument('some:\n    ');
    const pos = Position.create(1, 0);
    const params = createParams(pos);
    const result = doDocumentOnTypeFormatting(doc, params);
    expect(result).to.deep.include.members([TextEdit.del(Range.create(pos, Position.create(1, 3))), TextEdit.insert(pos, '  ')]);
  });

  it('should keep all non white spaces characters in newline', () => {
    const doc = setupTextDocument('some:\n  foo');
    const pos = Position.create(1, 0);
    const params = createParams(pos);
    const result = doDocumentOnTypeFormatting(doc, params);
    expect(result).is.undefined;
  });

  it('should add indentation for multiline string', () => {
    const doc = setupTextDocument('some: |\n');
    const pos = Position.create(1, 0);
    const params = createParams(pos);
    const result = doDocumentOnTypeFormatting(doc, params);
    expect(result).to.deep.include(TextEdit.insert(pos, '  '));
  });
});
