import { expect } from 'chai';
import { Position, Range, SelectionRange } from 'vscode-languageserver-types';
import { setupTextDocument } from './utils/testHelper';
import { getSelectionRanges } from '../src/languageservice/services/yamlSelectionRanges';

function expectSelections(selectionRange: SelectionRange, ranges: Range[]): void {
  for (const range of ranges) {
    expect(selectionRange.range).eql(range);
    selectionRange = selectionRange.parent;
  }
}

describe('YAML Selection Ranges Tests', () => {
  it('selection ranges for mapping', () => {
    const yaml = 'key: value';
    const positions: Position[] = [
      {
        line: 0,
        character: 1,
      },
    ];
    const document = setupTextDocument(yaml);
    const ranges = getSelectionRanges(document, positions);
    expect(ranges.length).equal(positions.length);
    expectSelections(ranges[0], [
      { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
      { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
    ]);
  });

  it('selection ranges for sequence', () => {
    const yaml = `
key:
  - 1
  - word
    `;
    let positions: Position[] = [
      {
        line: 3,
        character: 8,
      },
    ];
    const document = setupTextDocument(yaml);
    let ranges = getSelectionRanges(document, positions);
    expect(ranges.length).equal(positions.length);
    expectSelections(ranges[0], [
      { start: { line: 3, character: 4 }, end: { line: 3, character: 8 } },
      { start: { line: 2, character: 2 }, end: { line: 3, character: 8 } },
      { start: { line: 1, character: 0 }, end: { line: 3, character: 8 } },
    ]);

    positions = [
      {
        line: 2,
        character: 0,
      },
    ];
    ranges = getSelectionRanges(document, positions);
    expect(ranges.length).equal(positions.length);
    expectSelections(ranges[0], [
      { start: { line: 2, character: 0 }, end: { line: 3, character: 8 } },
      { start: { line: 1, character: 0 }, end: { line: 3, character: 8 } },
    ]);
  });

  it('selection ranges jump for "" \'\'', () => {
    const yaml = `
- "word"
- 'word'
    `;
    let positions: Position[] = [
      {
        line: 1,
        character: 4,
      },
    ];
    const document = setupTextDocument(yaml);
    let ranges = getSelectionRanges(document, positions);
    expect(ranges.length).equal(positions.length);
    expectSelections(ranges[0], [
      { start: { line: 1, character: 3 }, end: { line: 1, character: 7 } },
      { start: { line: 1, character: 2 }, end: { line: 1, character: 8 } },
    ]);

    positions = [
      {
        line: 2,
        character: 4,
      },
    ];
    ranges = getSelectionRanges(document, positions);
    expect(ranges.length).equal(positions.length);
    expectSelections(ranges[0], [
      { start: { line: 2, character: 3 }, end: { line: 2, character: 7 } },
      { start: { line: 2, character: 2 }, end: { line: 2, character: 8 } },
    ]);
  });

  it('selection ranges jump for [] {}', () => {
    const yaml = '{ key: [1, true] }';
    const positions: Position[] = [
      {
        line: 0,
        character: 12,
      },
    ];
    const document = setupTextDocument(yaml);
    const ranges = getSelectionRanges(document, positions);
    expect(ranges.length).equal(positions.length);
    expectSelections(ranges[0], [
      { start: { line: 0, character: 11 }, end: { line: 0, character: 15 } },
      { start: { line: 0, character: 8 }, end: { line: 0, character: 15 } },
      { start: { line: 0, character: 7 }, end: { line: 0, character: 16 } },
      { start: { line: 0, character: 2 }, end: { line: 0, character: 16 } },
      { start: { line: 0, character: 1 }, end: { line: 0, character: 17 } },
      { start: { line: 0, character: 0 }, end: { line: 0, character: 18 } },
    ]);
  });
});
