/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { expect } from 'chai';
import { ArrayASTNode, ObjectASTNode, PropertyASTNode } from '../src/languageservice/jsonASTTypes';
import { parse, YAMLDocument } from './../src/languageservice/parser/yamlParser07';
import { aliasDepth } from '../src/languageservice/parser/ast-converter';

describe('YAML parser', () => {
  describe('YAML parser', function () {
    it('parse emtpy text', () => {
      const parsedDocument = parse('');
      assert(parsedDocument.documents.length === 1, 'A document has been created for an empty text');
    });

    it('parse only comment', () => {
      const parsedDocument = parse('# a comment');
      assert(parsedDocument.documents.length === 1, 'A document has been created when there is a comment');
    });

    it('parse single document with --- at the start of the file', () => {
      const parsedDocument = parse('---\n# a comment\ntest: test');
      assert(
        parsedDocument.documents.length === 1,
        `A single document should be available but there are ${parsedDocument.documents.length}`
      );
      assert(parsedDocument.documents[0].lineComments.length === 1);
      assert(parsedDocument.documents[0].lineComments[0] === '# a comment');
    });

    it('parse multi document with --- at the start of the file', () => {
      const parsedDocument = parse('---\n# a comment\ntest: test\n...\n---\n# second document\ntest2: test2');
      assert(
        parsedDocument.documents.length === 2,
        `two documents should be available but there are ${parsedDocument.documents.length}`
      );
      assert(parsedDocument.documents[0].lineComments.length === 1);
      assert(parsedDocument.documents[0].lineComments[0] === '# a comment');

      assert(parsedDocument.documents[1].lineComments.length === 1);
      assert(parsedDocument.documents[1].lineComments[0] === '# second document');
    });

    it('parse single document with directives and line comments', () => {
      const parsedDocument = parse('%TAG !yaml! tag:yaml.org,2002:\n---\n# a comment\ntest');
      assert(
        parsedDocument.documents.length === 1,
        `A single document should be available but there are ${parsedDocument.documents.length}`
      );
      assert(
        parsedDocument.documents[0].root.children.length === 0,
        `There should no children available but there are ${parsedDocument.documents[0].root.children.length}`
      );
      assert(parsedDocument.documents[0].lineComments.length === 1);
      assert(parsedDocument.documents[0].lineComments[0] === '# a comment');
    });

    it('parse 2 documents with directives and line comments', () => {
      const parsedDocument = parse('%TAG !yaml! tag:yaml.org,2002:\n# a comment\ntest\n...\n---\ntest2');
      assert(
        parsedDocument.documents.length === 2,
        `2 documents should be available but there are ${parsedDocument.documents.length}`
      );
      assert(
        parsedDocument.documents[0].root.children.length === 0,
        `There should no children available but there are ${parsedDocument.documents[0].root.children.length}`
      );
      assert(
        parsedDocument.documents[1].root.children.length === 0,
        `There should no children available but there are ${parsedDocument.documents[1].root.children.length}`
      );
      assert(parsedDocument.documents[1].root.value === 'test2');
      assert(parsedDocument.documents[0].lineComments.length === 1);
      assert(parsedDocument.documents[0].lineComments[0] === '# a comment');
    });

    it('parse single document', () => {
      const parsedDocument = parse('test');
      assert(
        parsedDocument.documents.length === 1,
        `A single document should be available but there are ${parsedDocument.documents.length}`
      );
      assert(
        parsedDocument.documents[0].root.children.length === 0,
        `There should no children available but there are ${parsedDocument.documents[0].root.children.length}`
      );
    });

    it('parse single document with directives', () => {
      const parsedDocument = parse('%TAG !yaml! tag:yaml.org,2002:\n---\ntest');
      assert(
        parsedDocument.documents.length === 1,
        `A single document should be available but there are ${parsedDocument.documents.length}`
      );
      assert(
        parsedDocument.documents[0].root.children.length === 0,
        `There should no children available but there are ${parsedDocument.documents[0].root.children.length}`
      );
    });

    it('parse 2 documents', () => {
      const parsedDocument = parse('test\n---\ntest2');
      assert(
        parsedDocument.documents.length === 2,
        `2 documents should be available but there are ${parsedDocument.documents.length}`
      );
      assert(
        parsedDocument.documents[0].root.children.length === 0,
        `There should no children available but there are ${parsedDocument.documents[0].root.children.length}`
      );
      assert(parsedDocument.documents[0].root.value === 'test');
      assert(
        parsedDocument.documents[1].root.children.length === 0,
        `There should no children available but there are ${parsedDocument.documents[1].root.children.length}`
      );
      assert(parsedDocument.documents[1].root.value === 'test2');
    });

    it('parse 3 documents', () => {
      const parsedDocument = parse('test\n---\ntest2\n---\ntest3');
      assert(
        parsedDocument.documents.length === 3,
        `3 documents should be available but there are ${parsedDocument.documents.length}`
      );
      assert(
        parsedDocument.documents[0].root.children.length === 0,
        `There should no children available but there are ${parsedDocument.documents[0].root.children.length}`
      );
      assert(parsedDocument.documents[0].root.value === 'test');
      assert(
        parsedDocument.documents[1].root.children.length === 0,
        `There should no children available but there are ${parsedDocument.documents[1].root.children.length}`
      );
      assert(parsedDocument.documents[1].root.value === 'test2');
      assert(
        parsedDocument.documents[2].root.children.length === 0,
        `There should no children available but there are ${parsedDocument.documents[2].root.children.length}`
      );
      assert(parsedDocument.documents[2].root.value === 'test3');
    });

    it('parse single document with comment', () => {
      const parsedDocument = parse('# a comment\ntest');
      assert(
        parsedDocument.documents.length === 1,
        `A single document should be available but there are ${parsedDocument.documents.length}`
      );
      assert(
        parsedDocument.documents[0].root.children.length === 0,
        `There should no children available but there are ${parsedDocument.documents[0].root.children.length}`
      );
      assert(parsedDocument.documents[0].lineComments.length === 1);
      assert(parsedDocument.documents[0].lineComments[0] === '# a comment');
    });

    it('parse 2 documents with comment', () => {
      const parsedDocument = parse('---\n# a comment\ntest: test\n---\n# a second comment\ntest2');
      assert(
        parsedDocument.documents.length === 2,
        `2 documents should be available but there are ${parsedDocument.documents.length}`
      );
      assert(
        parsedDocument.documents[0].root.children.length === 1,
        `There should one children available but there are ${parsedDocument.documents[0].root.children.length}`
      );
      assert(parsedDocument.documents[0].lineComments.length === 1);
      assert(parsedDocument.documents[0].lineComments[0] === '# a comment');

      assert(
        parsedDocument.documents[1].root.children.length === 0,
        `There should no children available but there are ${parsedDocument.documents[0].root.children.length}`
      );
      assert(parsedDocument.documents[1].lineComments.length === 1);
      assert(parsedDocument.documents[1].lineComments[0] === '# a second comment');
    });

    it('parse 2 documents with comment and a directive', () => {
      const parsedDocument = parse('%TAG !yaml! tag:yaml.org,2002:\n---\n# a comment\ntest\n---\n# a second comment\ntest2');
      assert(
        parsedDocument.documents.length === 2,
        `2 documents should be available but there are ${parsedDocument.documents.length}`
      );
      assert(
        parsedDocument.documents[0].root.children.length === 0,
        `There should no children available but there are ${parsedDocument.documents[0].root.children.length}`
      );
      assert(parsedDocument.documents[0].lineComments.length === 1);
      assert(parsedDocument.documents[0].lineComments[0] === '# a comment');

      assert(
        parsedDocument.documents[1].root.children.length === 0,
        `There should no children available but there are ${parsedDocument.documents[0].root.children.length}`
      );
      assert(parsedDocument.documents[1].lineComments.length === 1);
      assert(parsedDocument.documents[1].lineComments[0] === '# a second comment');
    });

    it('parse document with comment first', () => {
      const parsedDocument = parse('# a comment\n---\ntest:test');
      assert(
        parsedDocument.documents.length === 1,
        `1 document should be available but there are ${parsedDocument.documents.length}`
      );
      assert(parsedDocument.documents[0].lineComments.length === 1);
      assert(parsedDocument.documents[0].lineComments[0] === '# a comment');
    });

    it('parse document with comment first and directive', () => {
      const parsedDocument = parse('# a comment\n%TAG !yaml! tag:yaml.org,2002:\ntest: test');
      assert(
        parsedDocument.documents.length === 1,
        `1 document should be available but there are ${parsedDocument.documents.length}`
      );
      assert(parsedDocument.documents[0].lineComments.length === 1);
      assert(parsedDocument.documents[0].lineComments[0] === '# a comment');
    });

    it('parse document with comment first, directive, and seperator', () => {
      const parsedDocument = parse('# a comment\n%TAG !yaml! tag:yaml.org,2002:\n---test: test');
      assert(
        parsedDocument.documents.length === 1,
        `1 document should be available but there are ${parsedDocument.documents.length}`
      );
      assert(parsedDocument.documents[0].lineComments.length === 1);
      assert(parsedDocument.documents[0].lineComments[0] === '# a comment');
    });

    it('parse document with "str" tag from recommended schema', () => {
      const parsedDocument = parse('"yes as a string with tag": !!str yes');
      assert(
        parsedDocument.documents.length === 1,
        `1 document should be available but there are ${parsedDocument.documents.length}`
      );
      assert(parsedDocument.documents[0].errors.length === 0);
    });

    it('parse document with "int" tag from recommended schema', () => {
      const parsedDocument = parse('POSTGRES_PORT: !!int 54');
      assert(
        parsedDocument.documents.length === 1,
        `1 document should be available but there are ${parsedDocument.documents.length}`
      );
      assert(parsedDocument.documents[0].errors.length === 0, JSON.stringify(parsedDocument.documents[0].errors));
    });

    it('parse aliases up to a depth', () => {
      // If maxRefCount is set to 1, it will only resolve one layer of aliases, which means
      // `b` below will inherit `a`, but `c` will not inherit `a`.
      let parsedDocument: YAMLDocument;
      try {
        aliasDepth.maxRefCount = 1;
        parsedDocument = parse(`
a: &a
  foo: "web"
b: &b
  <<: *a
c: &c
  <<: *b
`);
      } finally {
        aliasDepth.maxRefCount = 1000;
      }

      const anode: ObjectASTNode = (parsedDocument.documents[0].root.children[0] as PropertyASTNode).valueNode as ObjectASTNode;
      const aval = anode.properties[0].valueNode;

      const bnode: ObjectASTNode = (parsedDocument.documents[0].root.children[1] as PropertyASTNode).valueNode as ObjectASTNode;
      const bvalprops: PropertyASTNode = (bnode.properties[0].valueNode as ObjectASTNode).properties[0];
      const bval = bvalprops.valueNode;

      const cnode: ObjectASTNode = (parsedDocument.documents[0].root.children[2] as PropertyASTNode).valueNode as ObjectASTNode;
      const cvalprops: PropertyASTNode = (cnode.properties[0].valueNode as ObjectASTNode).properties[0];
      const cval = cvalprops.valueNode;

      assert(aval?.value === 'web');
      assert(bval?.value === 'web');
      assert(cval?.value === undefined);
    });

    it('parse aliases up to a depth for multiple objects', () => {
      // In the below configuration, `c` will not inherit `a` because of depth issues
      // but the following object `o` will still resolve correctly.
      let parsedDocument: YAMLDocument;
      try {
        aliasDepth.maxRefCount = 1;
        parsedDocument = parse(`
a: &a
  foo: "web"
b: &b
  <<: *a
c: &c
  <<: *b

o: &o
  <<: *a
`);
      } finally {
        aliasDepth.maxRefCount = 1000;
      }

      const onode: ObjectASTNode = (parsedDocument.documents[0].root.children[3] as PropertyASTNode).valueNode as ObjectASTNode;
      const ovalprops: PropertyASTNode = (onode.properties[0].valueNode as ObjectASTNode).properties[0];
      const oval = ovalprops.valueNode;

      const cnode: ObjectASTNode = (parsedDocument.documents[0].root.children[2] as PropertyASTNode).valueNode as ObjectASTNode;
      const cvalprops: PropertyASTNode = (cnode.properties[0].valueNode as ObjectASTNode).properties[0];
      const cval = cvalprops.valueNode;

      assert(cval?.value === undefined);
      assert(oval?.value === 'web');
    });
  });

  describe('YAML parser bugs', () => {
    it('should work with "Billion Laughs" attack', () => {
      const yaml = `apiVersion: v1
data:
  a: &a ["web","web","web","web","web","web","web","web","web"]
  b: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]
  c: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]
  d: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c]
  e: &e [*d,*d,*d,*d,*d,*d,*d,*d,*d]
  f: &f [*e,*e,*e,*e,*e,*e,*e,*e,*e]
  g: &g [*f,*f,*f,*f,*f,*f,*f,*f,*f]
  h: &h [*g,*g,*g,*g,*g,*g,*g,*g,*g]
  i: &i [*h,*h,*h,*h,*h,*h,*h,*h,*h]
kind: ConfigMap
metadata:
  name: yaml-bomb
  namespace: defaul`;
      const parsedDocument = parse(yaml);
      assert.strictEqual(
        parsedDocument.documents.length,
        1,
        `1 document should be available but there are ${parsedDocument.documents.length}`
      );
    });

    it('should work with circular aliases', () => {
      const yaml = '&a [ 1, *a ]\n';
      const parsedDocument = parse(yaml);
      parsedDocument.documents[0].root;
      expect(parsedDocument.documents).to.have.length(1);
    });
    it('should not add "undefined" as array item', () => {
      const yaml = `foo: 
  - *`;
      const parsedDocument = parse(yaml);
      parsedDocument.documents[0].root;
      expect(parsedDocument.documents).to.have.length(1);
      expect(
        (((parsedDocument.documents[0].root as ObjectASTNode).properties[0] as PropertyASTNode).valueNode as ArrayASTNode)
          .items[0]
      ).is.not.undefined;
    });
  });

  describe('YAML version', () => {
    it('should use yaml 1.2 by default', () => {
      const parsedDocument = parse('SOME_BOOLEAN : !!bool yes');
      assert(parsedDocument.documents[0].warnings.length === 1);
    });

    it('should respect yaml 1.1', () => {
      const parsedDocument = parse('SOME_BOOLEAN : !!bool yes', { customTags: [], yamlVersion: '1.1' });
      assert(parsedDocument.documents[0].warnings.length === 0);
    });
  });
});
