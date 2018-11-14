/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import * as Parser from '../parser/jsonParser';
import * as SchemaService from './jsonSchemaService';
import {JSONWorkerContribution} from '../jsonContributions';
import {PromiseConstructor, Thenable} from 'vscode-json-languageservice';

import {Hover, TextDocument, Position, Range, MarkedString} from 'vscode-languageserver-types';
import { matchOffsetToDocument } from '../utils/arrUtils';
import { LanguageSettings } from '../yamlLanguageService';

export class YAMLHover {

	private schemaService: SchemaService.IJSONSchemaService;
	private contributions: JSONWorkerContribution[];
	private promise: PromiseConstructor;
	private shouldHover: boolean;

	constructor(schemaService: SchemaService.IJSONSchemaService, contributions: JSONWorkerContribution[] = [], promiseConstructor: PromiseConstructor) {
		this.schemaService = schemaService;
		this.contributions = contributions;
		this.promise = promiseConstructor || Promise;
		this.shouldHover = true;
	}

	public configure(languageSettings: LanguageSettings){
		if(languageSettings){
			this.shouldHover = languageSettings.hover;
		}
	}

	public doHover(document: TextDocument, position: Position, doc): Thenable<Hover> {

		if(!this.shouldHover || !document){
			return this.promise.resolve(void 0);
		}

		let offset = document.offsetAt(position);
		let currentDoc = matchOffsetToDocument(offset, doc);
		if(currentDoc === null){
			return this.promise.resolve(void 0);
		}
		const currentDocIndex = doc.documents.indexOf(currentDoc);
		let node = currentDoc.getNodeFromOffset(offset);
		if (!node || (node.type === 'object' || node.type === 'array') && offset > node.start + 1 && offset < node.end - 1) {
			return this.promise.resolve(void 0);
		}
		let hoverRangeNode = node;

		// use the property description when hovering over an object key
		if (node.type === 'string') {
			let stringNode = <Parser.StringASTNode>node;
			if (stringNode.isKey) {
				let propertyNode = <Parser.PropertyASTNode>node.parent;
				node = propertyNode.value;
				if (!node) {
					return this.promise.resolve(void 0);
				}
			}
		}

		let hoverRange = Range.create(document.positionAt(hoverRangeNode.start), document.positionAt(hoverRangeNode.end));

		var createHover = (contents: MarkedString[]) => {
			let result: Hover = {
				contents: contents,
				range: hoverRange
			};
			return result;
		};

		let location = node.getPath();
		for (let i = this.contributions.length - 1; i >= 0; i--) {
			let contribution = this.contributions[i];
			let promise = contribution.getInfoContribution(document.uri, location);
			if (promise) {
				return promise.then(htmlContent => createHover(htmlContent));
			}
		}

		return this.schemaService.getSchemaForResource(document.uri).then((schema) => {
			if (schema) {
				let newSchema = schema;
				if (schema.schema && schema.schema.schemaSequence && schema.schema.schemaSequence[currentDocIndex]) {
					newSchema = new SchemaService.ResolvedSchema(schema.schema.schemaSequence[currentDocIndex]);
				}
				let matchingSchemas = currentDoc.getMatchingSchemas(newSchema.schema, node.start);

				let title: string = null;
				let markdownDescription: string = null;
				let markdownEnumValueDescription = null, enumValue = null;
				matchingSchemas.every((s) => {
					if (s.node === node && !s.inverted && s.schema) {
						title = title || s.schema.title;
						markdownDescription = markdownDescription || s.schema["markdownDescription"] || toMarkdown(s.schema.description);
						if (s.schema.enum)  {
							let idx = s.schema.enum.indexOf(node.getValue());
							if (s.schema["markdownEnumDescriptions"]) {
								markdownEnumValueDescription = s.schema["markdownEnumDescriptions"][idx];
							} else if (s.schema.enumDescriptions) {
								markdownEnumValueDescription = toMarkdown(s.schema.enumDescriptions[idx]);
							}
							if (markdownEnumValueDescription) {
								enumValue = s.schema.enum[idx];
								if (typeof enumValue !== 'string') {
									enumValue = JSON.stringify(enumValue);
								}
							}
						}
					}
					return true;
				});
				let result = '';
				if (title) {
					result = toMarkdown(title);
				}
				if (markdownDescription) {
					if (result.length > 0) {
						result += "\n\n";
					}
					result += markdownDescription;
				}
				if (markdownEnumValueDescription) {
					if (result.length > 0) {
						result += "\n\n";
					}
					result += `\`${toMarkdown(enumValue)}\`: ${markdownEnumValueDescription}`;
				}
				return createHover([result]);
			}
			return void 0;
		});
	}
}

function toMarkdown(plain: string) {
	if (plain) {
		let res = plain.replace(/([^\n\r])(\r?\n)([^\n\r])/gm, '$1\n\n$3'); // single new lines to \n\n (Markdown paragraph)
		return res.replace(/[\\`*_{}[\]()#+\-.!]/g, "\\$&"); // escape markdown syntax tokens: http://daringfireball.net/projects/markdown/syntax#backslash
	}
	return void 0;
}