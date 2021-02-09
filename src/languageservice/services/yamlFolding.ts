/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TextDocument, FoldingRange, Range } from 'vscode-languageserver';
import { FoldingRangesContext } from '../yamlTypes';
import { parse as parseYAML } from '../parser/yamlParser07';
import { ASTNode } from '../jsonASTTypes';

export function getFoldingRanges(document: TextDocument, context: FoldingRangesContext): FoldingRange[] | undefined {
  if (!document) {
    return;
  }
  const result: FoldingRange[] = [];
  const doc = parseYAML(document.getText());
  for (const ymlDoc of doc.documents) {
    ymlDoc.visit((node) => {
      if (
        (node.type === 'property' && node.valueNode.type === 'array') ||
        (node.type === 'object' && node.parent?.type === 'array')
      ) {
        result.push(creteNormalizedFolding(document, node));
      }
      if (node.type === 'property' && node.valueNode.type === 'object') {
        result.push(creteNormalizedFolding(document, node));
      }

      return true;
    });
  }

  const rangeLimit = context && context.rangeLimit;
  if (typeof rangeLimit !== 'number' || result.length <= rangeLimit) {
    return result;
  }

  return result.slice(0, context.rangeLimit - 1);
}

function creteNormalizedFolding(document: TextDocument, node: ASTNode): FoldingRange {
  const startPos = document.positionAt(node.offset);
  let endPos = document.positionAt(node.offset + node.length);
  const textFragment = document.getText(Range.create(startPos, endPos));
  const newLength = textFragment.length - textFragment.trimRight().length;
  if (newLength > 0) {
    endPos = document.positionAt(node.offset + node.length - newLength);
  }
  return FoldingRange.create(startPos.line, endPos.line, startPos.character, endPos.character);
}
