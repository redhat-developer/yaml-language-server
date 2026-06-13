/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver-types';
import type { CST, Node, Pair } from 'yaml';
import { isMap, visit } from 'yaml';
import type { SingleYAMLDocument } from '../../parser/yaml-documents';
import type { AdditionalValidator } from './types';

export class MapKeyOrderValidator implements AdditionalValidator {
  validate(document: TextDocument, yamlDoc: SingleYAMLDocument): Diagnostic[] {
    const result = [];

    visit(yamlDoc.internalDocument, (key, node) => {
      if (isMap(node)) {
        for (let i = 1; i < node.items.length; i++) {
          if (compare(node.items[i - 1], node.items[i]) > 0) {
            const range = createRange(document, node.items[i - 1]);
            result.push(
              Diagnostic.create(
                range,
                `Wrong ordering of key "${node.items[i - 1].key}" in mapping`,
                DiagnosticSeverity.Error,
                'mapKeyOrder'
              )
            );
            break;
          }
        }
      }
    });

    return result;
  }
}

function createRange(document: TextDocument, node: Pair): Range {
  const keySourceToken = (node.key as Node).srcToken as CST.SourceToken;
  const start = keySourceToken.offset;
  const end = start + keySourceToken.source.length;
  return Range.create(document.positionAt(start), document.positionAt(end));
}

function compare(thiz: Pair, that: Pair): number {
  const thatKey = String(that.key);
  const thisKey = String(thiz.key);
  return thisKey.localeCompare(thatKey);
}
