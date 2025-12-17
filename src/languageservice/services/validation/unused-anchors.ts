/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity, DiagnosticTag, Range } from 'vscode-languageserver-types';
import { isAlias, isCollection, isNode, isScalar, Node, Scalar, visit, YAMLMap, YAMLSeq, CST, Pair } from 'yaml';
import { YamlNode } from '../../jsonASTTypes';
import { SingleYAMLDocument } from '../../parser/yaml-documents';
import { AdditionalValidator } from './types';
import { isCollectionItem } from '../../../languageservice/utils/astUtils';
import * as l10n from '@vscode/l10n';

export class UnusedAnchorsValidator implements AdditionalValidator {
  validate(document: TextDocument, yamlDoc: SingleYAMLDocument): Diagnostic[] {
    const result = [];
    const anchors = new Set<Scalar | YAMLMap | YAMLSeq>();
    const usedAnchors = new Set<Node>();
    const unIdentifiedAlias = new Set<Node>();
    const anchorParent = new Map<Scalar | YAMLMap | YAMLSeq, Node | Pair>();

    visit(yamlDoc.internalDocument, (key, node, path) => {
      if (!isNode(node)) {
        return;
      }
      if ((isCollection(node) || isScalar(node)) && node.anchor) {
        anchors.add(node);
        anchorParent.set(node, path[path.length - 1] as Node);
      }
      if (isAlias(node)) {
        if (!node.resolve(yamlDoc.internalDocument)) {
          unIdentifiedAlias.add(node);
        } else {
          usedAnchors.add(node.resolve(yamlDoc.internalDocument));
        }
      }
    });

    for (const anchor of anchors) {
      if (!usedAnchors.has(anchor)) {
        const aToken = this.getAnchorNode(anchorParent.get(anchor), anchor);
        if (aToken) {
          const range = Range.create(
            document.positionAt(aToken.offset),
            document.positionAt(aToken.offset + aToken.source.length)
          );
          const warningDiagnostic = Diagnostic.create(
            range,
            l10n.t('unUsedAnchor', aToken.source),
            DiagnosticSeverity.Information,
            0
          );
          warningDiagnostic.tags = [DiagnosticTag.Unnecessary];
          result.push(warningDiagnostic);
        }
      }
    }

    unIdentifiedAlias.forEach((node) => {
      const nodeRange = node.range;
      if (nodeRange) {
        const startOffset = nodeRange[0];
        const endOffset = nodeRange[1];
        const range = Range.create(document.positionAt(startOffset), document.positionAt(endOffset));
        const warningDiagnostic = Diagnostic.create(
          range,
          l10n.t('unUsedAlias', node.toString()),
          DiagnosticSeverity.Information,
          0
        );
        warningDiagnostic.tags = [DiagnosticTag.Unnecessary];
        result.push(warningDiagnostic);
      }
    });
    return result;
  }
  private getAnchorNode(parentNode: YamlNode, node: Node): CST.SourceToken | undefined {
    if (parentNode && parentNode.srcToken) {
      const token = parentNode.srcToken;
      if (isCollectionItem(token)) {
        return getAnchorFromCollectionItem(token);
      } else if (CST.isCollection(token)) {
        for (const t of token.items) {
          if (node.srcToken !== t.value) continue;
          const anchor = getAnchorFromCollectionItem(t);
          if (anchor) {
            return anchor;
          }
        }
      }
    }
    return undefined;
  }
}
function getAnchorFromCollectionItem(token: CST.CollectionItem): CST.SourceToken | undefined {
  for (const t of token.start) {
    if (t.type === 'anchor') {
      return t;
    }
  }
  if (token.sep && Array.isArray(token.sep)) {
    for (const t of token.sep) {
      if (t.type === 'anchor') {
        return t;
      }
    }
  }
}
