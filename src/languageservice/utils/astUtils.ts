/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Document, isDocument, isScalar, Node, visit as cstVisit, YAMLMap, YAMLSeq } from 'yaml';

export function getParent(doc: Document, nodeToFind: Node): Node | undefined {
  let parentNode: Node;
  cstVisit(doc, (_, node: Node, path) => {
    if (node === nodeToFind) {
      parentNode = path[path.length - 1] as Node;
      return cstVisit.BREAK;
    }
  });

  if (isDocument(parentNode)) {
    return undefined;
  }

  return parentNode;
}
export function isMapContainsEmptyPair(map: YAMLMap): boolean {
  if (map.items.length > 1) {
    return false;
  }

  const pair = map.items[0];
  if (isScalar(pair.key) && isScalar(pair.value) && pair.key.value === '' && !pair.value.value) {
    return true;
  }

  return false;
}

export function indexOf(seq: YAMLSeq, item: Node): number | undefined {
  for (const [i, obj] of seq.items.entries()) {
    if (item === obj) {
      return i;
    }
  }
  return undefined;
}
