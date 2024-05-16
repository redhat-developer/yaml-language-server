/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DefinitionParams } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DefinitionLink, LocationLink, Range } from 'vscode-languageserver-types';
import { isAlias, isSeq, isMap, isScalar, isPair, isDocument, isNode, YAMLMap, Node, Pair, Scalar } from 'yaml';
import { Telemetry } from '../telemetry';
import { YAMLDocument, yamlDocumentsCache } from '../parser/yaml-documents';
import { matchOffsetToDocument } from '../utils/arrUtils';
import { convertErrorToTelemetryMsg } from '../utils/objects';
import { TextBuffer } from '../utils/textBuffer';
import { TextDocuments } from 'vscode-languageserver';

export class YamlDefinition {
  constructor(private readonly telemetry?: Telemetry) {}

  // Find node within all yaml documents
  findNodeFromPath(allDocuments: [string, YAMLDocument, TextDocument][], path: string[]): [string, Pair<unknown, unknown>, TextDocument] | undefined {
    for (let [uri, docctx, doctxt] of allDocuments) {
      for (let doc of docctx.documents) {
        if (isMap(doc.internalDocument.contents)) {
          let node: YAMLMap<unknown, unknown> = doc.internalDocument.contents;
          let i = 0;
          while (i < path.length) {
            const target = node.items.find(({key: key}) => key == path[i]);
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

  createDefinitionFromTarget(target: Pair<Node, Node>, document: TextDocument, uri: string): LocationLink[] | undefined {
    const start = target.key.range[0];
    const endDef = target.key.range[1];
    const endFull = target.value.range[2];
    const targetRange = Range.create(document.positionAt(start), document.positionAt(endFull));
    const selectionRange = Range.create(document.positionAt(start), document.positionAt(endDef));

    return [LocationLink.create(uri, targetRange, selectionRange)];
  }

  getDefinition(document: TextDocument, params: DefinitionParams, documents: TextDocuments<TextDocument>): DefinitionLink[] | undefined {
    try {
      // Ensure caching of all documents
      for (let doc of documents.all()) {
        yamlDocumentsCache.getYamlDocument(doc);
      }

      const all = yamlDocumentsCache.getAllDocuments();
      const yamlDocument = yamlDocumentsCache.getYamlDocument(document);
      const offset = document.offsetAt(params.position);
      const currentDoc = matchOffsetToDocument(offset, yamlDocument);
      if (currentDoc) {
        const [node] = currentDoc.getNodeFromPosition(offset, new TextBuffer(document));
        const parent = currentDoc.getParent(node);
        if (node && isAlias(node)) {
          const defNode = node.resolve(currentDoc.internalDocument);
          if (defNode && defNode.range) {
            const targetRange = Range.create(document.positionAt(defNode.range[0]), document.positionAt(defNode.range[2]));
            const selectionRange = Range.create(document.positionAt(defNode.range[0]), document.positionAt(defNode.range[1]));
            return [LocationLink.create(document.uri, targetRange, selectionRange)];
          }
        } else if (node && isScalar(node) && parent && isPair(parent) && isScalar(parent.key) && parent.key.value === 'extends' && isMap(currentDoc.internalDocument.contents)) {
          const pathResult = this.findNodeFromPath(all, [node.value as string]);
          if (pathResult) {
            const [uri, target, targetDocument] = pathResult;
            return this.createDefinitionFromTarget(target as Pair<Node, Node>, targetDocument, uri);
          }
        } else if (node && isScalar(node) && parent && isSeq(parent) && parent.tag === '!reference') {
          const pathResult = this.findNodeFromPath(all, parent.items.map((item: Scalar) => item.value as string));
          if (pathResult) {
            const [uri, target, targetDocument] = pathResult;
            return this.createDefinitionFromTarget(target as Pair<Node, Node>, targetDocument, uri);
          }
        }
      }
    } catch (err) {
      this.telemetry?.sendError('yaml.definition.error', { error: convertErrorToTelemetryMsg(err) });
    }

    return undefined;
  }
}
