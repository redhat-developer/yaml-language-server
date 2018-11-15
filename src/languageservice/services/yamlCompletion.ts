/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import * as Parser from '../parser/jsonParser';
import * as Json from 'jsonc-parser';
import * as SchemaService from './jsonSchemaService';
import { JSONSchema } from '../jsonSchema';
import { JSONWorkerContribution, CompletionsCollector } from '../jsonContributions';
import { PromiseConstructor, Thenable } from 'vscode-json-languageservice';

import { CompletionItem, CompletionItemKind, CompletionList, TextDocument, Position, Range, TextEdit, InsertTextFormat } from 'vscode-languageserver-types';

import * as nls from 'vscode-nls';
import { matchOffsetToDocument } from '../utils/arrUtils';
import { LanguageSettings } from '../yamlLanguageService';
const localize = nls.loadMessageBundle();


export class YAMLCompletion {

	private schemaService: SchemaService.IJSONSchemaService;
	private contributions: JSONWorkerContribution[];
	private promise: PromiseConstructor;
	private customTags: Array<String>;
	private completion: boolean;

	constructor(schemaService: SchemaService.IJSONSchemaService, contributions: JSONWorkerContribution[] = [], promiseConstructor?: PromiseConstructor) {
		this.schemaService = schemaService;
		this.contributions = contributions;
		this.promise = promiseConstructor || Promise;
		this.customTags = [];
		this.completion = true;
	}

