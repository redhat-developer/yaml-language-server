import { expect } from 'chai';
import { YamlDocuments } from '../src/languageservice/parser/yaml-documents';
import { FlowStyleRewriter } from '../src/languageservice/utils/flow-style-rewriter';
import { setupTextDocument } from './utils/testHelper';

describe('Flow style rewriter', () => {
  let writer: FlowStyleRewriter;
  let documents: YamlDocuments;
  const indentation = '  ';
  beforeEach(() => {
    documents = new YamlDocuments();
    writer = new FlowStyleRewriter(indentation);
  });

  it('should return null if node is not flow style', () => {
    const doc = setupTextDocument('foo: bar');
    const yamlDoc = documents.getYamlDocument(doc);

    const node = yamlDoc.documents[0].getNodeFromOffset(1);
    const result = writer.write(node);
    expect(result).to.be.null;
  });

  it('should rewrite flow style map to block', () => {
    const doc = setupTextDocument('datacenter: { location: canada, cab: 15}');
    const yamlDoc = documents.getYamlDocument(doc);

    const node = yamlDoc.documents[0].getNodeFromOffset(13);
    const result = writer.write(node);
    expect(result).not.to.be.null;
    expect(result).to.deep.equals(`\n${indentation}location: canada\n${indentation}cab: 15`);
  });

  it('should rewrite flow style map and preserve space ', () => {
    const doc = setupTextDocument('datacenter: { location:  canada, cab:   15}');
    const yamlDoc = documents.getYamlDocument(doc);

    const node = yamlDoc.documents[0].getNodeFromOffset(13);
    const result = writer.write(node);
    expect(result).not.to.be.null;
    expect(result).to.deep.equals(`\n${indentation}location:  canada\n${indentation}cab:   15`);
  });

  it('should rewrite flow style map with null ', () => {
    const doc = setupTextDocument('datacenter: { "explicit": "entry",\n "implicit": "entry",\n null: null }');
    const yamlDoc = documents.getYamlDocument(doc);

    const node = yamlDoc.documents[0].getNodeFromOffset(13);
    const result = writer.write(node);
    expect(result).not.to.be.null;
    expect(result).to.deep.equals(
      `\n${indentation}"explicit": "entry"\n${indentation}"implicit": "entry"\n${indentation}null: null `
    );
  });

  it('should rewrite flow style map with explicit entry', () => {
    const doc = setupTextDocument('datacenter: { "foo bar": "baz" }');
    const yamlDoc = documents.getYamlDocument(doc);

    const node = yamlDoc.documents[0].getNodeFromOffset(13);
    const result = writer.write(node);
    expect(result).not.to.be.null;
    expect(result).to.deep.equals(`\n${indentation}"foo bar": "baz" `);
  });

  it('should rewrite flow style sequence', () => {
    const doc = setupTextDocument('animals: [dog , cat , mouse]  ');
    const yamlDoc = documents.getYamlDocument(doc);

    const node = yamlDoc.documents[0].getNodeFromOffset(9);
    const result = writer.write(node);
    expect(result).not.to.be.null;
    expect(result).to.deep.equals(`\n${indentation}- dog \n${indentation}- cat \n${indentation}- mouse`);
  });

  it('should rewrite flow style for mixed sequence and map', () => {
    const doc = setupTextDocument('animals: [ { "foo": "bar" } ]');
    const yamlDoc = documents.getYamlDocument(doc);

    const node = yamlDoc.documents[0].getNodeFromOffset(9);
    const result = writer.write(node);
    expect(result).not.to.be.null;
    expect(result).to.deep.equals(`\n${indentation}- { "foo": "bar" } `);
  });
  it('should rewrite flow style when parent is sequence', () => {
    const doc = setupTextDocument(`items:\n${indentation}-  { location: some }`);
    const yamlDoc = documents.getYamlDocument(doc);

    const node = yamlDoc.documents[0].getNodeFromOffset(13);
    const result = writer.write(node);
    expect(result).not.to.be.null;
    expect(result).to.deep.equals(`  location: some `);
  });
});
