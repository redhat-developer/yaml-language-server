/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextBuffer } from '../src/languageservice/utils/textBuffer';
import { TextDocument } from 'vscode-languageserver';
import * as assert from 'assert';

describe('TextBuffer', () => {
  it('getLineLength should return actual line length', () => {
    const buffer = new TextBuffer(TextDocument.create('file://foo/bar', 'yaml', 1, 'Foo\nbar'));
    const length = buffer.getLineLength(0);
    assert.strictEqual(length, 4);
    const length2 = buffer.getLineLength(1);
    assert.strictEqual(length2, 3);
  });

  it('getLineLength should return actual line length, win style', () => {
    const buffer = new TextBuffer(TextDocument.create('file://foo/bar', 'yaml', 1, 'Foo\r\nbar'));
    const length = buffer.getLineLength(0);
    assert.strictEqual(length, 5);
    const length2 = buffer.getLineLength(1);
    assert.strictEqual(length2, 3);
  });

  it('getLineContent should return actual line content', () => {
    const buffer = new TextBuffer(TextDocument.create('file://foo/bar', 'yaml', 1, 'Foo\nbar\nfooBar\nsome'));
    const line = buffer.getLineContent(1);
    assert.strictEqual(line, 'bar\n');
  });

  it('getLineContent should return last line', () => {
    const buffer = new TextBuffer(TextDocument.create('file://foo/bar', 'yaml', 1, 'Foo\nbar\nfooBar\nsome'));
    const line = buffer.getLineContent(3);
    assert.strictEqual(line, 'some');
  });

  it('getLineCharCode should return charCode', () => {
    const buffer = new TextBuffer(TextDocument.create('file://foo/bar', 'yaml', 1, 'Foo\nbar\nfooBar\nsome'));
    const charCode = buffer.getLineCharCode(3, 4);
    assert.strictEqual(charCode, 'B'.charCodeAt(0));
  });
});
