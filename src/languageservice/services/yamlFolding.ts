/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { FoldingRange, Range } from 'vscode-languageserver';
import { FoldingRangesContext } from '../yamlTypes';
import { ASTNode } from '../jsonASTTypes';
import { yamlDocumentsCache } from '../parser/yaml-documents';
import { TextDocument } from 'vscode-languageserver-textdocument';

export function getFoldingRanges(document: TextDocument, context: FoldingRangesContext): FoldingRange[] | undefined {
  if (!document) {
    return;
  }
  const result: FoldingRange[] = [];
  const doc = yamlDocumentsCache.getYamlDocument(document);
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
  if (context && context.onRangeLimitExceeded) {
    context.onRangeLimitExceeded(document.uri);
  }

  return result.slice(0, context.rangeLimit);
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
