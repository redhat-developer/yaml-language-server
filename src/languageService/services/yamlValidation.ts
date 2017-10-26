/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import { JSONSchemaService } from './jsonSchemaService';
import { JSONDocument, ObjectASTNode, IProblem, ProblemSeverity } from '../parser/jsonParser';
import { TextDocument, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver-types';
import { PromiseConstructor, Thenable} from '../yamlLanguageService';
import { KubernetesTransformer } from "../kubernetesTransformer";

export class YAMLValidation {
	
	private jsonSchemaService: JSONSchemaService;
	private promise: PromiseConstructor;
	private comments: boolean;

	public constructor(jsonSchemaService, promiseConstructor) {
		this.jsonSchemaService = jsonSchemaService;
		this.promise = promiseConstructor;
	}
	
	public doValidation(textDocument, yamlDocument, isKubernetes) {
		return this.jsonSchemaService.getSchemaForResource(textDocument.uri).then(function (schema) {
			if (schema) {
				
				if(isKubernetes){
                    schema.schema = KubernetesTransformer.doTransformation(schema.schema);
                }
				
				let diagnostics = yamlDocument.getValidationProblems(schema.schema);
				for(let diag in diagnostics){
					let curDiagnostic = diagnostics[diag];
					yamlDocument.errors.push({ location: { start: curDiagnostic.location.start, end: curDiagnostic.location.end }, message: curDiagnostic.message })
				}
				
			}
			var diagnostics = [];
			var added = {};
			yamlDocument.errors.concat(yamlDocument.warnings).forEach(function (error, idx) {
				// remove duplicated messages
				var signature = error.location.start + ' ' + error.location.end + ' ' + error.message;
				if (!added[signature]) {
					added[signature] = true;
					var range = {
						start: textDocument.positionAt(error.location.start),
						end: textDocument.positionAt(error.location.end)
					};
					diagnostics.push({
						severity: idx >= yamlDocument.errors.length ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
						range: range,
						message: error.message
					});
				}
			});
			return diagnostics;
		});
	}
}