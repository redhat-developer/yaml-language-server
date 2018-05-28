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

import { CompletionItem, CompletionItemKind, CompletionList, TextDocument, Position, Range, TextEdit, InsertTextFormat } from 'vscode-languageserver-types';

import * as nls from 'vscode-nls';
import { matchOffsetToDocument } from '../utils/arrUtils';
const localize = nls.loadMessageBundle();


export class YAMLCompletion {

	private schemaService: SchemaService.IJSONSchemaService;
	private contributions: JSONWorkerContribution[];
	private promise: PromiseConstructor;
	private customTags: Array<String>;

	constructor(schemaService: SchemaService.IJSONSchemaService, contributions: JSONWorkerContribution[] = [], promiseConstructor?: PromiseConstructor) {
		this.schemaService = schemaService;
		this.contributions = contributions;
		this.promise = promiseConstructor || Promise;
		this.customTags = [];
	}

	public configure(customTags: Array<String>){
		this.customTags = customTags;
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
		if(document.getText()[offset] === ":"){
			return Promise.resolve(result);
		}
		
		let currentDoc = matchOffsetToDocument(offset, doc);
		if(currentDoc === null){
			return Promise.resolve(result);
		}
		let node = currentDoc.getNodeFromOffsetEndInclusive(offset);
		if (this.isInComment(document, node ? node.start : 0, offset)) {
			return Promise.resolve(result);
		}

		let currentWord = this.getCurrentWord(document, offset);

		let overwriteRange = null;
		if(node && node.type === 'null'){
			let nodeStartPos = document.positionAt(node.start);
			nodeStartPos.character += 1;
			let nodeEndPos = document.positionAt(node.end);
			nodeEndPos.character += 1;
			overwriteRange = Range.create(nodeStartPos, nodeEndPos);
		}else if (node && (node.type === 'string' || node.type === 'number' || node.type === 'boolean')) {
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

			if(!schema){
				return Promise.resolve(result);
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

				let separatorAfter = '';
				if (addValue) {
					separatorAfter = this.evaluateSeparatorAfter(document, document.offsetAt(overwriteRange.end));
				}

				if (schema) {
					// property proposals with schema
					this.getPropertyCompletions(schema, currentDoc, node, addValue, collector, separatorAfter);
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
						label: this.getLabelForValue(currentWord),
						insertText: this.getInsertTextForProperty(currentWord, null, false, separatorAfter),
						insertTextFormat: InsertTextFormat.Snippet, 
						documentation: ''
					});
				}
			}

			// proposals for values
			let types: { [type: string]: boolean } = {};
			if (schema) {
				this.getValueCompletions(schema, currentDoc, node, offset, document, collector, types);
			} 
			if (this.contributions.length > 0) {
				this.getContributedValueCompletions(currentDoc, node, offset, document, collector, collectionPromises);
			}
			if (this.customTags.length > 0) {
				this.getCustomTagValueCompletions(collector);
			}