	public configure(languageSettings: LanguageSettings, customTags: Array<String>){
		if (languageSettings) {
			this.completion = languageSettings.completion;
		}
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

	public doComplete(document: TextDocument, position: Position, doc): Thenable<CompletionList> {

		let result: CompletionList = {
			items: [],
			isIncomplete: false
		};

		if (!this.completion) {
			return Promise.resolve(result);
		}

		let offset = document.offsetAt(position);
		if(document.getText()[offset] === ":"){
			return Promise.resolve(result);
		}

		let currentDoc = matchOffsetToDocument(offset, doc);
		if(currentDoc === null){
			return Promise.resolve(result);
		}
		const currentDocIndex = doc.documents.indexOf(currentDoc);
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
			let newSchema = schema;
			if (schema.schema && schema.schema.schemaSequence && schema.schema.schemaSequence[currentDocIndex]) {
				newSchema = new SchemaService.ResolvedSchema(schema.schema.schemaSequence[currentDocIndex]);
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

				if (newSchema) {
					// property proposals with schema
					this.getPropertyCompletions(newSchema, currentDoc, node, addValue, collector, separatorAfter);
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
			if (newSchema) {
				this.getValueCompletions(newSchema, currentDoc, node, offset, document, collector);
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
				// Error fix
				// If this is a array of string/boolean/number
				//  test:
				//    - item1
				// it will treated as a property key since `:` has been appended
				if (node.type === 'object' && node.parent && node.parent.type === 'array' && s.schema.type !== 'object') {
					this.addSchemaValueCompletions(s.schema, collector, separatorAfter)
				}
			}
		});
	}

	private getValueCompletions(schema: SchemaService.ResolvedSchema, doc, node: Parser.ASTNode, offset: number, document: TextDocument, collector: CompletionsCollector): void {
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
			this.addSchemaValueCompletions(schema.schema, collector, "");
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
								this.addSchemaValueCompletions(s.schema.items[index], collector, separatorAfter, true);
							}
						} else if (s.schema.items.type === 'object') {
							collector.add({
								kind: this.getSuggestionKind(s.schema.items.type),
								label: `- (array item)`,
								documentation: `Create an item of an array${s.schema.description === undefined ? '' : '(' + s.schema.description + ')'}`,
								insertText: `- ${this.getInsertTextForObject(s.schema.items, separatorAfter).insertText.trimLeft()}`,
								insertTextFormat: InsertTextFormat.Snippet,
							});
						}
						else {
							this.addSchemaValueCompletions(s.schema.items, collector, separatorAfter, true);
						}
					}
					if (s.schema.properties) {
						let propertySchema = s.schema.properties[parentKey];
						if (propertySchema) {
							this.addSchemaValueCompletions(propertySchema, collector, separatorAfter, false);
						}
					}
				}
			});
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

	private addSchemaValueCompletions(schema: JSONSchema, collector: CompletionsCollector, separatorAfter: string, forArrayItem = false): void {
		let types: { [type: string]: boolean } = {};
		this.addSchemaValueCompletionsCore(schema, collector, types, separatorAfter, forArrayItem);
		if (types['boolean']) {
			this.addBooleanValueCompletion(true, collector, separatorAfter);
			this.addBooleanValueCompletion(false, collector, separatorAfter);
		}
		if (types['null']) {
			this.addNullValueCompletion(collector, separatorAfter);
		}
	}

	private addSchemaValueCompletionsCore(schema: JSONSchema, collector: CompletionsCollector, types: { [type: string]: boolean }, separatorAfter: string, forArrayItem = false): void {
		this.addDefaultValueCompletions(schema, collector, separatorAfter, 0, forArrayItem);
		this.addEnumValueCompletions(schema, collector, separatorAfter, forArrayItem);
		this.collectTypes(schema, types);
		if (Array.isArray(schema.allOf)) {
			schema.allOf.forEach(s => this.addSchemaValueCompletionsCore(s, collector, types, separatorAfter, forArrayItem));
		}
		if (Array.isArray(schema.anyOf)) {
			schema.anyOf.forEach(s => this.addSchemaValueCompletionsCore(s, collector, types, separatorAfter, forArrayItem));
		}
		if (Array.isArray(schema.oneOf)) {
			schema.oneOf.forEach(s => this.addSchemaValueCompletionsCore(s, collector, types, separatorAfter, forArrayItem));
		}
	}

	private addDefaultValueCompletions(schema: JSONSchema, collector: CompletionsCollector, separatorAfter: string, arrayDepth = 0, forArrayItem = false): void {
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
				label: forArrayItem ? `- ${this.getLabelForValue(value)}` : this.getLabelForValue(value),
				insertText: forArrayItem ? `- ${this.getInsertTextForValue(value, separatorAfter)}` : this.getInsertTextForValue(value, separatorAfter),
				insertTextFormat: InsertTextFormat.Snippet,
				detail: localize('json.suggest.default', 'Default value'),
			});
			hasProposals = true;
		}
		if (!hasProposals && schema.items && !Array.isArray(schema.items)) {
			this.addDefaultValueCompletions(schema.items, collector, separatorAfter, arrayDepth + 1);
		}
	}

	private addEnumValueCompletions(schema: JSONSchema, collector: CompletionsCollector, separatorAfter: string, forArrayItem = false): void {
		if (Array.isArray(schema.enum)) {
			for (let i = 0, length = schema.enum.length; i < length; i++) {
				let enm = schema.enum[i];
				let documentation = schema.description;
				if (schema.enumDescriptions && i < schema.enumDescriptions.length) {
					documentation = schema.enumDescriptions[i];
				}
				collector.add({
					kind: this.getSuggestionKind(schema.type),
					label: forArrayItem ? `- ${this.getLabelForValue(enm)}` : this.getLabelForValue(enm),
					insertText: forArrayItem ? `- ${this.getInsertTextForValue(enm, separatorAfter)}` : this.getInsertTextForValue(enm, separatorAfter),
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

	private getInsertTextForObject(schema: JSONSchema, separatorAfter: string, indent = '\t', insertIndex = 1) {
		let insertText = "";
		if (!schema.properties) {
			insertText = `${indent}\$${insertIndex++}\n`;
			return { insertText, insertIndex };
		}

		Object.keys(schema.properties).forEach((key: string) => {
			let propertySchema = schema.properties[key];
			let type = Array.isArray(propertySchema.type) ? propertySchema.type[0] : propertySchema.type;
			if (!type) {
				if (propertySchema.properties) {
					type = 'object';
				}
				if (propertySchema.items) {
					type = 'array';
				}
			}
			if (schema.required && schema.required.indexOf(key) > -1) {
				switch (type) {
					case 'boolean':
					case 'string':
					case 'number':
					case 'integer':
						insertText += `${indent}${key}: \$${insertIndex++}\n`
						break;
					case 'array':
						let arrayInsertResult = this.getInsertTextForArray(propertySchema.items, separatorAfter, `${indent}\t`, insertIndex++);
						insertIndex = arrayInsertResult.insertIndex;
						insertText += `${indent}${key}:\n${indent}\t- ${arrayInsertResult.insertText}\n`;
						break;
					case 'object':
						let objectInsertResult = this.getInsertTextForObject(propertySchema, separatorAfter, `${indent}\t`, insertIndex++);
						insertIndex = objectInsertResult.insertIndex;
						insertText += `${indent}${key}:\n${objectInsertResult.insertText}\n`;
						break;
				}
			} else if (propertySchema.default !== undefined) {
				switch (type) {
					case 'boolean':
					case 'string':
					case 'number':
					case 'integer':
						insertText += `${indent}${key}: \${${insertIndex++}:${propertySchema.default}}\n`
						break;
					case 'array':
					case 'object':
						// TODO: support default value for array object
						break;
				}
			}
		});
		if (insertText.trim().length === 0) {
			insertText = `${indent}\$${insertIndex++}\n`;
		}
		insertText = insertText.trimRight() + separatorAfter;
		return { insertText, insertIndex };
	}

	private getInsertTextForArray(schema: JSONSchema, separatorAfter: string, indent = '\t', insertIndex = 1) {
		let insertText = '';
		if (!schema) {
			insertText = `\$${insertIndex++}`;
		}
		let type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
		if (!type) {
			if (schema.properties) {
				type = 'object';
			}
			if (schema.items) {
				type = 'array';
			}
		}
		switch (schema.type) {
			case 'boolean':
				insertText = `\${${insertIndex++}:false}`;
				break;
			case 'number':
			case 'integer':
				insertText = `\${${insertIndex++}:0}`;
				break;
			case 'string':
				insertText = `\${${insertIndex++}:null}`;
				break;
			case 'object':
				let objectInsertResult = this.getInsertTextForObject(schema, separatorAfter, `${indent}\t`, insertIndex++);
				insertText = objectInsertResult.insertText.trimLeft();
				insertIndex = objectInsertResult.insertIndex;
				break;
		}
		return { insertText, insertIndex };
	}

	private getInsertTextForProperty(key: string, propertySchema: JSONSchema, addValue: boolean, separatorAfter: string): string {

		let propertyText = this.getInsertTextForValue(key, '');
		// if (!addValue) {
		// 	return propertyText;
		// }
		let resultText = propertyText + ':';

		let value;
		if (propertySchema) {
			if (propertySchema.default !== undefined) {
				value = ` \${1:${propertySchema.default}}`
			}
			else if (propertySchema.properties) {
				return `${resultText}\n${this.getInsertTextForObject(propertySchema, separatorAfter).insertText}`;
			}
			else if (propertySchema.items) {
				return `${resultText}\n\t- ${this.getInsertTextForArray(propertySchema.items, separatorAfter).insertText}`;
			}
			else {
				var type = Array.isArray(propertySchema.type) ? propertySchema.type[0] : propertySchema.type;
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
		if (!value) {
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