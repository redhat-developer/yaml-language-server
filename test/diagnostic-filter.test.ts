/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import {
  filterSuppressedDiagnostics,
  YAML_LINT_DISABLE_PATTERN,
  parseDisableSpecifiers,
  shouldSuppressDiagnostic,
  GetLineText,
} from '../src/languageservice/utils/diagnostic-filter';

function makeDiag(startLine: number, message: string): { startLine: number; message: string } {
  return { startLine, message };
}

function linesOf(lines: string[]): GetLineText {
  return (line: number) => (line >= 0 && line < lines.length ? lines[line] : undefined);
}

describe('YAML_LINT_DISABLE_PATTERN', () => {
  it('should capture specifiers in group 1', () => {
    const match = YAML_LINT_DISABLE_PATTERN.exec('# yaml-lint-disable Incorrect type, not accepted');
    expect(match).to.not.be.null;
    expect(match[1].trim()).to.equal('Incorrect type, not accepted');
  });

  it('should capture empty group 1 when no specifiers given', () => {
    const match = YAML_LINT_DISABLE_PATTERN.exec('# yaml-lint-disable');
    expect(match).to.not.be.null;
    expect(match[1].trim()).to.equal('');
  });
});

describe('parseDisableSpecifiers', () => {
  it('should return empty array for empty string', () => {
    expect(parseDisableSpecifiers('')).to.deep.equal([]);
  });

  it('should return empty array for whitespace-only string', () => {
    expect(parseDisableSpecifiers('   ')).to.deep.equal([]);
  });

  it('should parse a single specifier', () => {
    expect(parseDisableSpecifiers('Incorrect type')).to.deep.equal(['incorrect type']);
  });

  it('should parse comma-separated specifiers', () => {
    expect(parseDisableSpecifiers('Incorrect type, not accepted')).to.deep.equal(['incorrect type', 'not accepted']);
  });

  it('should trim whitespace around specifiers', () => {
    expect(parseDisableSpecifiers('  foo ,  bar  ')).to.deep.equal(['foo', 'bar']);
  });

  it('should ignore empty entries from trailing commas', () => {
    expect(parseDisableSpecifiers('foo,')).to.deep.equal(['foo']);
  });

  it('should lower-case all specifiers', () => {
    expect(parseDisableSpecifiers('Value Is NOT Accepted')).to.deep.equal(['value is not accepted']);
  });
});

describe('shouldSuppressDiagnostic', () => {
  it('should suppress when specifiers is empty (suppress all)', () => {
    expect(shouldSuppressDiagnostic([], 'any message')).to.be.true;
  });

  it('should suppress when message contains the specifier (case-insensitive)', () => {
    expect(shouldSuppressDiagnostic(['incorrect type'], 'Incorrect type. Expected string.')).to.be.true;
  });

  it('should not suppress when message does not contain the specifier', () => {
    expect(shouldSuppressDiagnostic(['not accepted'], 'Incorrect type. Expected string.')).to.be.false;
  });

  it('should suppress when any of multiple specifiers matches', () => {
    expect(shouldSuppressDiagnostic(['not accepted', 'incorrect type'], 'Incorrect type. Expected string.')).to.be.true;
  });

  it('should not suppress when none of multiple specifiers match', () => {
    expect(shouldSuppressDiagnostic(['not accepted', 'missing property'], 'Incorrect type. Expected string.')).to.be.false;
  });
});

