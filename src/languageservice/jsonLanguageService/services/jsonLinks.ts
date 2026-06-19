/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Forked from vscode-json-languageservice@6.0.0-next.1
// Source: https://github.com/microsoft/vscode-json-languageservice/blob/810471bbb462bb6b87351c2232e209a3bb4062ca/src/services/jsonLinks.ts

import type { DocumentLink } from 'vscode-languageserver-types';
import { Range } from 'vscode-languageserver-types';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { ASTNode, PropertyASTNode } from '../../jsonASTTypes';
import type { JSONDocument } from '../../parser/jsonDocument';

export function findLinks(document: TextDocument, doc: JSONDocument): PromiseLike<DocumentLink[]> {
  const links: DocumentLink[] = [];
  doc.visit((node) => {
    if (node.type === 'property' && node.keyNode.value === '$ref' && node.valueNode?.type === 'string') {
      const path = node.valueNode.value;
      const targetNode = findTargetNode(doc, path);
      if (targetNode) {
        const targetPos = document.positionAt(targetNode.offset);
        links.push({
          target: `${document.uri}#${targetPos.line + 1},${targetPos.character + 1}`,
          range: createRange(document, node.valueNode),
        });
      }
    }
    return true;
  });
  return Promise.resolve(links);
}

function createRange(document: TextDocument, node: ASTNode): Range {
  return Range.create(document.positionAt(node.offset + 1), document.positionAt(node.offset + node.length - 1));
}

function findTargetNode(doc: JSONDocument, path: string): ASTNode | null {
  const tokens = parseJSONPointer(path);
  if (!tokens) {
    return null;
  }
  return findNode(tokens, doc.root);
}

function findNode(pointer: string[], node: ASTNode | null | undefined): ASTNode | null {
  if (!node) {
    return null;
  }
  if (pointer.length === 0) {
    return node;
  }

  const token: string = pointer.shift() as string;
  if (node && node.type === 'object') {
    const propertyNode: PropertyASTNode | undefined = node.properties.find(
      (propertyNode) => propertyNode.keyNode.value === token
    );
    if (!propertyNode) {
      return null;
    }
    return findNode(pointer, propertyNode.valueNode);
  } else if (node && node.type === 'array') {
    if (token.match(/^(0|[1-9][0-9]*)$/)) {
      const index = Number.parseInt(token);
      const arrayItem = node.items[index];
      if (!arrayItem) {
        return null;
      }
      return findNode(pointer, arrayItem);
    }
  }
  return null;
}

function parseJSONPointer(path: string): string[] | null {
  if (path === '#') {
    return [];
  }

  if (path[0] !== '#' || path[1] !== '/') {
    return null;
  }

  return path.substring(2).split(/\//).map(unescape);
}

function unescape(str: string): string {
  return str.replace(/~1/g, '/').replace(/~0/g, '~');
}
