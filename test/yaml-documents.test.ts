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

const expect = chai.expect;
chai.use(sinonChai);

describe('YAML Documents Cache Tests', () => {
  const sandbox = sinon.createSandbox();
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
    const result2 = cache.getYamlDocument(doc, ['some']);

    expect(parseStub).calledTwice;
    expect(result1).to.not.equal(result2);
  });

  it('should use cache if custom tags are same', () => {
    const cache = new YamlDocuments();
    const doc = setupTextDocument('foo: bar');
    parseStub.onFirstCall().returns({});
    parseStub.onSecondCall().returns({ foo: 'bar' });

    const result1 = cache.getYamlDocument(doc, ['some']);
    const result2 = cache.getYamlDocument(doc, ['some']);

    expect(parseStub).calledOnce;
    expect(result1).to.be.equal(result2);
  });
});
