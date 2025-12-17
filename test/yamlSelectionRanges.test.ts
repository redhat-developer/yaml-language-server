import { expect } from 'chai';
import { Position, Range, SelectionRange } from 'vscode-languageserver-types';
import { setupTextDocument } from './utils/testHelper';
import { getSelectionRanges } from '../src/languageservice/services/yamlSelectionRanges';

function isRangesEqual(range1: Range, range2: Range): boolean {
  return (
    range1.start.line === range2.start.line &&
    range1.start.character === range2.start.character &&
    range1.end.line === range2.end.line &&
    range1.end.character === range2.end.character
  );
}

function expectSelections(selectionRange: SelectionRange | undefined, ranges: Range[]): void {
  for (const range of ranges) {
    expect(selectionRange?.range).eql(range);

    // Deduplicate ranges
    while (selectionRange?.parent && isRangesEqual(selectionRange.range, selectionRange.parent.range)) {
      selectionRange = selectionRange.parent;
    }

    selectionRange = selectionRange?.parent;
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
        line: 3,
        character: 3,
      },
    ];
    ranges = getSelectionRanges(document, positions);
    expect(ranges.length).equal(positions.length);
    expectSelections(ranges[0], [
      { start: { line: 3, character: 2 }, end: { line: 3, character: 8 } },
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

  it('selection ranges for array of objects', () => {
    const yaml = `
times:
  - second: 1
    millisecond: 10
  - second: 2
    millisecond: 0
    `;
    let positions: Position[] = [
      {
        line: 4,
        character: 0,
      },
    ];
    const document = setupTextDocument(yaml);
    let ranges = getSelectionRanges(document, positions);
    expect(ranges.length).equal(positions.length);
    expectSelections(ranges[0], [
      { start: { line: 2, character: 2 }, end: { line: 5, character: 18 } },
      { start: { line: 1, character: 0 }, end: { line: 5, character: 18 } },
    ]);

    positions = [
      {
        line: 5,
        character: 2,
      },
    ];
    ranges = getSelectionRanges(document, positions);
    expect(ranges.length).equal(positions.length);
    expectSelections(ranges[0], [
      { start: { line: 4, character: 4 }, end: { line: 5, character: 18 } },
      { start: { line: 2, character: 2 }, end: { line: 5, character: 18 } },
      { start: { line: 1, character: 0 }, end: { line: 5, character: 18 } },
    ]);
  });

  it('selection ranges for trailing spaces', () => {
    const yaml = `
key:
  - 1
  - 2   \t
    `;
    const positions: Position[] = [
      {
        line: 2,
        character: 9,
      },
    ];
    const document = setupTextDocument(yaml);
    const ranges = getSelectionRanges(document, positions);
    expect(ranges.length).equal(positions.length);
    expectSelections(ranges[0], [
      { start: { line: 2, character: 4 }, end: { line: 2, character: 5 } },
      { start: { line: 2, character: 2 }, end: { line: 3, character: 9 } },
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

  it('selection ranges for multiple positions', () => {
    const yaml = `
mapping:
  key: value
sequence:
  - 1
  - null
    `;
    const positions: Position[] = [
      {
        line: 2,
        character: 10,
      },
      {
        line: 5,
        character: 8,
      },
    ];
    const document = setupTextDocument(yaml);
    const ranges = getSelectionRanges(document, positions);
    expect(ranges.length).equal(positions.length);
    expectSelections(ranges[0], [
      { start: { line: 2, character: 7 }, end: { line: 2, character: 12 } },
      { start: { line: 2, character: 2 }, end: { line: 2, character: 12 } },
      { start: { line: 1, character: 0 }, end: { line: 2, character: 12 } },
    ]);
    expectSelections(ranges[1], [
      { start: { line: 5, character: 4 }, end: { line: 5, character: 8 } },
      { start: { line: 4, character: 2 }, end: { line: 5, character: 8 } },
      { start: { line: 3, character: 0 }, end: { line: 5, character: 8 } },
    ]);
  });

  it('selection ranges for multiple documents', () => {
    const yaml = `
document1:
  key: value
---
document2:
  - 1
  - null
      `;
    const positions: Position[] = [
      {
        line: 5,
        character: 5,
      },
    ];
    const document = setupTextDocument(yaml);
    const ranges = getSelectionRanges(document, positions);
    expect(ranges.length).equal(positions.length);
    expectSelections(ranges[0], [
      { start: { line: 5, character: 4 }, end: { line: 5, character: 5 } },
      { start: { line: 5, character: 2 }, end: { line: 6, character: 8 } },
      { start: { line: 4, character: 0 }, end: { line: 6, character: 8 } },
    ]);
  });
});