describe('filterSuppressedDiagnostics', () => {
  const filter = (diagnostics: ReturnType<typeof makeDiag>[], lines: GetLineText): ReturnType<typeof makeDiag>[] =>
    filterSuppressedDiagnostics(
      diagnostics,
      (d) => d.startLine,
      (d) => d.message,
      lines
    );

  it('should return all diagnostics when there are no suppression comments', () => {
    const lines = linesOf(['key: value', 'other: 123']);
    const diagnostics = [makeDiag(0, 'error on line 0'), makeDiag(1, 'error on line 1')];

    const result = filter(diagnostics, lines);

    expect(result).to.have.length(2);
  });

  it('should suppress all diagnostics when no specifiers are given', () => {
    const lines = linesOf(['name: hello', '# yaml-lint-disable', 'age: not-a-number']);
    const diagnostics = [makeDiag(2, 'Incorrect type'), makeDiag(2, 'Value not accepted')];

    const result = filter(diagnostics, lines);

    expect(result).to.be.empty;
  });

  it('should suppress only matching diagnostics when specifiers are given', () => {
    const lines = linesOf(['name: hello', '# yaml-lint-disable Incorrect type', 'age: not-a-number']);
    const diagnostics = [makeDiag(2, 'Incorrect type. Expected string.'), makeDiag(2, 'Value is not accepted.')];

    const result = filter(diagnostics, lines);

    expect(result).to.have.length(1);
    expect(result[0].message).to.equal('Value is not accepted.');
  });

  it('should suppress diagnostics matching any of multiple comma-separated specifiers', () => {
    const lines = linesOf(['# yaml-lint-disable Incorrect type, not accepted', 'key: bad']);
    const diagnostics = [
      makeDiag(1, 'Incorrect type. Expected string.'),
      makeDiag(1, 'Value is not accepted.'),
      makeDiag(1, 'Missing required property "name".'),
    ];

    const result = filter(diagnostics, lines);

    expect(result).to.have.length(1);
    expect(result[0].message).to.equal('Missing required property "name".');
  });

  it('should match specifiers case-insensitively', () => {
    const lines = linesOf(['# yaml-lint-disable incorrect TYPE', 'key: bad']);
    const diagnostics = [makeDiag(1, 'Incorrect type. Expected string.')];

    const result = filter(diagnostics, lines);

    expect(result).to.be.empty;
  });

  it('should keep diagnostics on lines NOT preceded by a disable comment', () => {
    const lines = linesOf(['name: hello', '# yaml-lint-disable', 'age: bad', 'score: bad']);
    const diagnostics = [makeDiag(2, 'error on line 2'), makeDiag(3, 'error on line 3')];

    const result = filter(diagnostics, lines);

    expect(result).to.have.length(1);
    expect(result[0].message).to.equal('error on line 3');
  });

  it('should not filter a diagnostic on line 0 (no preceding line)', () => {
    const lines = linesOf(['bad: value']);
    const diagnostics = [makeDiag(0, 'error on first line')];

    const result = filter(diagnostics, lines);

    expect(result).to.have.length(1);
  });

  it('should handle indented disable comments', () => {
    const lines = linesOf(['root:', '  # yaml-lint-disable', '  child: bad-value']);
    const diagnostics = [makeDiag(2, 'invalid value')];

    const result = filter(diagnostics, lines);

    expect(result).to.be.empty;
  });

  it('should not suppress when the disable comment is two lines above', () => {
    const lines = linesOf(['# yaml-lint-disable', 'good: value', 'bad: value']);
    const diagnostics = [makeDiag(2, 'error on line 2')];

    const result = filter(diagnostics, lines);

    expect(result).to.have.length(1);
  });

  it('should handle multiple disable comments for different lines', () => {
    const lines = linesOf(['# yaml-lint-disable', 'line1: bad', 'line2: ok', '# yaml-lint-disable', 'line4: also-bad']);
    const diagnostics = [makeDiag(1, 'error on line 1'), makeDiag(2, 'error on line 2'), makeDiag(4, 'error on line 4')];

    const result = filter(diagnostics, lines);

    expect(result).to.have.length(1);
    expect(result[0].message).to.equal('error on line 2');
  });

  it('should return all diagnostics when the document cannot be read', () => {
    const noDocument: GetLineText = () => undefined;
    const diagnostics = [makeDiag(1, 'some error')];

    const result = filter(diagnostics, noDocument);

    expect(result).to.have.length(1);
  });

  it('should return an empty array when given no diagnostics', () => {
    const lines = linesOf(['# yaml-lint-disable', 'key: value']);

    const result = filter([], lines);

    expect(result).to.be.empty;
  });

  it('should not treat a non-comment line containing the keyword as suppression', () => {
    const lines = linesOf(['key: yaml-lint-disable', 'other: bad']);
    const diagnostics = [makeDiag(1, 'error on line 1')];

    const result = filter(diagnostics, lines);

    expect(result).to.have.length(1);
  });

  it('should handle disable comment with trailing explanation text as a specifier', () => {
    const lines = linesOf(['# yaml-lint-disable invalid value', 'key: bad-value']);
    const diagnostics = [makeDiag(1, 'invalid value')];

    const result = filter(diagnostics, lines);

    expect(result).to.be.empty;
  });

  it('should keep a non-matching diagnostic even when specifier is present', () => {
    const lines = linesOf(['# yaml-lint-disable missing property', 'key: bad-value']);
    const diagnostics = [makeDiag(1, 'Incorrect type. Expected string.')];

    const result = filter(diagnostics, lines);

    expect(result).to.have.length(1);
  });
});
