/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Document, isDocument, isScalar, Node, visit as cstVisit, YAMLMap, YAMLSeq } from 'yaml';
import { CollectionItem, SourceToken, Document as cstDocument } from 'yaml/dist/parse/cst';
import { VisitPath } from 'yaml/dist/parse/cst-visit';

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

export type Visitor = (item: SourceToken, path: VisitPath) => number | symbol | Visitor | void;

export function visit(cst: cstDocument | CollectionItem, visitor: Visitor): void {
  if ('type' in cst && cst.type === 'document') {
    cst = { start: cst.start, value: cst.value };
  }
  _visit(Object.freeze([]), (cst as unknown) as SourceToken, visitor);
}

function _visit(path: VisitPath, item: SourceToken, visitor: Visitor): number | symbol | Visitor | void {
  let ctrl = visitor(item, path);
  if (typeof ctrl === 'symbol') return ctrl;
  for (const field of ['key', 'value'] as const) {
    const token = item[field];
    if (token && 'items' in token) {
      for (let i = 0; i < token.items.length; ++i) {
        const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
        if (typeof ci === 'number') i = ci - 1;
        else if (ci === cstVisit.BREAK) return cstVisit.BREAK;
        else if (ci === cstVisit.REMOVE) {
          token.items.splice(i, 1);
          i -= 1;
        }
      }
      if (typeof ctrl === 'function' && field === 'key') ctrl = ctrl(item, path);
    }
  }

  const token = item['sep'];
  if (token) {
    for (let i = 0; i < token.length; ++i) {
      const ci = _visit(Object.freeze(path), token[i], visitor);
      if (typeof ci === 'number') i = ci - 1;
      else if (ci === cstVisit.BREAK) return cstVisit.BREAK;
      else if (ci === cstVisit.REMOVE) {
        token.items.splice(i, 1);
        i -= 1;
      }
    }
  }
  return typeof ctrl === 'function' ? ctrl(item, path) : ctrl;
}
