/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import * as chai from 'chai';
import { YamlDocuments } from '../src/languageservice/parser/yaml-documents';
import { setupTextDocument } from './utils/testHelper';
import * as yamlParser from '../src/languageservice/parser/yamlParser07';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { isMap, isScalar, isSeq, Pair, Scalar, YAMLMap, YAMLSeq } from 'yaml';
import { TextBuffer } from '../src/languageservice/utils/textBuffer';

const expect = chai.expect;
chai.use(sinonChai);
describe('YAML Documents', () => {
  const sandbox = sinon.createSandbox();
  describe('YAML Documents Cache Tests', () => {
    let parseStub: sinon.SinonStub;

    beforeEach(() => {
      parseStub = sandbox.stub(yamlParser, 'parse');
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should cache parsed document', () => {
      const cache = new YamlDocuments();
      const doc = setupTextDocument('foo: bar');
      parseStub.returns({});

      const result1 = cache.getYamlDocument(doc);
      const result2 = cache.getYamlDocument(doc);

      expect(parseStub).calledOnce;
      expect(result1).to.be.equal(result2);
    });

    it('should re parse document if document changed', () => {
      const cache = new YamlDocuments();
      const doc = setupTextDocument('foo: bar');

      parseStub.onFirstCall().returns({});
      parseStub.onSecondCall().returns({ foo: 'bar' });

      const result1 = cache.getYamlDocument(doc);
      TextDocument.update(doc, [], 2);
      const result2 = cache.getYamlDocument(doc);

      expect(parseStub).calledTwice;
      expect(result1).to.be.not.equal(result2);
    });

    it('should invalidate cache if custom tags provided', () => {
      const cache = new YamlDocuments();
      const doc = setupTextDocument('foo: bar');
      parseStub.onFirstCall().returns({});
      parseStub.onSecondCall().returns({ foo: 'bar' });

      const result1 = cache.getYamlDocument(doc);
      const result2 = cache.getYamlDocument(doc, getParserOptions(['some']));

      expect(parseStub).calledTwice;
      expect(result1).to.not.equal(result2);
    });

    it('should use cache if custom tags are same', () => {
      const cache = new YamlDocuments();
      const doc = setupTextDocument('foo: bar');
      parseStub.onFirstCall().returns({});
      parseStub.onSecondCall().returns({ foo: 'bar' });

      const result1 = cache.getYamlDocument(doc, getParserOptions(['some']));
      const result2 = cache.getYamlDocument(doc, getParserOptions(['some']));

      expect(parseStub).calledOnce;
      expect(result1).to.be.equal(result2);
    });
  });

  describe('Single YAML Document Tests', () => {
    let documents: YamlDocuments;
    beforeEach(() => {
      documents = new YamlDocuments();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('Get node from position: key', () => {
      const doc = setupTextDocument('foo: bar');
      const yamlDoc = documents.getYamlDocument(doc);

      const [result] = yamlDoc.documents[0].getNodeFromPosition(2, new TextBuffer(doc));

      expect(result).is.not.undefined;
      expect(isScalar(result)).is.true;
      expect((result as Scalar).value).eqls('foo');
    });

    it('Get node from position: value', () => {
      const doc = setupTextDocument('foo: bar');
      const yamlDoc = documents.getYamlDocument(doc);

      const [result] = yamlDoc.documents[0].getNodeFromPosition(6, new TextBuffer(doc));

      expect(result).is.not.undefined;
      expect(isScalar(result)).is.true;
      expect((result as Scalar).value).eqls('bar');
    });

    it('Get node from position: map', () => {
      const doc = setupTextDocument('foo: bar');
      const yamlDoc = documents.getYamlDocument(doc);

      const [result] = yamlDoc.documents[0].getNodeFromPosition(4, new TextBuffer(doc));

      expect(result).is.not.undefined;
      expect(isMap(result)).is.true;
      expect((result as YAMLMap).items).length(1);
    });

    it('Get node from position: scalar in array', () => {
      const doc = setupTextDocument('foo:\n  - bar');
      const yamlDoc = documents.getYamlDocument(doc);

      const [result] = yamlDoc.documents[0].getNodeFromPosition(9, new TextBuffer(doc));

      expect(result).is.not.undefined;
      expect(isScalar(result)).is.true;
      expect((result as Scalar).value).equal('bar');
    });

    it('Get node from position: array', () => {
      const doc = setupTextDocument('foo:\n  - bar');
      const yamlDoc = documents.getYamlDocument(doc);

      const [result] = yamlDoc.documents[0].getNodeFromPosition(8, new TextBuffer(doc));

      expect(result).is.not.undefined;
      expect(isSeq(result)).is.true;
      expect((result as YAMLSeq).items).length(1);
    });

    it('Get node from position: map with array', () => {
      const doc = setupTextDocument('foo:\n  - bar');
      const yamlDoc = documents.getYamlDocument(doc);

      const [result] = yamlDoc.documents[0].getNodeFromPosition(6, new TextBuffer(doc));

      expect(result).is.not.undefined;
      expect(isMap(result)).is.true;
      expect((result as YAMLMap).items).length(1);
    });

    it('Get node from position: flow map key', () => {
      const doc = setupTextDocument('{foo: bar}');
      const yamlDoc = documents.getYamlDocument(doc);

      const [result] = yamlDoc.documents[0].getNodeFromPosition(3, new TextBuffer(doc));

      expect(result).is.not.undefined;
      expect(isScalar(result)).is.true;
      expect((result as Scalar).value).eqls('foo');
    });

    it('Get node from position: flow map value', () => {
      const doc = setupTextDocument('{foo: bar}');
      const yamlDoc = documents.getYamlDocument(doc);

      const [result] = yamlDoc.documents[0].getNodeFromPosition(8, new TextBuffer(doc));

      expect(result).is.not.undefined;
      expect(isScalar(result)).is.true;
      expect((result as Scalar).value).eqls('bar');
    });

    it('get pair parent in array', () => {
      const doc = setupTextDocument(`objA:
  - name: nameA1
    
objB:
  size: midle
  name: nameB2
`);
      const yamlDoc = documents.getYamlDocument(doc);

      const result = yamlDoc.documents[0].findClosestNode(27, new TextBuffer(doc));

      expect(result).is.not.undefined;
      expect(isMap(result)).is.true;
      const resultItem: Pair = (result as YAMLMap).items[0];
      expect(resultItem.key as Scalar).property('value', 'name');
      expect(resultItem.value as Scalar).property('value', 'nameA1');
    });

    it('Find closes node: map', () => {
      const doc = setupTextDocument('foo:\n  bar: aaa\n  ');
      const yamlDoc = documents.getYamlDocument(doc);
      const textBuffer = new TextBuffer(doc);

      const result = yamlDoc.documents[0].findClosestNode(18, textBuffer);

      expect(result).is.not.undefined;
      expect(isMap(result)).is.true;
      expect(((result as YAMLMap).items[0].key as Scalar).value).eqls('bar');
    });

    it('Find closes node: array', () => {
      const doc = setupTextDocument('foo:\n  - bar: aaa\n  ');
      const yamlDoc = documents.getYamlDocument(doc);
      const textBuffer = new TextBuffer(doc);

      const result = yamlDoc.documents[0].findClosestNode(20, textBuffer);

      expect(result).is.not.undefined;
      expect(isSeq(result)).is.true;
      expect((((result as YAMLSeq).items[0] as YAMLMap).items[0].key as Scalar).value).eqls('bar');
    });

    it('Find closes node: root map', () => {
      const doc = setupTextDocument('foo:\n  bar: aaa\n  ');
      const yamlDoc = documents.getYamlDocument(doc);
      const textBuffer = new TextBuffer(doc);

      const result = yamlDoc.documents[0].findClosestNode(17, textBuffer);

      expect(result).is.not.undefined;
      expect(isMap(result)).is.true;
      expect(((result as YAMLMap).items[0].key as Scalar).value).eqls('bar');
    });

    it('should parse document when no yamlVersion is provided', () => {
      const doc = setupTextDocument('foo: bar');

      const opts = {
        customTags: ['some'],
        yamlVersion: undefined,
      };
      const yamlDoc = documents.getYamlDocument(doc, opts);
      expect(yamlDoc).is.not.undefined;
    });
  });
});

function getParserOptions(customTags: string[]): yamlParser.ParserOptions {
  return { customTags, yamlVersion: '1.2' };
}
