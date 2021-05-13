/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { FoldingRange } from 'vscode-languageserver';
import { getFoldingRanges } from '../src/languageservice/services/yamlFolding';
import { FoldingRangesContext } from '../src/languageservice/yamlTypes';
import { setupTextDocument, TEST_URI } from './utils/testHelper';

const context: FoldingRangesContext = { rangeLimit: 10_0000 };

describe('YAML Folding', () => {
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

  it('should provide proper folding for map in map with array', () => {
    const yaml = `FirstDict:
  FirstDictFirstKey:
    SomeList:
      - foo
SecondDict:
  SecondDictFirstKey: foo`;

    const doc = setupTextDocument(yaml);
    const ranges = getFoldingRanges(doc, context);
    expect(ranges).to.deep.include.members([FoldingRange.create(1, 3, 2, 11)]);
  });

  it('should provide proper folding for map in map with array2', () => {
    const yaml = `top1:
  second11:
    name: one
    events:
      - element
  second12:
    name: two`;

    const doc = setupTextDocument(yaml);
    const ranges = getFoldingRanges(doc, context);
    expect(ranges).to.deep.include.members([FoldingRange.create(1, 4, 2, 15)]);
  });

  it('should respect range limits', () => {
    const yaml = `
      a:
        - 1
      b:
        - 2
    `;

    const warnings = [];

    const doc = setupTextDocument(yaml);

    const unlimitedRanges = getFoldingRanges(doc, {
      rangeLimit: 10,
      onRangeLimitExceeded: (uri) => warnings.push(uri),
    });
    expect(unlimitedRanges.length).to.equal(2);
    expect(warnings).to.be.empty;

    const limitedRanges = getFoldingRanges(doc, {
      rangeLimit: 1,
      onRangeLimitExceeded: (uri) => warnings.push(uri),
    });
    expect(limitedRanges.length).to.equal(1);
    expect(warnings).to.deep.equal([TEST_URI]);
  });
});
