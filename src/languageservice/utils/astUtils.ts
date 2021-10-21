/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Document, isDocument, Node, visit, YAMLSeq } from 'yaml';

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

export function indexOf(seq: YAMLSeq, item: Node): number | undefined {
  for (const [i, obj] of seq.items.entries()) {
    if (item === obj) {
      return i;
    }
  }
  return undefined;
}
