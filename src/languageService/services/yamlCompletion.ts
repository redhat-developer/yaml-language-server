/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import Parser = require('../parser/jsonParser');
import Json = require('jsonc-parser');
import SchemaService = require('./jsonSchemaService');
import { JSONSchema } from '../jsonSchema';
import { JSONWorkerContribution, CompletionsCollector } from '../jsonContributions';
import { PromiseConstructor, Thenable } from 'vscode-json-languageservice';

import { CompletionItem, CompletionItemKind, CompletionList, TextDocument, Position, Range, TextEdit } from 'vscode-languageserver-types';

import * as nls from 'vscode-nls';
import { KubernetesTransformer } from "../kubernetesTransformer";
const localize = nls.loadMessageBundle();


export class YAMLCompletion {

	private schemaService: SchemaService.IJSONSchemaService;
	private contributions: JSONWorkerContribution[];
	private promise: PromiseConstructor;

	constructor(schemaService: SchemaService.IJSONSchemaService, contributions: JSONWorkerContribution[] = [], promiseConstructor?: PromiseConstructor) {
		this.schemaService = schemaService;
		this.contributions = contributions;
		this.promise = promiseConstructor || Promise;
	}

	public doResolve(item: CompletionItem): Thenable<CompletionItem> {
		for (let i = this.contributions.length - 1; i >= 0; i--) {
			if (this.contributions[i].resolveCompletion) {
				let resolver = this.contributions[i].resolveCompletion(item);
				if (resolver) {
					return resolver;
				}
			}
		}
		return this.promise.resolve(item);
	}

	public doComplete(document: TextDocument, position: Position, doc: Parser.JSONDocument, isKubernetes: Boolean): Thenable<CompletionList> {

		let result: CompletionList = {
			items: [],
			isIncomplete: false
		};

		let offset = document.offsetAt(position);
		let node = doc.getNodeFromOffsetEndInclusive(offset);
		if (this.isInComment(document, node ? node.start : 0, offset)) {
			return Promise.resolve(result);
		}

		let currentWord = this.getCurrentWord(document, offset);

		let proposed: { [key: string]: CompletionItem } = {};
		let collector: CompletionsCollector = {
			add: (suggestion: CompletionItem) => {
				let existing = proposed[suggestion.label];
				if (!existing) {
					proposed[suggestion.label] = suggestion;
					result.items.push(suggestion);
				} else if (!existing.documentation) {
					existing.documentation = suggestion.documentation;
				}
			},
			setAsIncomplete: () => {
				result.isIncomplete = true;
			},
			error: (message: string) => {
				console.error(message);
			},
			log: (message: string) => {
				console.log(message);
			},
			getNumberOfProposals: () => {
				return result.items.length;
			}
		};

		return this.schemaService.getSchemaForResource(document.uri).then((schema) => {

			if(isKubernetes){
            	schema.schema = KubernetesTransformer.doTransformation(schema.schema);
        	}

			let collectionPromises: Thenable<any>[] = [];

			let addValue = true;
			let currentKey = '';

			let currentProperty: Parser.PropertyASTNode = null;
			if (node) {

				if (node.type === 'string') {
					let stringNode = <Parser.StringASTNode>node;
					if (stringNode.isKey) {
						addValue = !(node.parent && ((<Parser.PropertyASTNode>node.parent).value));
						currentProperty = node.parent ? <Parser.PropertyASTNode>node.parent : null;
						currentKey = document.getText().substring(node.start + 1, node.end - 1);
						if (node.parent) {
							node = node.parent.parent;
						}
					}
				}
			}

			// proposals for properties
			if (node && node.type === 'object') {
				// don't suggest properties that are already present
				let properties = (<Parser.ObjectASTNode>node).properties;
				properties.forEach(p => {
					if (!currentProperty || currentProperty !== p) {
						proposed[p.key.value] = CompletionItem.create('__');
					}
				});

				if (schema) {
					// property proposals with schema
					this.getPropertyCompletions(schema, doc, node, addValue, collector);
				} 

				let location = node.getPath();
				this.contributions.forEach((contribution) => {
					let collectPromise = contribution.collectPropertyCompletions(document.uri, location, currentWord, addValue, false, collector);
					if (collectPromise) {
						collectionPromises.push(collectPromise);
					}
				});
				if ((!schema && currentWord.length > 0 && document.getText().charAt(offset - currentWord.length - 1) !== '"')) {
					collector.add({
						kind: CompletionItemKind.Property,
						label: this.getLabelForValue(currentWord)
					});
				}
			}

			// proposals for values
			let types: { [type: string]: boolean } = {};
			if (schema) {
				this.getValueCompletions(schema, doc, node, offset, document, collector, types);
			} 
			if (this.contributions.length > 0) {
				this.getContributedValueCompletions(doc, node, offset, document, collector, collectionPromises);
			}

			return this.promise.all(collectionPromises).then(() => {
				return result;
			});
		});
	}

