/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DefinitionParams } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DefinitionLink, LocationLink, Range } from 'vscode-languageserver-types';
import { isAlias, isSeq, isScalar, Node, Pair, Scalar } from 'yaml';
import { Telemetry } from '../telemetry';
import { yamlDocumentsCache } from '../parser/yaml-documents';
import { matchOffsetToDocument } from '../utils/arrUtils';
import { convertErrorToTelemetryMsg } from '../utils/objects';
import { TextBuffer } from '../utils/textBuffer';
import { SettingsState } from '../../yamlSettings';
import { dirname, resolve } from 'path';
import { findParentWithKey, createDefinitionFromTarget, findNodeFromPath, findNodeFromPathRecursive } from './gitlabciUtils';

export class YamlDefinition {
  constructor(private readonly telemetry?: Telemetry, private readonly settings?: SettingsState) {}

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
          findParentWithKey(node, 'include', currentDoc, 2)
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
          findParentWithKey(node, 'extends', currentDoc, 2)
        ) {
          const pathResults = findNodeFromPathRecursive(all, [node.value as string]);
          if (pathResults.length) {
            const result = [];
            for (const [uri, target, targetDocument] of pathResults) {
              result.push(createDefinitionFromTarget(target as Pair<Node, Node>, targetDocument, uri));
            }
            return result;
          }
        } else if (this.settings?.gitlabci.enabled && node && isScalar(node) && findParentWithKey(node, 'needs', currentDoc, 2)) {
          // needs tag
          const pathResult = findNodeFromPath(all, [node.value as string]);
          if (pathResult) {
            const [uri, target, targetDocument] = pathResult;
            return [createDefinitionFromTarget(target as Pair<Node, Node>, targetDocument, uri)];
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
          const pathResult = findNodeFromPath(
            all,
            parent.items.map((item: Scalar) => item.value as string)
          );
          if (pathResult) {
            const [uri, target, targetDocument] = pathResult;
            return [createDefinitionFromTarget(target as Pair<Node, Node>, targetDocument, uri)];
          }
        }
      }
    } catch (err) {
      this.telemetry?.sendError('yaml.definition.error', { error: convertErrorToTelemetryMsg(err) });
    }

    return undefined;
  }
}
