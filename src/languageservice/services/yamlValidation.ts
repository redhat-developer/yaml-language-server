/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { JSONSchemaService } from './jsonSchemaService';
import { Diagnostic } from 'vscode-languageserver-types';
import { PromiseConstructor, LanguageSettings} from '../yamlLanguageService';
import { LanguageService } from 'vscode-json-languageservice';

export class YAMLValidation {
	
	private jsonSchemaService: JSONSchemaService;
	private promise: PromiseConstructor;
	private comments: boolean;
	private validationEnabled: boolean;

	public constructor(jsonSchemaService, promiseConstructor) {
		this.jsonSchemaService = jsonSchemaService;
		this.promise = promiseConstructor;
		this.validationEnabled = true;
	}

	public configure(shouldValidate: LanguageSettings){
		if(shouldValidate){
			this.validationEnabled = shouldValidate.validate;
		}
	}
	
	public doValidation(jsonLanguageService: LanguageService, textDocument, yamlDocument) {

		if(!this.validationEnabled){
			return this.promise.resolve([]);
		}

		let validationResult = [];
		for(let currentYAMLDoc of yamlDocument.documents){
			const validation = jsonLanguageService.doValidation(textDocument, currentYAMLDoc);
			validationResult.push(validation);
		}
		
		
		return Promise.all(validationResult).then(resolvedValidation => {
			let joinedResolvedArray = [];
			for (const resolvedArr of resolvedValidation) {
				joinedResolvedArray = joinedResolvedArray.concat(resolvedArr);
			}
			
			const foundSignatures = new Set();
			const duplicateMessagesRemoved = [];
			for (const err of joinedResolvedArray as Diagnostic[]) {
				const errSig = err.range.start.line + ' ' + err.range.start.character + ' ' + err.message;
				if (!foundSignatures.has(errSig)) {
					duplicateMessagesRemoved.push(err);
					foundSignatures.add(errSig);
				}
			}
			return duplicateMessagesRemoved;
		})
	}
}