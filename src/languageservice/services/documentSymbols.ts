/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Location, Range, SymbolKind } from 'vscode-languageserver-types';
import type { DocumentSymbol, SymbolInformation } from 'vscode-languageserver-types';
import type { DocumentSymbolsContext, ASTNode, PropertyASTNode } from '../jsonLanguageTypes';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { yamlDocumentsCache } from '../parser/yaml-documents';
import type { Telemetry } from '../telemetry';
import { isMap, isSeq } from 'yaml';

export class YAMLDocumentSymbols {
  constructor(private readonly telemetry?: Telemetry) {}

  public findDocumentSymbols(
    document: TextDocument,
    context: DocumentSymbolsContext = { resultLimit: Number.MAX_VALUE }
  ): SymbolInformation[] {
    let results: SymbolInformation[] = [];
    try {
      const doc = yamlDocumentsCache.getYamlDocument(document);
      if (!doc || doc.documents.length === 0) {
        return null;
      }

      for (const yamlDoc of doc.documents) {
        if (yamlDoc.root) {
          results = results.concat(this.findFlatDocumentSymbols(document, yamlDoc.root, context));
        }
      }
    } catch (err) {
      this.telemetry?.sendError('yaml.documentSymbols.error', err);
    }
    return results;
  }

  public findHierarchicalDocumentSymbols(
    document: TextDocument,
    context: DocumentSymbolsContext = { resultLimit: Number.MAX_VALUE }
  ): DocumentSymbol[] {
    let results: DocumentSymbol[] = [];
    try {
      const doc = yamlDocumentsCache.getYamlDocument(document);
      if (!doc || doc.documents.length === 0) {
        return null;
      }

      for (const yamlDoc of doc.documents) {
        if (yamlDoc.root) {
          results = results.concat(this.findHierarchicalSymbols(document, yamlDoc.root, context));
        }
      }
    } catch (err) {
      this.telemetry?.sendError('yaml.hierarchicalDocumentSymbols.error', err);
    }

    return results;
  }

  private findFlatDocumentSymbols(document: TextDocument, root: ASTNode, context: DocumentSymbolsContext): SymbolInformation[] {
    let limit = context.resultLimit || Number.MAX_VALUE;
    const toVisit: { node: ASTNode; containerName: string }[] = [{ node: root, containerName: '' }];
    let nextToVisit = 0;
    let limitExceeded = false;
    const result: SymbolInformation[] = [];

    const collectOutlineEntries = (node: ASTNode, containerName: string): void => {
      if (node.type === 'array') {
        node.items.forEach((item) => {
          if (item) {
            toVisit.push({ node: item, containerName });
          }
        });
      } else if (node.type === 'object') {
        node.properties.forEach((property: PropertyASTNode) => {
          const valueNode = property.valueNode;
          if (!valueNode) {
            return;
          }
          if (limit > 0) {
            limit--;
            const location = Location.create(document.uri, getRange(document, property));
            const childContainerName = containerName ? containerName + '.' + property.keyNode.value : property.keyNode.value;
            result.push({
              name: getKeyLabel(property),
              kind: getSymbolKind(valueNode.type),
              location,
              containerName,
            });
            toVisit.push({ node: valueNode, containerName: childContainerName });
          } else {
            limitExceeded = true;
          }
        });
      }
    };

    while (nextToVisit < toVisit.length) {
      const next = toVisit[nextToVisit++];
      collectOutlineEntries(next.node, next.containerName);
    }

    if (limitExceeded) {
      context.onResultLimitExceeded?.(document.uri);
    }
    return result;
  }

  private findHierarchicalSymbols(document: TextDocument, root: ASTNode, context: DocumentSymbolsContext): DocumentSymbol[] {
    let limit = context.resultLimit || Number.MAX_VALUE;
    const result: DocumentSymbol[] = [];
    const toVisit: { node: ASTNode; result: DocumentSymbol[] }[] = [{ node: root, result }];
    let nextToVisit = 0;
    let limitExceeded = false;

    const collectOutlineEntries = (node: ASTNode, result: DocumentSymbol[]): void => {
      if (node.type === 'array') {
        node.items.forEach((item, index) => {
          if (!item) {
            return;
          }
          if (limit > 0) {
            limit--;
            const range = getRange(document, item);
            const symbol = {
              name: String(index),
              kind: getSymbolKind(item.type),
              range,
              selectionRange: range,
              children: [],
            };
            result.push(symbol);
            toVisit.push({ result: symbol.children, node: item });
          } else {
            limitExceeded = true;
          }
        });
      } else if (node.type === 'object') {
        node.properties.forEach((property: PropertyASTNode) => {
          const valueNode = property.valueNode;
          if (!valueNode) {
            return;
          }
          if (limit > 0) {
            limit--;
            const children: DocumentSymbol[] = [];
            const symbol: DocumentSymbol = {
              name: getKeyLabel(property),
              kind: getSymbolKind(valueNode.type),
              range: getRange(document, property),
              selectionRange: getRange(document, property.keyNode),
              children,
              detail: getDetail(valueNode),
            };
            result.push(symbol);
            toVisit.push({ result: children, node: valueNode });
          } else {
            limitExceeded = true;
          }
        });
      }
    };

    while (nextToVisit < toVisit.length) {
      const next = toVisit[nextToVisit++];
      collectOutlineEntries(next.node, next.result);
    }

    if (limitExceeded) {
      context.onResultLimitExceeded?.(document.uri);
    }
    return result;
  }
}

function getSymbolKind(nodeType: string): SymbolKind {
  switch (nodeType) {
    case 'object':
      return SymbolKind.Module;
    case 'string':
      return SymbolKind.String;
    case 'number':
      return SymbolKind.Number;
    case 'array':
      return SymbolKind.Array;
    case 'boolean':
      return SymbolKind.Boolean;
    default:
      return SymbolKind.Variable;
  }
}

function getKeyLabel(property: PropertyASTNode): string {
  const keyNode = property.keyNode.internalNode;
  let name: string;
  if (isMap(keyNode)) {
    name = '{}';
  } else if (isSeq(keyNode)) {
    name = '[]';
  } else if ('source' in keyNode && typeof keyNode.source === 'string') {
    name = keyNode.source;
  } else {
    name = property.keyNode.value;
  }

  if (name) {
    name = name.replace(/[\n]/g, '↵');
  }
  if (name && name.trim()) {
    return name;
  }
  return `"${name}"`;
}

function getDetail(node: ASTNode | undefined): string | undefined {
  if (!node) {
    return undefined;
  }
  if (node.type === 'boolean' || node.type === 'number' || node.type === 'null' || node.type === 'string') {
    return String(node.value);
  }
  if (node.type === 'array') {
    return node.children.length ? undefined : '[]';
  }
  if (node.type === 'object') {
    return node.children.length ? undefined : '{}';
  }
  return undefined;
}

function getRange(document: TextDocument, node: ASTNode): Range {
  return Range.create(document.positionAt(node.offset), document.positionAt(node.offset + node.length));
}
