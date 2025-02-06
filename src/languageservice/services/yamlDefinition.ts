/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DefinitionParams } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DefinitionLink, LocationLink, Range } from 'vscode-languageserver-types';
import { isAlias } from 'yaml';
import { Telemetry } from '../telemetry';
import { yamlDocumentsCache } from '../parser/yaml-documents';
import { matchOffsetToDocument } from '../utils/arrUtils';
import { TextBuffer } from '../utils/textBuffer';

export class YamlDefinition {
  constructor(private readonly telemetry?: Telemetry) {}

  getDefinition(document: TextDocument, params: DefinitionParams): DefinitionLink[] | undefined {
    try {
      const yamlDocument = yamlDocumentsCache.getYamlDocument(document);
      const offset = document.offsetAt(params.position);
      const currentDoc = matchOffsetToDocument(offset, yamlDocument);
      if (currentDoc) {
        const [node] = currentDoc.getNodeFromPosition(offset, new TextBuffer(document));
        if (node && isAlias(node)) {
          const defNode = node.resolve(currentDoc.internalDocument);
          if (defNode && defNode.range) {
            const targetRange = Range.create(document.positionAt(defNode.range[0]), document.positionAt(defNode.range[2]));
            const selectionRange = Range.create(document.positionAt(defNode.range[0]), document.positionAt(defNode.range[1]));
            return [LocationLink.create(document.uri, targetRange, selectionRange)];
          }
        }
      }
    } catch (err) {
      this.telemetry?.sendError('yaml.definition.error', err);
    }

    return undefined;
  }
}
