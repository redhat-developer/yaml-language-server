/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Document, isDocument, isNode, isScalar, Node, visit, YAMLMap } from 'yaml';

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
