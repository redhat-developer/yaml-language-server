/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Document, isDocument, Node, Pair, visit } from 'yaml';

export function getParent(doc: Document, nodeToFind: Node): Node | undefined {
  let parentNode: Node;
  visit(doc, (_, node: Node, path) => {
    if (node === nodeToFind) {
      parentNode = path[path.length - 1] as Node;
      return visit.BREAK;
    }
  });

  if (isDocument(parentNode)) {
    return undefined;
  }

  return parentNode;
}

export function getNodePath(doc: Document, node: Node): readonly (Document | Node | Pair)[] | undefined {
  let result: readonly (Document | Node | Pair)[];
  visit(doc, (_, vNode: Node, path) => {
    if (node === vNode) {
      result = path;
      return visit.BREAK;
    }
  });
  return result;
}
