/*---------------------------------------------------------------------------------------------
 *  Copyright (c) IBM Corp. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CST, Scalar } from 'yaml';
import { FlowScalar } from 'yaml/dist/parse/cst';

export class BlockStringRewriter {
  constructor(
    private readonly indentation: string,
    private readonly maxLineLength: number
  ) {}

  public writeFoldedBlockScalar(node: Scalar<string>): string | null {
    if (node.type !== 'QUOTE_DOUBLE' && node.type !== 'QUOTE_SINGLE') {
      return null;
    }

    const stringContent = node.value;
    const currentIndentNum = (node.srcToken as FlowScalar).indent;
    let indentText = this.indentation;
    for (let i = 0; i < currentIndentNum / this.indentation.length; i++) {
      indentText += this.indentation;
    }

    const lines: string[] = [];
    const splitLines = stringContent.split('\n');
    for (const line of splitLines) {
      let remainder = line;
      slicing: while (remainder.length > this.maxLineLength) {
        let location = this.maxLineLength;
        // for folded strings, space characters are placed in place of each line break
        // so we need to split the line on a space and remove the space
        while (!/ /.test(remainder.charAt(location))) {
          location++;
          if (location >= remainder.length) {
            break slicing;
          }
        }
        // however any leading space characters will be taken literally and also a newline gets inserted
        // so instead we need them to be trailing
        // which could be problematic as "trim trailing whitespace" is a common setting to have enabled but oh well
        while (/ /.test(remainder.charAt(location))) {
          location++;
          if (location >= remainder.length) {
            break slicing;
          }
        }
        const head = remainder.substring(
          0,
          location - 1 /* -1 to remove one space character, which is automatically added between lines */
        );
        lines.push(head);
        remainder = remainder.substring(location);
      }
      lines.push(remainder);
      lines.push('\n');
    }
    // no trailng newline
    lines.pop();

    for (let i = 1; i < lines.length; ) {
      if (/^[ \t]+$/.test(lines[i])) {
        if (lines[i - 1] === '\n' || lines[i - 1] === '') {
          lines.splice(i - 1, 1);
          // i now points to the next entry,
          // i - 1 points to the current entry
          // so do not increment i
          continue;
        } else {
          // It's unconvertable, give up
          // Explanation:
          // If the line of text is only whitespace and it's more whitespace than the expected indentation,
          // then it's joined with the previous line with a real newline instead of a space.
          // This means an extra newline gets inserted if we change nothing.
          // We can avoid this if the preceeding text is a newline,
          // because we can just remove the preceeding newline to compensate,
          // but if it's not we are SOL
          return null;
        }
      }
      i++;
    }

    let blockScalarHeaderSource = '>';
    if (lines[lines.length - 1] !== '\n' && lines[lines.length - 1] !== '') {
      blockScalarHeaderSource += '-';
    } else if (
      (lines[lines.length - 2] === '\n' || lines[lines.length - 2] === '') &&
      lines[lines.length - 3] !== '\n' &&
      lines[lines.length - 3] !== ''
    ) {
      lines.splice(lines.length - 2, 2);
    } else {
      blockScalarHeaderSource += '+';
    }
    if (/ /.test(stringContent.charAt(0))) {
      blockScalarHeaderSource += `${indentText.length}`;
    }

    const newProps: CST.Token[] = lines.flatMap((line) => {
      if (line === '\n' || line === '') {
        // newlines can be represented as two newlines in folded blocks
        return [
          {
            type: 'newline',
            indent: 0,
            offset: node.srcToken.offset,
            source: '\n',
          },
        ];
      }
      return [
        {
          type: 'newline',
          indent: 0,
          offset: node.srcToken.offset,
          source: '\n',
        },
        {
          type: 'space',
          indent: 0,
          offset: node.srcToken.offset,
          source: indentText,
        },
        {
          type: 'scalar',
          indent: 0,
          offset: node.srcToken.offset,
          source: line,
        },
      ];
    });

    newProps.unshift({
      type: 'block-scalar-header',
      source: blockScalarHeaderSource,
      offset: node.srcToken.offset,
      indent: 0,
    });

    const blockString: CST.BlockScalar = {
      type: 'block-scalar',
      offset: node.srcToken.offset,
      indent: 0,
      source: '',
      props: newProps,
    };

    return CST.stringify(blockString as CST.Token);
  }

  public writeLiteralBlockScalar(node: Scalar<string>): string | null {
    if (node.type !== 'QUOTE_DOUBLE' && node.type !== 'QUOTE_SINGLE') {
      return null;
    }

    const stringContent = node.value;
    // I don't think it's worth it
    if (stringContent.indexOf('\n') < 0) {
      return null;
    }
    const currentIndentNum = (node.srcToken as FlowScalar).indent;
    let indentText = this.indentation;
    for (let i = 0; i < currentIndentNum / this.indentation.length; i++) {
      indentText += this.indentation;
    }

    const lines: string[] = stringContent.split('\n');

    let blockScalarHeaderSource = '|';
    if (lines[lines.length - 1] !== '\n' && lines[lines.length - 1] !== '') {
      blockScalarHeaderSource += '-';
    } else if (lines[lines.length - 2] !== '\n' && lines[lines.length - 2] !== '') {
      lines.splice(lines.length - 1, 1);
    } else {
      blockScalarHeaderSource += '+';
    }
    if (/ /.test(stringContent.charAt(0))) {
      blockScalarHeaderSource += `${indentText.length}`;
    }

    const newProps: CST.Token[] = lines.flatMap((line) => {
      if (line === '') {
        return [
          {
            type: 'newline',
            indent: 0,
            offset: node.srcToken.offset,
            source: '\n',
          },
        ];
      }
      return [
        {
          type: 'newline',
          indent: 0,
          offset: node.srcToken.offset,
          source: '\n',
        },
        {
          type: 'space',
          indent: 0,
          offset: node.srcToken.offset,
          source: indentText,
        },
        {
          type: 'scalar',
          indent: 0,
          offset: node.srcToken.offset,
          source: line,
        },
      ];
    });

    newProps.unshift({
      type: 'block-scalar-header',
      source: blockScalarHeaderSource,
      offset: node.srcToken.offset,
      indent: 0,
    });

    const blockString: CST.BlockScalar = {
      type: 'block-scalar',
      offset: node.srcToken.offset,
      indent: 0,
      source: '',
      props: newProps,
    };

    return CST.stringify(blockString as CST.Token);
  }
}
