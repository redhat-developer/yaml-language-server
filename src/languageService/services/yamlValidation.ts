/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { JSONSchemaService } from './jsonSchemaService';
import { JSONDocument, ObjectASTNode, IProblem, ProblemSeverity } from '../parser/jsonParser';
import { TextDocument, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver-types';
import { PromiseConstructor, Thenable, LanguageSettings } from 'vscode-json-languageservice';
import { KubernetesTransformer } from '../kubernetesTransformer';

export class YAMLValidation {

	private jsonSchemaService: JSONSchemaService;
	private promise: PromiseConstructor;

	private validationEnabled: boolean;
	private comments: boolean;

	public constructor(jsonSchemaService: JSONSchemaService, promiseConstructor: PromiseConstructor) {
		this.jsonSchemaService = jsonSchemaService;
		this.promise = promiseConstructor;
		this.validationEnabled = true;
	}

	public configure(raw: LanguageSettings) {
		if (raw) {
			this.validationEnabled = raw.validate;
		}
	}

	public doValidation(textDocument: TextDocument, jsonDocument: JSONDocument, isKubernetes: Boolean): Thenable<Diagnostic[]> {
		if (!this.validationEnabled) {
			return this.promise.resolve([]);
		}
		let diagnostics: Diagnostic[] = [];
		let added: { [signature: string]: boolean } = {};
		let addProblem = (problem: IProblem) => {
			// remove duplicated messages
			let signature = problem.location.start + ' ' + problem.location.end + ' ' + problem.message;
			if (!added[signature]) {
				added[signature] = true;
				let range = {
					start: textDocument.positionAt(problem.location.start),
					end: textDocument.positionAt(problem.location.end)
				};
				let severity = problem.severity === ProblemSeverity.Error ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning;
				diagnostics.push({ severity, range, message: problem.message });
			}
		}
		
        if(jsonDocument.syntaxErrors !== undefined){
            jsonDocument.syntaxErrors.forEach(addProblem);
        }

		return this.jsonSchemaService.getSchemaForResource(textDocument.uri).then(schema => {
			if (schema) {

				if(isKubernetes){
                    schema.schema = KubernetesTransformer.doTransformation(schema.schema);
				}
				
				if (schema.errors.length && jsonDocument.root) {
					let astRoot = jsonDocument.root;
					let property = astRoot.type === 'object' ? (<ObjectASTNode>astRoot).getFirstProperty('$schema') : null;
					if (property) {
						let node = property.value || property;
						addProblem({ location: { start: node.start, end: node.end }, message: schema.errors[0], severity: ProblemSeverity.Warning });
					} else {
						addProblem({ location: { start: astRoot.start, end: astRoot.start + 1 }, message: schema.errors[0], severity: ProblemSeverity.Warning });
					}
				} else {
					let semanticErrors = jsonDocument.validate(schema.schema);
					if (semanticErrors) {
						semanticErrors.forEach(addProblem);
					}
				}
			}
			return diagnostics;
		});
	}
}