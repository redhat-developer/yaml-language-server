/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { FoldingRange, Range } from 'vscode-languageserver-types';
import { FoldingRangesContext } from '../yamlTypes';
import { yamlDocumentsCache } from '../parser/yaml-documents';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { isMap, isNode, isPair, isScalar, isSeq, Node, visit, CST } from 'yaml';
import { YamlNode } from '../jsonASTTypes';
import { isCollectionItem } from '../utils/astUtils';

export function getFoldingRanges(document: TextDocument, context: FoldingRangesContext): FoldingRange[] | undefined {
  if (!document) {
    return;
  }
  const result: FoldingRange[] = [];
  const doc = yamlDocumentsCache.getYamlDocument(document);
  for (const ymlDoc of doc.documents) {
    if (doc.documents.length > 1) {
      result.push(createNormalizedFolding(document, ymlDoc.internalDocument.contents as Node));
    }
    visit(ymlDoc.internalDocument, (_, node, path) => {
      if (isMap(node) && isSeq(path[path.length - 1])) {
        result.push(createNormalizedFolding(document, node));
      }
      if (isPair(node) && node.value) {
        const valueNode = node.value;
        if (isMap(valueNode) || isSeq(valueNode)) {
          result.push(createNormalizedFolding(document, node));
        } else if (isScalar(valueNode)) {
          // check if it is a multi-line string
          const nodePosn = document.positionAt((node.key as Node).range[0]);
          let endPos: number;
          const commentToken = findCommentToken(node.srcToken);
          if (commentToken) {
            endPos = commentToken.offset + commentToken.source.length;
          } else {
            endPos = valueNode.range[1];
          }
          const valuePosn = document.positionAt(endPos);
          if (nodePosn.line !== valuePosn.line) {
            result.push(createNormalizedFolding(document, node, commentToken));
          }
        }
      }
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

function createNormalizedFolding(document: TextDocument, node: YamlNode, commentNode?: CST.SourceToken): FoldingRange {
  if (isNode(node) && node.range) {
    return createFolding(document, node.range[0], node.range[1]);
  } else if (isPair(node)) {
    let endPos: number;
    if (commentNode) {
      endPos = commentNode.offset + commentNode.source.length;
    } else {
      endPos = (node.value as Node).range[1];
    }
    return createFolding(document, (node.key as Node).range[0], endPos);
  }
  return undefined;
}

function createFolding(document: TextDocument, start: number, end: number): FoldingRange {
  const startPos = document.positionAt(start);
  let endPos = document.positionAt(end);
  const textFragment = document.getText(Range.create(startPos, endPos));
  const newLength = textFragment.length - textFragment.trimRight().length;
  if (newLength > 0) {
    endPos = document.positionAt(end - newLength);
  }
  return FoldingRange.create(startPos.line, endPos.line, startPos.character, endPos.character);
}

function findCommentToken(token: CST.Token | CST.CollectionItem): CST.SourceToken {
  if (isCollectionItem(token)) {
    if (token.sep) {
      return token.sep.find((it) => it.type === 'comment');
    }
  } else if (token.type && token.type === 'scalar' && token.end) {
    return token.end.find((it) => it.type === 'comment');
  }
}
