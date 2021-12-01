/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { SymbolInformation, DocumentSymbol } from 'vscode-languageserver-types';
import { YAMLSchemaService } from './yamlSchemaService';
import { JSONDocumentSymbols } from 'vscode-json-languageservice/lib/umd/services/jsonDocumentSymbols';
import { DocumentSymbolsContext } from 'vscode-json-languageservice/lib/umd/jsonLanguageTypes';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { yamlDocumentsCache } from '../parser/yaml-documents';
import { Telemetry } from '../../languageserver/telemetry';

export class YAMLDocumentSymbols {
  private jsonDocumentSymbols;

  constructor(schemaService: YAMLSchemaService, private readonly telemetry: Telemetry) {
    this.jsonDocumentSymbols = new JSONDocumentSymbols(schemaService);
    const origKeyLabel = this.jsonDocumentSymbols.getKeyLabel;

    // override 'getKeyLabel' to handle complex mapping
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.jsonDocumentSymbols.getKeyLabel = (property: any) => {
      if (typeof property.keyNode.value === 'object') {
        return property.keyNode.value.value;
      } else {
        return origKeyLabel.call(this.jsonDocumentSymbols, property);
      }
    };
  }

  public findDocumentSymbols(
    document: TextDocument,
    context: DocumentSymbolsContext = { resultLimit: Number.MAX_VALUE }
  ): SymbolInformation[] {
    let results = [];
    try {
      const doc = yamlDocumentsCache.getYamlDocument(document);
      if (!doc || doc['documents'].length === 0) {
        return null;
      }

      for (const yamlDoc of doc['documents']) {
        if (yamlDoc.root) {
          results = results.concat(this.jsonDocumentSymbols.findDocumentSymbols(document, yamlDoc, context));
        }
      }
    } catch (err) {
      this.telemetry.sendError('yaml.documentSymbols.error', { error: err, documentUri: document.uri });
    }
    return results;
  }

  public findHierarchicalDocumentSymbols(
    document: TextDocument,
    context: DocumentSymbolsContext = { resultLimit: Number.MAX_VALUE }
  ): DocumentSymbol[] {
    let results = [];
    try {
      const doc = yamlDocumentsCache.getYamlDocument(document);
      if (!doc || doc['documents'].length === 0) {
        return null;
      }

      for (const yamlDoc of doc['documents']) {
        if (yamlDoc.root) {
          results = results.concat(this.jsonDocumentSymbols.findDocumentSymbols2(document, yamlDoc, context));
        }
      }
    } catch (err) {
      this.telemetry.sendError('yaml.hierarchicalDocumentSymbols.error', { error: err, documentUri: document.uri });
    }

    return results;
  }
}
