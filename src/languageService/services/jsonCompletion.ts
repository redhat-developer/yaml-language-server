/*---------------------------------------------------------------------------------------------
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
import { stringifyObject } from '../utils/json';

import { CompletionItem, CompletionItemKind, CompletionList, TextDocument, Position, Range, TextEdit, InsertTextFormat } from 'vscode-languageserver-types';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();


export class JSONCompletion {

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

	public doComplete(document: TextDocument, position: Position, doc: Parser.JSONDocument): Thenable<CompletionList> {

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
		let overwriteRange = null;

		if (node && (node.type === 'string' || node.type === 'number' || node.type === 'boolean' || node.type === 'null')) {
			overwriteRange = Range.create(document.positionAt(node.start), document.positionAt(node.end));
		} else {
			let overwriteStart = offset - currentWord.length;
			if (overwriteStart > 0 && document.getText()[overwriteStart - 1] === '"') {
				overwriteStart--;
			}
			overwriteRange = Range.create(document.positionAt(overwriteStart), position);
		}

		let proposed: { [key: string]: CompletionItem } = {};
		let collector: CompletionsCollector = {
			add: (suggestion: CompletionItem) => {
				let existing = proposed[suggestion.label];
				if (!existing) {
					proposed[suggestion.label] = suggestion;
					if (overwriteRange) {
						suggestion.textEdit = TextEdit.replace(overwriteRange, suggestion.insertText);
					}

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
				let separatorAfter = '';
				if (addValue) {
					separatorAfter = this.evaluateSeparatorAfter(document, document.offsetAt(overwriteRange.end));
				}

				if (schema) {
					// property proposals with schema
					this.getPropertyCompletions(schema, doc, node, addValue, separatorAfter, collector);
				} else {
					// property proposals without schema
					this.getSchemaLessPropertyCompletions(doc, node, currentKey, collector);
				}

				let location = node.getPath();
				this.contributions.forEach((contribution) => {
					let collectPromise = contribution.collectPropertyCompletions(document.uri, location, currentWord, addValue, separatorAfter === '', collector);
					if (collectPromise) {
						collectionPromises.push(collectPromise);
					}
				});
				if ((!schema && currentWord.length > 0 && document.getText().charAt(offset - currentWord.length - 1) !== '"')) {
					collector.add({
						kind: CompletionItemKind.Property,
						label: this.getLabelForValue(currentWord),
						insertText: this.getInsertTextForProperty(currentWord, null, false, separatorAfter),
						insertTextFormat: InsertTextFormat.Snippet, documentation: ''
					});
				}
			}

			// proposals for values
			let types: { [type: string]: boolean } = {};
			if (schema) {
				// value proposals with schema
				this.getValueCompletions(schema, doc, node, offset, document, collector, types);
			} else {
				// value proposals without schema
				this.getSchemaLessValueCompletions(doc, node, offset, document, collector);
			}
			if (this.contributions.length > 0) {
				this.getContributedValueCompletions(doc, node, offset, document, collector, collectionPromises);
			}

			return this.promise.all(collectionPromises).then(() => {
				if (collector.getNumberOfProposals() === 0) {
					let offsetForSeparator = offset;
					if (node && (node.type === 'string' || node.type === 'number' || node.type === 'boolean' || node.type === 'null')) {
						offsetForSeparator = node.end;
					}
					let separatorAfter = this.evaluateSeparatorAfter(document, offsetForSeparator);
					this.addFillerValueCompletions(types, separatorAfter, collector);
				}
				return result;
			});
		});
	}

	private getPropertyCompletions(schema: SchemaService.ResolvedSchema, doc, node: Parser.ASTNode, addValue: boolean, separatorAfter: string, collector: CompletionsCollector): void {
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
								insertText: this.getInsertTextForProperty(key, propertySchema, addValue, separatorAfter),
								insertTextFormat: InsertTextFormat.Snippet,
								filterText: this.getFilterTextForValue(key),
								documentation: propertySchema.description || ''
							});
						}
					});
				}
			}
		});
	}

	private getSchemaLessPropertyCompletions(doc: Parser.JSONDocument, node: Parser.ASTNode, currentKey: string, collector: CompletionsCollector): void {
		let collectCompletionsForSimilarObject = (obj: Parser.ObjectASTNode) => {
			obj.properties.forEach((p) => {
				let key = p.key.value;
				collector.add({
					kind: CompletionItemKind.Property,
					label: key,
					insertText: this.getInsertTextForValue(key, ''),
					insertTextFormat: InsertTextFormat.Snippet,
					filterText: this.getFilterTextForValue(key),
					documentation: ''
				});
			});
		};
		if (node.parent) {
			if (node.parent.type === 'property') {
				// if the object is a property value, check the tree for other objects that hang under a property of the same name
				let parentKey = (<Parser.PropertyASTNode>node.parent).key.value;
				doc.visit((n) => {
					let p = <Parser.PropertyASTNode>n;
					if (n.type === 'property' && n !== node.parent && p.key.value === parentKey && p.value && p.value.type === 'object') {
						collectCompletionsForSimilarObject(<Parser.ObjectASTNode>p.value);
					}
					return true;
				});
			} else if (node.parent.type === 'array') {
				// if the object is in an array, use all other array elements as similar objects
				(<Parser.ArrayASTNode>node.parent).items.forEach((n) => {
					if (n.type === 'object' && n !== node) {
						collectCompletionsForSimilarObject(<Parser.ObjectASTNode>n);
					}
				});
			}
		} else if (node.type === 'object') {
			collector.add({
				kind: CompletionItemKind.Property,
				label: '$schema',
				insertText: this.getInsertTextForProperty('$schema', null, true, ''),
				insertTextFormat: InsertTextFormat.Snippet, documentation: '',
				filterText: this.getFilterTextForValue("$schema")
			});
		}
	}

	private getSchemaLessValueCompletions(doc: Parser.JSONDocument, node: Parser.ASTNode, offset: number, document: TextDocument, collector: CompletionsCollector): void {
		let offsetForSeparator = offset;
		if (node && (node.type === 'string' || node.type === 'number' || node.type === 'boolean' || node.type === 'null')) {
			offsetForSeparator = node.end;
			node = node.parent;
		}

		if (!node) {
			collector.add({
				kind: this.getSuggestionKind('object'),
				label: 'Empty object',
				insertText: this.getInsertTextForValue({}, ''),
				insertTextFormat: InsertTextFormat.Snippet,
				documentation: ''
			});
			collector.add({
				kind: this.getSuggestionKind('array'),
				label: 'Empty array',
				insertText: this.getInsertTextForValue([], ''),
				insertTextFormat: InsertTextFormat.Snippet,
				documentation: ''
			});
			return;
		}
		let separatorAfter = this.evaluateSeparatorAfter(document, offsetForSeparator);
		let collectSuggestionsForValues = (value: Parser.ASTNode) => {
			if (!value.parent.contains(offset, true)) {
				collector.add({
					kind: this.getSuggestionKind(value.type),
					label: this.getLabelTextForMatchingNode(value, document),
					insertText: this.getInsertTextForMatchingNode(value, document, separatorAfter),
					insertTextFormat: InsertTextFormat.Snippet, documentation: ''
				});
			}
			if (value.type === 'boolean') {
				this.addBooleanValueCompletion(!value.getValue(), separatorAfter, collector);
			}
		};

		if (node.type === 'property') {
			let propertyNode = <Parser.PropertyASTNode>node;
			if (offset > propertyNode.colonOffset) {

				let valueNode = propertyNode.value;
				if (valueNode && (offset > valueNode.end || valueNode.type === 'object' || valueNode.type === 'array')) {
					return;
				}
				// suggest values at the same key
				let parentKey = propertyNode.key.value;
				doc.visit(n => {
					let p = <Parser.PropertyASTNode>n;
					if (n.type === 'property' && p.key.value === parentKey && p.value) {
						collectSuggestionsForValues(p.value);
					}
					return true;
				});
				if (parentKey === '$schema' && node.parent && !node.parent.parent) {
					this.addDollarSchemaCompletions(separatorAfter, collector);
				}
			}
		}
		if (node.type === 'array') {
			if (node.parent && node.parent.type === 'property') {

				// suggest items of an array at the same key
				let parentKey = (<Parser.PropertyASTNode>node.parent).key.value;
				doc.visit((n) => {
					let p = <Parser.PropertyASTNode>n;
					if (n.type === 'property' && p.key.value === parentKey && p.value && p.value.type === 'array') {
						((<Parser.ArrayASTNode>p.value).items).forEach((n) => {
							collectSuggestionsForValues(<Parser.ObjectASTNode>n);
						});
					}
					return true;
				});
			} else {
				// suggest items in the same array
				(<Parser.ArrayASTNode>node).items.forEach((n) => {
					collectSuggestionsForValues(<Parser.ObjectASTNode>n);
				});
			}
		}
	}


	private getValueCompletions(schema: SchemaService.ResolvedSchema, doc, node: Parser.ASTNode, offset: number, document: TextDocument, collector: CompletionsCollector, types: { [type: string]: boolean }): void {
		let offsetForSeparator = offset;
		let parentKey: string = null;
		let valueNode: Parser.ASTNode = null;
		
		if (node && (node.type === 'string' || node.type === 'number' || node.type === 'boolean' || node.type === 'null')) {
			offsetForSeparator = node.end;
			valueNode = node;
			node = node.parent;
		}

		if (!node) {
			this.addSchemaValueCompletions(schema.schema, '', collector, types);
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
			let separatorAfter = this.evaluateSeparatorAfter(document, offsetForSeparator);

			let matchingSchemas = doc.getMatchingSchemas(schema.schema);
			matchingSchemas.forEach(s => {
				if (s.node === node && !s.inverted && s.schema) {
					if (s.schema.items) {
						if (Array.isArray(s.schema.items)) {
							let index = this.findItemAtOffset(node, document, offset);
							if (index < s.schema.items.length) {
								this.addSchemaValueCompletions(s.schema.items[index], separatorAfter, collector, types);
							}
						} else {
							this.addSchemaValueCompletions(s.schema.items, separatorAfter, collector, types);
						}
					}
					if (s.schema.properties) {
						let propertySchema = s.schema.properties[parentKey];
						if (propertySchema) {
							this.addSchemaValueCompletions(propertySchema, separatorAfter, collector, types);
						}
					}
				}
			});
			if (parentKey === '$schema' && !node.parent) {
				this.addDollarSchemaCompletions(separatorAfter, collector);
			}
			if (types['boolean']) {
				this.addBooleanValueCompletion(true, separatorAfter, collector);
				this.addBooleanValueCompletion(false, separatorAfter, collector);
			}
			if (types['null']) {
				this.addNullValueCompletion(separatorAfter, collector);
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

	private addSchemaValueCompletions(schema: JSONSchema, separatorAfter: string, collector: CompletionsCollector, types: { [type: string]: boolean }): void {
		this.addDefaultValueCompletions(schema, separatorAfter, collector);
		this.addEnumValueCompletions(schema, separatorAfter, collector);
		this.collectTypes(schema, types);
		if (Array.isArray(schema.allOf)) {
			schema.allOf.forEach(s => this.addSchemaValueCompletions(s, separatorAfter, collector, types));
		}
		if (Array.isArray(schema.anyOf)) {
			schema.anyOf.forEach(s => this.addSchemaValueCompletions(s, separatorAfter, collector, types));
		}
		if (Array.isArray(schema.oneOf)) {
			schema.oneOf.forEach(s => this.addSchemaValueCompletions(s, separatorAfter, collector, types));
		}
	}

	private addDefaultValueCompletions(schema: JSONSchema, separatorAfter: string, collector: CompletionsCollector, arrayDepth = 0): void {
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
				insertText: this.getInsertTextForValue(value, separatorAfter),
				insertTextFormat: InsertTextFormat.Snippet,
				detail: localize('json.suggest.default', 'Default value'),
			});
			hasProposals = true;
		}
		if (Array.isArray(schema["defaultSnippets"])) {
			schema["defaultSnippets"].forEach(s => {
				let type = schema.type;
				let value = s.body;
				let label = s.label;
				let insertText: string;
				if (value) {
					let type = schema.type;
					for (let i = arrayDepth; i > 0; i--) {
						value = [value];
						type = 'array';
					}
					insertText = this.getInsertTextForSnippetValue(value, separatorAfter);
					label = label || this.getLabelForSnippetValue(value);
				} else if (s.bodyText) {
					let prefix = '', suffix = '', indent = '';
					for (let i = arrayDepth; i > 0; i--) {
						prefix = prefix + indent + '[\n';
						suffix = suffix + '\n' + indent + ']';
						indent += '\t';
						type = 'array';
					}
					insertText = prefix + indent + s.bodyText.split('\n').join('\n' + indent) + suffix + separatorAfter;
					label = label || insertText;
				}
				collector.add({
					kind: this.getSuggestionKind(type),
					label,
					documentation: s.description,
					insertText,
					insertTextFormat: InsertTextFormat.Snippet,
					filterText: insertText,
				});
				hasProposals = true;
			});
		}
		if (!hasProposals && schema.items && !Array.isArray(schema.items)) {
			this.addDefaultValueCompletions(schema.items, separatorAfter, collector, arrayDepth + 1);
		}
	}


	private addEnumValueCompletions(schema: JSONSchema, separatorAfter: string, collector: CompletionsCollector): void {
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
					insertText: this.getInsertTextForValue(enm, separatorAfter),
					insertTextFormat: InsertTextFormat.Snippet,
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

	private addFillerValueCompletions(types: { [type: string]: boolean }, separatorAfter: string, collector: CompletionsCollector): void {
		if (types['object']) {
			collector.add({
				kind: this.getSuggestionKind('object'),
				label: '{}',
				insertText: this.getInsertTextForGuessedValue({}, separatorAfter),
				insertTextFormat: InsertTextFormat.Snippet,
				detail: localize('defaults.object', 'New object'),
				documentation: ''
			});
		}
		if (types['array']) {
			collector.add({
				kind: this.getSuggestionKind('array'),
				label: '[]',
				insertText: this.getInsertTextForGuessedValue([], separatorAfter),
				insertTextFormat: InsertTextFormat.Snippet,
				detail: localize('defaults.array', 'New array'),
				documentation: ''
			});
		}
	}

	private addBooleanValueCompletion(value: boolean, separatorAfter: string, collector: CompletionsCollector): void {
		collector.add({
			kind: this.getSuggestionKind('boolean'),
			label: value ? 'true' : 'false',
			insertText: this.getInsertTextForValue(value, separatorAfter),
			insertTextFormat: InsertTextFormat.Snippet,
			documentation: ''
		});
	}

	private addNullValueCompletion(separatorAfter: string, collector: CompletionsCollector): void {
		collector.add({
			kind: this.getSuggestionKind('null'),
			label: 'null',
			insertText: 'null' + separatorAfter,
			insertTextFormat: InsertTextFormat.Snippet,
			documentation: ''
		});
	}

	private addDollarSchemaCompletions(separatorAfter: string, collector: CompletionsCollector): void {
		let schemaIds = this.schemaService.getRegisteredSchemaIds(schema => schema === 'http' || schema === 'https');
		schemaIds.forEach(schemaId => collector.add({
			kind: CompletionItemKind.Module,
			label: this.getLabelForValue(schemaId),
			filterText: JSON.stringify(schemaId),
			insertText: this.getInsertTextForValue(schemaId, separatorAfter),
			insertTextFormat: InsertTextFormat.Snippet, documentation: ''
		}));
	}

	private getLabelForValue(value: any): string {
		let label = JSON.stringify(value);
		if (label.length > 57) {
			return label.substr(0, 57).trim() + '...';
		}
		return label;
	}

	private getFilterTextForValue(value): string {
		return JSON.stringify(value);
	}

	private getLabelForSnippetValue(value: any): string {
		let label = JSON.stringify(value);
		label = label.replace(/\$\{\d+:([^}]+)\}|\$\d+/g, '$1');
		if (label.length > 57) {
			return label.substr(0, 57).trim() + '...';
		}
		return label;
	}

	private getInsertTextForPlainText(text: string): string {
		return text.replace(/[\\\$\}]/g, '\\$&');   // escape $, \ and } 
	}

	private getInsertTextForValue(value: any, separatorAfter: string): string {
		var text = JSON.stringify(value, null, '\t');
		if (text === '{}') {
			return '{\n\t$1\n}' + separatorAfter;
		} else if (text === '[]') {
			return '[\n\t$1\n]' + separatorAfter;
		}
		return this.getInsertTextForPlainText(text + separatorAfter);
	}

	private getInsertTextForSnippetValue(value: any, separatorAfter: string): string {
		let replacer = (value) => {
			if (typeof value === 'string') {
				if (value[0] === '^') {
					return value.substr(1);
				}
			}
			return JSON.stringify(value);
		}
		return stringifyObject(value, '', replacer) + separatorAfter;
	}

	private templateVarIdCounter = 0;

	private getInsertTextForGuessedValue(value: any, separatorAfter: string): string {
		switch (typeof value) {
			case 'object':
				if (value === null) {
					return '${1:null}' + separatorAfter;
				}
				return this.getInsertTextForValue(value, separatorAfter);
			case 'string':
				let snippetValue = JSON.stringify(value);
				snippetValue = snippetValue.substr(1, snippetValue.length - 2); // remove quotes
				snippetValue = this.getInsertTextForPlainText(snippetValue); // escape \ and }
				return '"${1:' + snippetValue + '}"' + separatorAfter;
			case 'number':
			case 'boolean':
				return '${1:' + JSON.stringify(value) + '}' + separatorAfter;
		}
		return this.getInsertTextForValue(value, separatorAfter);
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

	private getLabelTextForMatchingNode(node: Parser.ASTNode, document: TextDocument): string {
		switch (node.type) {
			case 'array':
				return '[]';
			case 'object':
				return '{}';
			default:
				let content = document.getText().substr(node.start, node.end - node.start);
				return content;
		}
	}

	private getInsertTextForMatchingNode(node: Parser.ASTNode, document: TextDocument, separatorAfter: string): string {
		switch (node.type) {
			case 'array':
				return this.getInsertTextForValue([], separatorAfter);
			case 'object':
				return this.getInsertTextForValue({}, separatorAfter);
			default:
				let content = document.getText().substr(node.start, node.end - node.start) + separatorAfter;
				return this.getInsertTextForPlainText(content);
		}
	}

	private getInsertTextForProperty(key: string, propertySchema: JSONSchema, addValue: boolean, separatorAfter: string): string {

		let propertyText = this.getInsertTextForValue(key, '');
		if (!addValue) {
			return propertyText;
		}
		let resultText = propertyText + ': ';

		if (propertySchema) {
			let defaultVal = propertySchema.default;
			if (typeof defaultVal !== 'undefined') {
				resultText += this.getInsertTextForGuessedValue(defaultVal, '');
			} else if (propertySchema.enum && propertySchema.enum.length > 0) {
				resultText += this.getInsertTextForGuessedValue(propertySchema.enum[0], '');
			} else {
				var type = Array.isArray(propertySchema.type) ? propertySchema.type[0] : propertySchema.type;
				if (!type) {
					if (propertySchema.properties) {
						type = 'object';
					} else if (propertySchema.items) {
						type = 'array';
					}

				}
				switch (type) {
					case 'boolean':
						resultText += '${1:false}';
						break;
					case 'string':
						resultText += '"$1"';
						break;
					case 'object':
						resultText += '{\n\t$1\n}';
						break;
					case 'array':
						resultText += '[\n\t$1\n]';
						break;
					case 'number':
					case 'integer':
						resultText += '${1:0}';
						break;
					case 'null':
						resultText += '${1:null}';
						break;
					default:
						return propertyText;
				}
			}
		} else {
			resultText += '$1';
		}
		resultText += separatorAfter;
		return resultText;
	}

	private getCurrentWord(document: TextDocument, offset: number) {
		var i = offset - 1;
		var text = document.getText();
		while (i >= 0 && ' \t\n\r\v":{[,]}'.indexOf(text.charAt(i)) === -1) {
			i--;
		}
		return text.substring(i + 1, offset);
	}

	private evaluateSeparatorAfter(document: TextDocument, offset: number) {
		let scanner = Json.createScanner(document.getText(), true);
		scanner.setPosition(offset);
		let token = scanner.scan();
		switch (token) {
			case Json.SyntaxKind.CommaToken:
			case Json.SyntaxKind.CloseBraceToken:
			case Json.SyntaxKind.CloseBracketToken:
			case Json.SyntaxKind.EOF:
				return '';
			default:
				return ',';
		}
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