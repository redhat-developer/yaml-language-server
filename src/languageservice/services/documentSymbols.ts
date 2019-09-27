/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { parse as parseYAML } from '../parser/yamlParser07';

import { SymbolInformation, TextDocument, DocumentSymbol } from 'vscode-languageserver-types';
import { YAMLSchemaService } from './yamlSchemaService';
import { JSONDocumentSymbols } from 'vscode-json-languageservice/lib/umd/services/jsonDocumentSymbols';

export class YAMLDocumentSymbols {

    private jsonDocumentSymbols;

    constructor(schemaService: YAMLSchemaService) {
        this.jsonDocumentSymbols = new JSONDocumentSymbols(schemaService);
    }

    public findDocumentSymbols(document: TextDocument): SymbolInformation[] {

        const doc = parseYAML(document.getText());
        if (!doc || doc['documents'].length === 0) {
            return null;
        }

        let results = [];
        for (const yamlDoc of doc['documents']) {
            if (yamlDoc.root) {
                results = results.concat(this.jsonDocumentSymbols.findDocumentSymbols(document, yamlDoc));
            }
        }

        return results;
    }

    public findHierarchicalDocumentSymbols(document: TextDocument ): DocumentSymbol[] {
        const doc = parseYAML(document.getText());
        if (!doc || doc['documents'].length === 0) {
            return null;
        }

        let results = [];
        for (const yamlDoc of doc['documents']) {
            if (yamlDoc.root) {
                results = results.concat(this.jsonDocumentSymbols.findDocumentSymbols2(document, yamlDoc));
            }
        }

        return results;
    }

}
