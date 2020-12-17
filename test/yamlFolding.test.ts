/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { FoldingRange } from 'vscode-languageserver';
import { getFoldingRanges } from '../src/languageservice/services/yamlFolding';
import { FoldingRangesContext } from '../src/languageservice/yamlTypes';
import { setupTextDocument } from './utils/testHelper';

const context: FoldingRangesContext = { rangeLimit: 10_0000 };

suite('YAML Folding', () => {
  it('should return undefined if no document provided', () => {
    const ranges = getFoldingRanges(undefined, context);
    expect(ranges).to.be.undefined;
  });

  it('should return empty array for empty document', () => {
    const doc = setupTextDocument('');
    const ranges = getFoldingRanges(doc, context);
    expect(ranges).to.be.empty;
  });

  it('should provide folding ranges for object', () => {
    const yaml = `
    foo: bar
    aaa:
      bbb: ccc
    `;
    const doc = setupTextDocument(yaml);
    const ranges = getFoldingRanges(doc, context);
    expect(ranges.length).to.equal(1);
    expect(ranges[0]).to.be.eql(FoldingRange.create(2, 3, 4, 14));
  });

  it('should provide folding ranges for array', () => {
    const yaml = `
    foo: bar
    aaa:
      - bbb
    ccc: ddd
    `;
    const doc = setupTextDocument(yaml);
    const ranges = getFoldingRanges(doc, context);
    expect(ranges.length).to.equal(1);
    expect(ranges[0]).to.be.eql(FoldingRange.create(2, 3, 4, 11));
  });

  it('should provide folding ranges for mapping in array', () => {
    const yaml = `
    foo: bar
    aaa:
      - bbb: "bbb"
        fff: "fff"
    ccc: ddd
    `;
    const doc = setupTextDocument(yaml);
    const ranges = getFoldingRanges(doc, context);
    expect(ranges).to.deep.include.members([FoldingRange.create(2, 4, 4, 18), FoldingRange.create(3, 4, 8, 18)]);
  });

  it('should provide folding ranges for mapping in mapping', () => {
    const yaml = `
    foo: bar
    aaa:
      bbb:
        fff: "fff"
    ccc: ddd
    `;
    const doc = setupTextDocument(yaml);
    const ranges = getFoldingRanges(doc, context);
    expect(ranges).to.deep.include.members([FoldingRange.create(2, 4, 4, 18), FoldingRange.create(3, 4, 6, 18)]);
  });
});
