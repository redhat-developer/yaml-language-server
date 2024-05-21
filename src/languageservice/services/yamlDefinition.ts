/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DefinitionParams } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DefinitionLink, LocationLink, Range } from 'vscode-languageserver-types';
import { isAlias, isSeq, isMap, isScalar, isPair, YAMLMap, Node, Pair, Scalar } from 'yaml';
import { Telemetry } from '../telemetry';
import { SingleYAMLDocument, YAMLDocument, yamlDocumentsCache } from '../parser/yaml-documents';
import { matchOffsetToDocument } from '../utils/arrUtils';
import { convertErrorToTelemetryMsg } from '../utils/objects';
import { TextBuffer } from '../utils/textBuffer';
import { SettingsState } from '../../yamlSettings';
import { dirname, resolve } from 'path';

export class YamlDefinition {
  constructor(private readonly telemetry?: Telemetry, private readonly settings?: SettingsState) {}

  // Find node within all yaml documents
  findNodeFromPath(
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
  findNodeFromPathRecursive(
    allDocuments: [string, YAMLDocument, TextDocument][],
    path: string[],
    maxDepth = 16
  ): [string, Pair<unknown, unknown>, TextDocument][] {
    const result = [];
    let pathResult = this.findNodeFromPath(allDocuments, path);
    for (let i = 0; pathResult && i < maxDepth; ++i) {
      result.push(pathResult);
      const target = pathResult[1];
      path = null;
      if (isMap(target.value)) {
        // Find extends within result
        const extendsNode = target.value.items.find(({ key: key }) => key == 'extends');
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
      pathResult = this.findNodeFromPath(allDocuments, path);
    }

    return result;
  }

  createDefinitionFromTarget(target: Pair<Node, Node>, document: TextDocument, uri: string): LocationLink | undefined {
    const start = target.key.range[0];
    const endDef = target.key.range[1];
    const endFull = target.value.range[2];
    const targetRange = Range.create(document.positionAt(start), document.positionAt(endFull));
    const selectionRange = Range.create(document.positionAt(start), document.positionAt(endDef));

    return LocationLink.create(uri, targetRange, selectionRange);
  }

  // Returns whether or not this node has a parent with the given key
  // Useful to find the parent for nested nodes (e.g. extends with an array)
  findParentWithKey(node: Node, key: string, currentDoc: SingleYAMLDocument, maxDepth = 2): Pair {
    let parent = currentDoc.getParent(node);
    for (let i = 0; i < maxDepth; ++i) {
      if (parent && isPair(parent) && isScalar(parent.key) && parent.key.value === key) {
        return parent;
      }
      parent = currentDoc.getParent(parent);
    }

    return null;
  }

  getDefinition(document: TextDocument, params: DefinitionParams): DefinitionLink[] | undefined {
    try {
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
        } else if (
          this.settings?.gitlabci.enabled &&
          node &&
          isScalar(node) &&
          this.findParentWithKey(node, 'include', currentDoc, 2) &&
          isMap(currentDoc.internalDocument.contents)
        ) {
          // include node
          const path = node.value as string;
          if (path.startsWith('./') && document.uri.startsWith('file://')) {
            // Resolve relative path from document.uri
            const curPath = new URL(document.uri).pathname;
            const dirPath = dirname(curPath);
            const absPath = resolve(dirPath, path);

            return [
              // First line of the document
              LocationLink.create(absPath, Range.create(0, 0, 1, 0), Range.create(0, 0, 1, 0)),
            ];
          }
        } else if (
          this.settings?.gitlabci.enabled &&
          node &&
          isScalar(node) &&
          this.findParentWithKey(node, 'extends', currentDoc, 2) &&
          isMap(currentDoc.internalDocument.contents)
        ) {
          const pathResults = this.findNodeFromPathRecursive(all, [node.value as string]);
          if (pathResults.length) {
            const result = [];
            for (const [uri, target, targetDocument] of pathResults) {
              result.push(this.createDefinitionFromTarget(target as Pair<Node, Node>, targetDocument, uri));
            }
            return result;
          }
        } else if (
          this.settings?.gitlabci.enabled &&
          node &&
          isScalar(node) &&
          this.findParentWithKey(node, 'needs', currentDoc, 2) &&
          isMap(currentDoc.internalDocument.contents)
        ) {
          // needs tag
          const pathResult = this.findNodeFromPath(all, [node.value as string]);
          if (pathResult) {
            const [uri, target, targetDocument] = pathResult;
            return [this.createDefinitionFromTarget(target as Pair<Node, Node>, targetDocument, uri)];
          }
        } else if (
          this.settings?.gitlabci.enabled &&
          node &&
          isScalar(node) &&
          parent &&
          isSeq(parent) &&
          parent.tag === '!reference'
        ) {
          // !reference tag
          const pathResult = this.findNodeFromPath(
            all,
            parent.items.map((item: Scalar) => item.value as string)
          );
          if (pathResult) {
            const [uri, target, targetDocument] = pathResult;
            return [this.createDefinitionFromTarget(target as Pair<Node, Node>, targetDocument, uri)];
          }
        }
      }
    } catch (err) {
      this.telemetry?.sendError('yaml.definition.error', { error: convertErrorToTelemetryMsg(err) });
    }

    return undefined;
  }
}
