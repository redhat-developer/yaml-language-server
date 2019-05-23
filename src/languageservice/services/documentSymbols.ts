/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Parser from '../parser/jsonParser';

import { SymbolInformation, SymbolKind, TextDocument, Range, Location } from 'vscode-languageserver-types';
import { LanguageService } from 'vscode-json-languageservice';

export class YAMLDocumentSymbols {

	public findDocumentSymbols(jsonLanguageService: LanguageService, document: TextDocument, doc: Parser.JSONDocument): SymbolInformation[] {

		if(!doc || doc["documents"].length === 0){
			return null;
		}

		let documentSymbolResults = [];
		for(let yamlDoc in doc["documents"]){
			let currentYAMLDoc = doc["documents"][yamlDoc];
			if(currentYAMLDoc.root){
				documentSymbolResults = documentSymbolResults.concat(jsonLanguageService.findDocumentSymbols(document, currentYAMLDoc));
			}
		}

		return documentSymbolResults;
	}

}