			return this.promise.all(collectionPromises).then(() => {
				return result;
			});
		});
	}

	private getPropertyCompletions(schema: SchemaService.ResolvedSchema, doc, node: Parser.ASTNode, addValue: boolean, collector: CompletionsCollector, separatorAfter: string): void {
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
								documentation: propertySchema.description || ''
							});
						}
					});
				}
			}
		});
	}

	private getValueCompletions(schema: SchemaService.ResolvedSchema, doc, node: Parser.ASTNode, offset: number, document: TextDocument, collector: CompletionsCollector, types: { [type: string]: boolean }	): void {
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
			this.addSchemaValueCompletions(schema.schema, collector, types, "");
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

		let separatorAfter = this.evaluateSeparatorAfter(document, offsetForSeparator);
		if (node && (parentKey !== null || node.type === 'array')) {
			let matchingSchemas = doc.getMatchingSchemas(schema.schema);
			matchingSchemas.forEach(s => {
				if (s.node === node && !s.inverted && s.schema) {
					if (s.schema.items) {
						if (Array.isArray(s.schema.items)) {
							let index = this.findItemAtOffset(node, document, offset);
							if (index < s.schema.items.length) {
								this.addSchemaValueCompletions(s.schema.items[index], collector, types, separatorAfter);
							}
						} else {
							this.addSchemaValueCompletions(s.schema.items, collector, types, separatorAfter);
						}
					}
					if (s.schema.properties) {
						let propertySchema = s.schema.properties[parentKey];
						if (propertySchema) {
							this.addSchemaValueCompletions(propertySchema, collector, types, separatorAfter);
						}
					}
				}
			});
		}
		if(node){
			if (types['boolean']) {
				this.addBooleanValueCompletion(true, collector, separatorAfter);
				this.addBooleanValueCompletion(false, collector, separatorAfter);
			}
			if (types['null']) {
				this.addNullValueCompletion(collector, separatorAfter);
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

	private getCustomTagValueCompletions(collector: CompletionsCollector) {	
		this.customTags.forEach((customTagItem) => {
			let tagItemSplit = customTagItem.split(" ");
			if(tagItemSplit && tagItemSplit[0]){
				this.addCustomTagValueCompletion(collector, " ", tagItemSplit[0]);
			}
		});
	}

	private addSchemaValueCompletions(schema: JSONSchema, collector: CompletionsCollector, types: { [type: string]: boolean }, separatorAfter: string): void {
		this.addDefaultValueCompletions(schema, collector, separatorAfter);
		this.addEnumValueCompletions(schema, collector, separatorAfter);
		this.collectTypes(schema, types);
		if (Array.isArray(schema.allOf)) {
			schema.allOf.forEach(s => this.addSchemaValueCompletions(s, collector, types, separatorAfter));
		}
		if (Array.isArray(schema.anyOf)) {
			schema.anyOf.forEach(s => this.addSchemaValueCompletions(s, collector, types, separatorAfter));
		}
		if (Array.isArray(schema.oneOf)) {
			schema.oneOf.forEach(s => this.addSchemaValueCompletions(s, collector, types, separatorAfter));
		}
	}

	private addDefaultValueCompletions(schema: JSONSchema, collector: CompletionsCollector, separatorAfter: string, arrayDepth = 0): void {
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
		if (!hasProposals && schema.items && !Array.isArray(schema.items)) {
			this.addDefaultValueCompletions(schema.items, collector, separatorAfter, arrayDepth + 1);
		}
	}

	private addEnumValueCompletions(schema: JSONSchema, collector: CompletionsCollector, separatorAfter: string): void {
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

	private addBooleanValueCompletion(value: boolean, collector: CompletionsCollector, separatorAfter: string): void {
		collector.add({
			kind: this.getSuggestionKind('boolean'),
			label: value ? 'true' : 'false',
			insertText: this.getInsertTextForValue(value, separatorAfter),
			insertTextFormat: InsertTextFormat.Snippet,
			documentation: ''
		});
	}

	private addNullValueCompletion(collector: CompletionsCollector, separatorAfter: string): void {
		collector.add({
			kind: this.getSuggestionKind('null'),
			label: 'null',
			insertText: 'null' + separatorAfter,
			insertTextFormat: InsertTextFormat.Snippet,
			documentation: ''
		});
	}

	private addCustomTagValueCompletion(collector: CompletionsCollector, separatorAfter: string, label: string): void {
		collector.add({
			kind: this.getSuggestionKind('string'),
			label: label,
			insertText: label + separatorAfter,
			insertTextFormat: InsertTextFormat.Snippet,
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

	private getInsertTextForPlainText(text: string): string {
		return text.replace(/[\\\$\}]/g, '\\$&');   // escape $, \ and } 
	}

	private getInsertTextForValue(value: any, separatorAfter: string): string {
		var text = value;
		if (text === '{}') {
			return '{\n\t$1\n}' + separatorAfter;
		} else if (text === '[]') {
			return '[\n\t$1\n]' + separatorAfter;
		}
		return this.getInsertTextForPlainText(text + separatorAfter);
	}

	private getInsertTextForProperty(key: string, propertySchema: JSONSchema, addValue: boolean, separatorAfter: string): string {

		let propertyText = this.getInsertTextForValue(key, '');
		// if (!addValue) {
		// 	return propertyText;
		// }
		let resultText = propertyText + ':';

		let value;
		let nValueProposals = 0;
		if (propertySchema) {
			if (nValueProposals === 0) {
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
						value = ' $1';
						break;
					case 'string':
						value = ' $1';
						break;
					case 'object':
						value = '\n\t';
						break;
					case 'array':
						value = '\n\t- ';
						break;
					case 'number':
					case 'integer':
						value = ' ${1:0}';
						break;
					case 'null':
						value = ' ${1:null}';
						break;
					default:
						return propertyText;
				}
			}
		}
		if (!value || nValueProposals > 1) {
			value = '$1';
		}
		return resultText + value + separatorAfter;
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
				return '';
		}
	}
}