	private getPropertyCompletions(schema: SchemaService.ResolvedSchema, doc, node: Parser.ASTNode, addValue: boolean, collector: CompletionsCollector): void {
		let matchingSchemas = doc.getMatchingSchemas(schema.schema);
		matchingSchemas.forEach((s) => {
			if (s.node === node && !s.inverted) {
				let schemaProperties = s.schema.properties;
				if (schemaProperties) {
					Object.keys(schemaProperties).forEach((key: string) => {
						let propertySchema = schemaProperties[key];
						if (!propertySchema.deprecationMessage && !propertySchema["doNotSuggest"]) {
							collector.add({
								kind: CompletionItemKind.Property,
								label: key,
								filterText: this.getFilterTextForValue(key),
								documentation: propertySchema.description || ''
							});
						}
					});
				}
			}
		});
	}

	private getValueCompletions(schema: SchemaService.ResolvedSchema, doc, node: Parser.ASTNode, offset: number, document: TextDocument, collector: CompletionsCollector, types: { [type: string]: boolean }): void {
		let offsetForSeparator = offset;
		let parentKey: string = null;
		let valueNode: Parser.ASTNode = null;
		
		if (node && (node.type === 'string' || node.type === 'number' || node.type === 'boolean')) {
			offsetForSeparator = node.end;
			valueNode = node;
			node = node.parent;
		}

		if(node && node.type === 'null'){
			let nodeParent = node.parent;
			
			/*
			 * This is going to be an object for some reason and we need to find the property
			 * Its an issue with the null node
			 */
			if(nodeParent && nodeParent.type === "object"){
				for(let prop in nodeParent["properties"]){
					let currNode = nodeParent["properties"][prop];
					if(currNode.key && currNode.key.location === node.location){
						node = currNode;
					}
				}
			}
		}

		if (!node) {
			this.addSchemaValueCompletions(schema.schema, collector, types);
			return;
		}
		
		if ((node.type === 'property') && offset > (<Parser.PropertyASTNode>node).colonOffset) {
			let propertyNode = <Parser.PropertyASTNode>node;
			let valueNode = propertyNode.value;
			if (valueNode && offset > valueNode.end) {
				return; // we are past the value node
			}
			parentKey = propertyNode.key.value;
			node = node.parent;
		}

		if (node && (parentKey !== null || node.type === 'array')) {
			let matchingSchemas = doc.getMatchingSchemas(schema.schema);
			matchingSchemas.forEach(s => {
				if (s.node === node && !s.inverted && s.schema) {
					if (s.schema.items) {
						if (Array.isArray(s.schema.items)) {
							let index = this.findItemAtOffset(node, document, offset);
							if (index < s.schema.items.length) {
								this.addSchemaValueCompletions(s.schema.items[index], collector, types);
							}
						} else {
							this.addSchemaValueCompletions(s.schema.items, collector, types);
						}
					}
					if (s.schema.properties) {
						let propertySchema = s.schema.properties[parentKey];
						if (propertySchema) {
							this.addSchemaValueCompletions(propertySchema, collector, types);
						}
					}
				}
			});
		}
		if(node){
			if (types['boolean']) {
				this.addBooleanValueCompletion(true, collector);
				this.addBooleanValueCompletion(false, collector);
			}
			if (types['null']) {
				this.addNullValueCompletion(collector);
			}
		}		
	}

	private getContributedValueCompletions(doc: Parser.JSONDocument, node: Parser.ASTNode, offset: number, document: TextDocument, collector: CompletionsCollector, collectionPromises: Thenable<any>[]) {
		if (!node) {
			this.contributions.forEach((contribution) => {
				let collectPromise = contribution.collectDefaultCompletions(document.uri, collector);
				if (collectPromise) {
					collectionPromises.push(collectPromise);
				}
			});
		} else {
			if (node.type === 'string' || node.type === 'number' || node.type === 'boolean' || node.type === 'null') {
				node = node.parent;
			}
			if ((node.type === 'property') && offset > (<Parser.PropertyASTNode>node).colonOffset) {
				let parentKey = (<Parser.PropertyASTNode>node).key.value;

				let valueNode = (<Parser.PropertyASTNode>node).value;
				if (!valueNode || offset <= valueNode.end) {
					let location = node.parent.getPath();
					this.contributions.forEach((contribution) => {
						let collectPromise = contribution.collectValueCompletions(document.uri, location, parentKey, collector);
						if (collectPromise) {
							collectionPromises.push(collectPromise);
						}
					});
				}
			}
		}
	}

