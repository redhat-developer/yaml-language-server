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
suite('YAML On Type Formatter', () => {
  suite('On Enter Formatter', () => {
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
      expect(result).to.deep.include.members([
        TextEdit.del(Range.create(pos, Position.create(1, 3))),
        TextEdit.insert(pos, '  '),
      ]);
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

  suite('On Tab Formatter', () => {
    it('should replace Tab with spaces', () => {
      const doc = setupTextDocument('some:\n\t');
      const pos = Position.create(1, 1);
      const params = createParams(pos);
      params.ch = '\t';
      const result = doDocumentOnTypeFormatting(doc, params);
      expect(result).to.deep.include(TextEdit.replace(Range.create(1, 0, 1, 1), '  '));
    });
  });
});
