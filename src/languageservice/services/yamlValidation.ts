/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { JSONSchemaService, ResolvedSchema } from './jsonSchemaService';
import { JSONDocument, ObjectASTNode, IProblem, ProblemSeverity } from '../parser/jsonParser';
import { TextDocument, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver-types';
import { PromiseConstructor, Thenable, LanguageSettings} from '../yamlLanguageService';

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
	
	public doValidation(textDocument, yamlDocument) {

		if(!this.validationEnabled){
			return this.promise.resolve([]);
		}

		return this.jsonSchemaService.getSchemaForResource(textDocument.uri).then(function (schema) {
			var diagnostics = [];
			var added = {};
			let newSchema = schema;
			if (schema) {
				let documentIndex = 0;
				for(let currentYAMLDoc in yamlDocument.documents){
					let currentDoc = yamlDocument.documents[currentYAMLDoc];
					if (schema.schema && schema.schema.schemaSequence && schema.schema.schemaSequence[documentIndex]) {
						newSchema = new ResolvedSchema(schema.schema.schemaSequence[documentIndex]);
					}
					let diagnostics = currentDoc.getValidationProblems(newSchema.schema);
					for(let diag in diagnostics){
						let curDiagnostic = diagnostics[diag];
						currentDoc.errors.push({ location: { start: curDiagnostic.location.start, end: curDiagnostic.location.end }, message: curDiagnostic.message })
					}
					documentIndex++;
				}

			}
			if(newSchema && newSchema.errors.length > 0){
				
				for(let curDiagnostic of newSchema.errors){
					diagnostics.push({
						severity: DiagnosticSeverity.Error,
						range: {
							start: {
								line: 0,
								character: 0
							},
							end: {
								line: 0,
								character: 1
							}
						},
						message: curDiagnostic
					});
				}

			}
			for(let currentYAMLDoc in yamlDocument.documents){
				let currentDoc = yamlDocument.documents[currentYAMLDoc];
				currentDoc.errors.concat(currentDoc.warnings).forEach(function (error, idx) {
					// remove duplicated messages
					var signature = error.location.start + ' ' + error.location.end + ' ' + error.message;
					if (!added[signature]) {
						added[signature] = true;
						var range = {
							start: textDocument.positionAt(error.location.start),
							end: textDocument.positionAt(error.location.end)
						};
						diagnostics.push({
							severity: idx >= currentDoc.errors.length ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
							range: range,
							message: error.message
						});
					}
				});
			}
			return diagnostics;
		});
	}
}