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
	private validationEnabled: boolean;
	private comments: boolean;

	public constructor(jsonSchemaService, promiseConstructor) {
		this.jsonSchemaService = jsonSchemaService;
		this.promise = promiseConstructor;
		this.validationEnabled = true;
	}

	public configure(raw) {
		if (raw) {
			this.validationEnabled = raw.validate;
		}
	};
	
	public doValidation(textDocument, yamlDocument, isKubernetes) {
		if (!this.validationEnabled) {
			return this.promise.resolve([]);
		}
		return this.jsonSchemaService.getSchemaForResource(textDocument.uri).then(function (schema) {
			if (schema) {
				
				if(isKubernetes){
                    schema.schema = KubernetesTransformer.doTransformation(schema.schema);
                }
				
				if (schema.errors.length && yamlDocument.root) {
					var astRoot = yamlDocument.root;
					var property = astRoot.type === 'object' ? astRoot.getFirstProperty('$schema') : null;
					if (property) {
						var node = property.value || property;
						yamlDocument.warnings.push({ location: { start: node.start, end: node.end }, message: schema.errors[0] });
					}
					else {
						yamlDocument.warnings.push({ location: { start: astRoot.start, end: astRoot.start + 1 }, message: schema.errors[0] });
					}
				}
				else {
					yamlDocument.validate(schema.schema);
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