import { expect } from 'chai';
import { Position, Range } from 'vscode-languageserver-types';
import { setupTextDocument } from './utils/testHelper';
import { getSelectionRanges } from '../src/languageservice/services/yamlSelectionRanges';

describe('YAML Selection Ranges Tests', () => {
  it('should provide selection ranges for object', () => {
    const yaml = 'foo: bar';
    const positions: Position[] = [
      {
        line: 0,
        character: 1,
      },
    ];
    const document = setupTextDocument(yaml);
    const ranges = getSelectionRanges(document, positions);
    expect(ranges.length).equal(positions.length);
    expect(ranges[0].range).eql(Range.create({ line: 0, character: 0 }, { line: 0, character: 3 }));
    expect(ranges[0].parent.range).eql(Range.create({ line: 0, character: 0 }, { line: 0, character: 8 }));
  });
});
