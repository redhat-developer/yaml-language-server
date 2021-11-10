/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as chai from 'chai';
import { isPair, isSeq, Pair, YAMLSeq } from 'yaml';
import { YamlDocuments } from '../src/languageservice/parser/yaml-documents';
import { getParent, isInComment } from '../src/languageservice/utils/astUtils';
import { TextBuffer } from '../src/languageservice/utils/textBuffer';
import { setupTextDocument } from './utils/testHelper';
const expect = chai.expect;

describe('AST Utils Tests', () => {
  let documents: YamlDocuments;
  beforeEach(() => {
    documents = new YamlDocuments();
  });
  describe('Get Parent Node', () => {
    it('get key parent', () => {
      const doc = setupTextDocument('foo: bar');
      const yamlDoc = documents.getYamlDocument(doc);

      const [node] = yamlDoc.documents[0].getNodeFromPosition(2, new TextBuffer(doc));
      const result = getParent(yamlDoc.documents[0].internalDocument, node);

      expect(result).is.not.undefined;
      expect(isPair(result)).is.true;
      expect((result as Pair).key).property('value', 'foo');
    });

    it('get value parent', () => {
      const doc = setupTextDocument('foo: bar');
      const yamlDoc = documents.getYamlDocument(doc);

      const [node] = yamlDoc.documents[0].getNodeFromPosition(6, new TextBuffer(doc));
      const result = getParent(yamlDoc.documents[0].internalDocument, node);

      expect(result).is.not.undefined;
      expect(isPair(result)).is.true;
      expect((result as Pair).value).property('value', 'bar');
    });

    it('get root map parent', () => {
      const doc = setupTextDocument('foo: bar');
      const yamlDoc = documents.getYamlDocument(doc);

      const [node] = yamlDoc.documents[0].getNodeFromPosition(4, new TextBuffer(doc));
      const result = getParent(yamlDoc.documents[0].internalDocument, node);

      expect(result).is.undefined;
    });

    it('get array parent', () => {
      const doc = setupTextDocument('foo:\n  - bar');
      const yamlDoc = documents.getYamlDocument(doc);

      const [node] = yamlDoc.documents[0].getNodeFromPosition(10, new TextBuffer(doc));
      const result = getParent(yamlDoc.documents[0].internalDocument, node);

      expect(result).is.not.undefined;
      expect(isSeq(result)).is.true;
      expect((result as YAMLSeq).items[0]).property('value', 'bar');
    });

    it('get pair parent', () => {
      const doc = setupTextDocument('foo:\n  - bar');
      const yamlDoc = documents.getYamlDocument(doc);

      const [node] = yamlDoc.documents[0].getNodeFromPosition(7, new TextBuffer(doc));
      const result = getParent(yamlDoc.documents[0].internalDocument, node);

      expect(result).is.not.undefined;
      expect(isPair(result)).is.true;
      expect((result as Pair).key).property('value', 'foo');
    });
  });

  describe('Is Offset in comment', () => {
    it('should detect that offset in comment', () => {
      const doc = setupTextDocument('#some comment\nfoo: bar');
      const yamlDoc = documents.getYamlDocument(doc);
      const result = isInComment(yamlDoc.tokens, 4);
      expect(result).to.be.true;
    });

    it('should detect that comment inside object', () => {
      const doc = setupTextDocument('obj:\n#some comment\n  foo: bar');
      const yamlDoc = documents.getYamlDocument(doc);
      const result = isInComment(yamlDoc.tokens, 12);
      expect(result).to.be.true;
    });
  });
});
