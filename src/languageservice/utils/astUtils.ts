/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Document, isDocument, isScalar, Node, visit, YAMLMap, YAMLSeq } from 'yaml';
import { CollectionItem, SourceToken, Token } from 'yaml/dist/parse/cst';
import { VisitPath } from 'yaml/dist/parse/cst-visit';
import { YamlNode } from '../jsonASTTypes';

type Visitor = (item: SourceToken, path: VisitPath) => number | symbol | Visitor | void;

export function getParent(doc: Document, nodeToFind: YamlNode): YamlNode | undefined {
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
  return isScalar(pair.key) && isScalar(pair.value) && pair.key.value === '' && !pair.value.value;
}

export function indexOf(seq: YAMLSeq, item: YamlNode): number | undefined {
  for (const [i, obj] of seq.items.entries()) {
    if (item === obj) {
      return i;
    }
  }
  return undefined;
}

/**
 * Check that given offset is in YAML comment
 * @param doc the yaml document
 * @param offset the offset to check
 */
export function isInComment(tokens: Token[], offset: number): boolean {
  let inComment = false;
  for (const token of tokens) {
    if (token.type === 'document') {
      _visit([], token as unknown as SourceToken, (item) => {
        if (isCollectionItem(item) && item.value?.type === 'comment') {
          if (token.offset <= offset && item.value.source.length + item.value.offset >= offset) {
            inComment = true;
            return visit.BREAK;
          }
        } else if (item.type === 'comment' && item.offset <= offset && item.offset + item.source.length >= offset) {
          inComment = true;
          return visit.BREAK;
        }
      });
    } else if (token.type === 'comment') {
      if (token.offset <= offset && token.source.length + token.offset >= offset) {
        return true;
      }
    }
    if (inComment) {
      break;
    }
  }

  return inComment;
}

export function isCollectionItem(token: unknown): token is CollectionItem {
  return token['start'] !== undefined;
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
        else if (ci === visit.BREAK) return visit.BREAK;
        else if (ci === visit.REMOVE) {
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
      else if (ci === visit.BREAK) return visit.BREAK;
      else if (ci === visit.REMOVE) {
        token.items.splice(i, 1);
        i -= 1;
      }
    }
  }
  return typeof ctrl === 'function' ? ctrl(item, path) : ctrl;
}