	private addSchemaValueCompletions(schema: JSONSchema, collector: CompletionsCollector, types: { [type: string]: boolean }): void {
		this.addDefaultValueCompletions(schema, collector);
		this.addEnumValueCompletions(schema, collector);
		this.collectTypes(schema, types);
		if (Array.isArray(schema.allOf)) {
			schema.allOf.forEach(s => this.addSchemaValueCompletions(s, collector, types));
		}
		if (Array.isArray(schema.anyOf)) {
			schema.anyOf.forEach(s => this.addSchemaValueCompletions(s, collector, types));
		}
		if (Array.isArray(schema.oneOf)) {
			schema.oneOf.forEach(s => this.addSchemaValueCompletions(s, collector, types));
		}
	}

	private addDefaultValueCompletions(schema: JSONSchema, collector: CompletionsCollector, arrayDepth = 0): void {
		let hasProposals = false;
		if (schema.default) {
			let type = schema.type;
			let value = schema.default;
			for (let i = arrayDepth; i > 0; i--) {
				value = [value];
				type = 'array';
			}
			collector.add({
				kind: this.getSuggestionKind(type),
				label: this.getLabelForValue(value),
				detail: localize('json.suggest.default', 'Default value'),
			});
			hasProposals = true;
		}
		if (!hasProposals && schema.items && !Array.isArray(schema.items)) {
			this.addDefaultValueCompletions(schema.items, collector, arrayDepth + 1);
		}
	}

	private addEnumValueCompletions(schema: JSONSchema, collector: CompletionsCollector): void {
		if (Array.isArray(schema.enum)) {
			for (let i = 0, length = schema.enum.length; i < length; i++) {
				let enm = schema.enum[i];
				let documentation = schema.description;
				if (schema.enumDescriptions && i < schema.enumDescriptions.length) {
					documentation = schema.enumDescriptions[i];
				}
				collector.add({
					kind: this.getSuggestionKind(schema.type),
					label: this.getLabelForValue(enm),
					documentation
				});
			}
		}
	}

	private collectTypes(schema: JSONSchema, types: { [type: string]: boolean }) {
		let type = schema.type;
		if (Array.isArray(type)) {
			type.forEach(t => types[t] = true);
		} else {
			types[type] = true;
		}
	}

	private addBooleanValueCompletion(value: boolean, collector: CompletionsCollector): void {
		collector.add({
			kind: this.getSuggestionKind('boolean'),
			label: value ? 'true' : 'false',
			documentation: ''
		});
	}

	private addNullValueCompletion(collector: CompletionsCollector): void {
		collector.add({
			kind: this.getSuggestionKind('null'),
			label: 'null',
			documentation: ''
		});
	}

	private getLabelForValue(value: any): string {
		let label = typeof value === "string" ? value : JSON.stringify(value);
		if (label.length > 57) {
			return label.substr(0, 57).trim() + '...';
		}
		return label;
	}

	private getFilterTextForValue(value): string {
		return JSON.stringify(value);
	}

	private getSuggestionKind(type: any): CompletionItemKind {
		if (Array.isArray(type)) {
			let array = <any[]>type;
			type = array.length > 0 ? array[0] : null;
		}
		if (!type) {
			return CompletionItemKind.Value;
		}
		switch (type) {
			case 'string': return CompletionItemKind.Value;
			case 'object': return CompletionItemKind.Module;
			case 'property': return CompletionItemKind.Property;
			default: return CompletionItemKind.Value;
		}
	}

	private getCurrentWord(document: TextDocument, offset: number) {
		var i = offset - 1;
		var text = document.getText();
		while (i >= 0 && ' \t\n\r\v":{[,]}'.indexOf(text.charAt(i)) === -1) {
			i--;
		}
		return text.substring(i + 1, offset);
	}

	private findItemAtOffset(node: Parser.ASTNode, document: TextDocument, offset: number) {
		let scanner = Json.createScanner(document.getText(), true);
		let children = node.getChildNodes();
		for (let i = children.length - 1; i >= 0; i--) {
			let child = children[i];
			if (offset > child.end) {
				scanner.setPosition(child.end);
				let token = scanner.scan();
				if (token === Json.SyntaxKind.CommaToken && offset >= scanner.getTokenOffset() + scanner.getTokenLength()) {
					return i + 1;
				}
				return i;
			} else if (offset >= child.start) {
				return i;
			}
		}
		return 0;
	}

	private isInComment(document: TextDocument, start: number, offset: number) {
		let scanner = Json.createScanner(document.getText(), false);
		scanner.setPosition(start);
		let token = scanner.scan();
		while (token !== Json.SyntaxKind.EOF && (scanner.getTokenOffset() + scanner.getTokenLength() < offset)) {
			token = scanner.scan();
		}
		return (token === Json.SyntaxKind.LineCommentTrivia || token === Json.SyntaxKind.BlockCommentTrivia) && scanner.getTokenOffset() <= offset;
	}
}