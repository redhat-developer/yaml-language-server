/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { parse } from './../src/languageservice/parser/yamlParser07';

describe('YAML parser', () => {
  describe('YAML parser', function () {
    it('parse emtpy text', () => {
      const parsedDocument = parse('');
      assert(parsedDocument.documents.length === 0, 'A document has been created for an empty text');
    });

    it('parse only comment', () => {
      const parsedDocument = parse('# a comment');
      assert(parsedDocument.documents.length === 1, 'No document has been created when there is a comment');
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
  });
});
