/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import { LocationLink, Range } from 'vscode-languageserver-types';
import { isSeq, isMap, isScalar, isPair, YAMLMap, Node, Pair } from 'yaml';
import { SingleYAMLDocument, YAMLDocument } from '../parser/yaml-documents';

// Find node within all yaml documents
export function findNodeFromPath(
  allDocuments: [string, YAMLDocument, TextDocument][],
  path: string[]
): [string, Pair<unknown, unknown>, TextDocument] | undefined {
  for (const [uri, docctx, doctxt] of allDocuments) {
    for (const doc of docctx.documents) {
      if (isMap(doc.internalDocument.contents)) {
        let node: YAMLMap<unknown, unknown> = doc.internalDocument.contents;
        let i = 0;
        // Follow path
        while (i < path.length) {
          const target = node.items.find(({ key: key }) => key == path[i]);
          if (target && i == path.length - 1) {
            return [uri, target, doctxt];
          } else if (target && isMap(target.value)) {
            node = target.value;
          } else {
            break;
          }
          ++i;
        }
      }
    }
  }
}

// Like findNodeFromPath but will follow extends tags
export function findNodeFromPathRecursive(
  allDocuments: [string, YAMLDocument, TextDocument][],
  path: string[],
  maxDepth = 16
): [string, Pair<unknown, unknown>, TextDocument][] {
  const result = [];
  let pathResult = findNodeFromPath(allDocuments, path);
  for (let i = 0; pathResult && i < maxDepth; ++i) {
    result.push(pathResult);
    const target = pathResult[1];
    path = null;
    if (isMap(target.value)) {
      // Find extends within result
      const extendsNode = findChildWithKey(target.value, 'extends');
      if (extendsNode) {
        // Only follow the first extends tag
        if (isScalar(extendsNode.value)) {
          path = [extendsNode.value.value as string];
        } else if (isSeq(extendsNode.value) && isScalar(extendsNode.value.items[0])) {
          path = [extendsNode.value.items[0].value as string];
        }
      }
    }
    if (path === null) {
      break;
    }
    pathResult = findNodeFromPath(allDocuments, path);
  }

  return result;
}

// Will create a LocationLink from a pair node
export function createDefinitionFromTarget(target: Pair<Node, Node>, document: TextDocument, uri: string): LocationLink {
  const start = target.key.range[0];
  const endDef = target.key.range[1];
  const endFull = target.value.range[2];
  const targetRange = Range.create(document.positionAt(start), document.positionAt(endFull));
  const selectionRange = Range.create(document.positionAt(start), document.positionAt(endDef));

  return LocationLink.create(uri, targetRange, selectionRange);
}

// Returns whether or not the node has a parent with the given key
// Useful to find the parent for nested nodes (e.g. extends with an array)
export function findParentWithKey(node: Node, key: string, currentDoc: SingleYAMLDocument, maxDepth = 2): Pair {
  let parent = currentDoc.getParent(node);
  for (let i = 0; i < maxDepth; ++i) {
    if (parent && isPair(parent) && isScalar(parent.key) && parent.key.value === key) {
      return parent;
    }
    parent = currentDoc.getParent(parent);
  }

  return null;
}

// Find if possible a child with the given key
export function findChildWithKey(node: YAMLMap, targetKey: string): Pair | undefined {
  return node.items.find(({ key: key }) => key == targetKey);
}
