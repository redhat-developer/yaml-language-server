/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Parser from '../parser/jsonParser04';
import { parse as parseYAML } from '../parser/yamlParser04';
import * as Json from 'jsonc-parser';
import { YAMLSchemaService } from './yamlSchemaService';
import { JSONSchema } from '../jsonSchema04';
import { PromiseConstructor, Thenable, JSONWorkerContribution, CompletionsCollector } from 'vscode-json-languageservice';
import { CompletionItem, CompletionItemKind, CompletionList, TextDocument, Position, Range, TextEdit, InsertTextFormat } from 'vscode-languageserver-types';
import * as nls from 'vscode-nls';
import { getLineOffsets, matchOffsetToDocument, filterInvalidCustomTags } from '../utils/arrUtils';
import { LanguageSettings } from '../yamlLanguageService';
import { ResolvedSchema } from 'vscode-json-languageservice/lib/umd/services/jsonSchemaService';
const localize = nls.loadMessageBundle();

export class YAMLCompletion {

    private schemaService: YAMLSchemaService;
    private contributions: JSONWorkerContribution[];
    private promise: PromiseConstructor;
    private customTags: Array<String>;
    private completion: boolean;

    constructor(schemaService: YAMLSchemaService, contributions: JSONWorkerContribution[] = [], promiseConstructor?: PromiseConstructor) {
        this.schemaService = schemaService;
        this.contributions = contributions;
        this.promise = promiseConstructor || Promise;
        this.customTags = [];
        this.completion = true;
    }

    public configure(languageSettings: LanguageSettings, customTags: Array<String>) {
        if (languageSettings) {
            this.completion = languageSettings.completion;
        }
        this.customTags = customTags;
    }

    public doResolve(item: CompletionItem): Thenable<CompletionItem> {
        for (let i = this.contributions.length - 1; i >= 0; i--) {
            if (this.contributions[i].resolveCompletion) {
                const resolver = this.contributions[i].resolveCompletion(item);
                if (resolver) {
                    return resolver;
                }
            }
        }
        return this.promise.resolve(item);
    }

    public doComplete(document: TextDocument, position: Position, isKubernetes: boolean= false): Thenable<CompletionList> {

        const result: CompletionList = {
            items: [],
            isIncomplete: false
        };

        if (!this.completion) {
            return Promise.resolve(result);
        }
        const completionFix = this.completionHelper(document, position);
        const newText = completionFix.newText;
        const doc = parseYAML(newText);
        this.setKubernetesParserOption(doc.documents, isKubernetes);

        const offset = document.offsetAt(position);
        if (document.getText()[offset] === ':') {
            return Promise.resolve(result);
        }

        const currentDoc = matchOffsetToDocument(offset, doc);
        if (currentDoc === null) {
            return Promise.resolve(result);
        }
        const currentDocIndex = doc.documents.indexOf(currentDoc);
        let node = currentDoc.getNodeFromOffsetEndInclusive(offset);
        // if (this.isInComment(document, node ? node.start : 0, offset)) {
        // 	return Promise.resolve(result);
        // }

        const currentWord = this.getCurrentWord(document, offset);

        let overwriteRange = null;
        if (node && node.type === 'null') {
            const nodeStartPos = document.positionAt(node.start);
            nodeStartPos.character += 1;
            const nodeEndPos = document.positionAt(node.end);
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

        const proposed: { [key: string]: CompletionItem } = { };
        const collector: CompletionsCollector = {
            add: (suggestion: CompletionItem) => {
                const existing = proposed[suggestion.label];
                if (!existing) {
                    proposed[suggestion.label] = suggestion;
                    if (overwriteRange && overwriteRange.start.line === overwriteRange.end.line) {
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
            getNumberOfProposals: () =>
                result.items.length
        };

        if (this.customTags.length > 0) {
            this.getCustomTagValueCompletions(collector);
        }

        currentDoc.currentDocIndex = currentDocIndex;
        return this.schemaService.getSchemaForResource(document.uri, currentDoc).then(schema => {

            if (!schema) {
                return Promise.resolve(result);
            }
            const newSchema = schema;

            // tslint:disable-next-line: no-any
            const collectionPromises: Thenable<any>[] = [];

            let addValue = true;
            let currentKey = '';

            let currentProperty: Parser.PropertyASTNode = null;
            if (node) {

                if (node.type === 'string') {
                    const stringNode = <Parser.StringASTNode> node;
                    if (stringNode.isKey) {
                        addValue = !(node.parent && ((<Parser.PropertyASTNode> node.parent).value));
                        currentProperty = node.parent ? <Parser.PropertyASTNode> node.parent : null;
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
                const properties = (<Parser.ObjectASTNode> node).properties;
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
                    this.getPropertyCompletions(document, newSchema, currentDoc, node, addValue, collector, separatorAfter);
                }

                const location = node.getPath();
                this.contributions.forEach(contribution => {
                    const collectPromise = contribution.collectPropertyCompletions(document.uri, location, currentWord, addValue, false, collector);
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

            return this.promise.all(collectionPromises).then(() =>
                result);
        });
    }

private getPropertyCompletions(document: TextDocument, schema: ResolvedSchema,
        doc,
        node: Parser.ASTNode,
        addValue: boolean,
        collector: CompletionsCollector,
        separatorAfter: string
        ): void {
        const matchingSchemas = doc.getMatchingSchemas(schema.schema);
        matchingSchemas.forEach(s => {
            if (s.node === node && !s.inverted) {
                const schemaProperties = s.schema.properties;
                if (schemaProperties) {
                    Object.keys(schemaProperties).forEach((key: string) => {
                        const propertySchema = schemaProperties[key];
                        if (!propertySchema.deprecationMessage && !propertySchema['doNotSuggest']) {
                            let identCompensation = '';
                            if (node.parent && node.parent.type === 'array') {
                                // because there is a slash '-' to prevent the properties generated to have the correct
                                // indent
                                const sourceText = document.getText();
                                const indexOfSlash = sourceText.lastIndexOf('-', node.start - 1);
                                if (indexOfSlash > 0) {
                                    // add one space to compensate the '-'
                                    identCompensation = ' ' +  sourceText.slice(indexOfSlash + 1, node.start);
                                }
                            }
                            collector.add({
                                kind: CompletionItemKind.Property,
                                label: key,
                                insertText: this.getInsertTextForProperty(key, propertySchema, addValue, separatorAfter, identCompensation + '\t'),
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
                    this.addSchemaValueCompletions(s.schema, collector, separatorAfter);
                }
            }
        });
    }

    private getValueCompletions(schema: ResolvedSchema, doc, node: Parser.ASTNode, offset: number, document: TextDocument, collector: CompletionsCollector): void {
        let offsetForSeparator = offset;
        let parentKey: string = null;
        let valueNode: Parser.ASTNode = null;

        if (node && (node.type === 'string' || node.type === 'number' || node.type === 'boolean')) {
            offsetForSeparator = node.end;
            valueNode = node;
            node = node.parent;
        }

        if (node && node.type === 'null') {
            const nodeParent = node.parent;

            /*
             * This is going to be an object for some reason and we need to find the property
             * Its an issue with the null node
             */
            if (nodeParent && nodeParent.type === 'object') {
                for (const prop in nodeParent['properties']) {
                    const currNode = nodeParent['properties'][prop];
                    if (currNode.key && currNode.key.location === node.location) {
                        node = currNode;
                    }
                }
            }
        }

        if (!node) {
            this.addSchemaValueCompletions(schema.schema, collector, '');
            return;
        }

        if ((node.type === 'property') && offset > (<Parser.PropertyASTNode> node).colonOffset) {
            const propertyNode = <Parser.PropertyASTNode> node;
            const valueNode = propertyNode.value;
            if (valueNode && offset > valueNode.end) {
                return; // we are past the value node
            }
            parentKey = propertyNode.key.value;
            node = node.parent;
        }

        const separatorAfter = this.evaluateSeparatorAfter(document, offsetForSeparator);
        if (node && (parentKey !== null || node.type === 'array')) {
            const matchingSchemas = doc.getMatchingSchemas(schema.schema);
            matchingSchemas.forEach(s => {
                if (s.node === node && !s.inverted && s.schema) {
                    if (s.schema.items) {
                        if (Array.isArray(s.schema.items)) {
                            const index = this.findItemAtOffset(node, document, offset);
                            if (index < s.schema.items.length) {
                                this.addSchemaValueCompletions(s.schema.items[index], collector, separatorAfter, true);
                            }
                        } else if (s.schema.items.type === 'object') {
                            collector.add({
                                kind: this.getSuggestionKind(s.schema.items.type),
                                label: '- (array item)',
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
                        const propertySchema = s.schema.properties[parentKey];
                        if (propertySchema) {
                            this.addSchemaValueCompletions(propertySchema, collector, separatorAfter, false);
                        }
                    }
                }
            });
        }
    }

    private getContributedValueCompletions(doc: Parser.JSONDocument,
        node: Parser.ASTNode,
        offset: number,
        document: TextDocument,
        collector: CompletionsCollector,
        // tslint:disable-next-line: no-any
        collectionPromises: Thenable<any>[]
        ) {
        if (!node) {
            this.contributions.forEach(contribution => {
                const collectPromise = contribution.collectDefaultCompletions(document.uri, collector);
                if (collectPromise) {
                    collectionPromises.push(collectPromise);
                }
            });
        } else {
            if (node.type === 'string' || node.type === 'number' || node.type === 'boolean' || node.type === 'null') {
                node = node.parent;
            }
            if ((node.type === 'property') && offset > (<Parser.PropertyASTNode> node).colonOffset) {
                const parentKey = (<Parser.PropertyASTNode> node).key.value;

                const valueNode = (<Parser.PropertyASTNode> node).value;
                if (!valueNode || offset <= valueNode.end) {
                    const location = node.parent.getPath();
                    this.contributions.forEach(contribution => {
                        const collectPromise = contribution.collectValueCompletions(document.uri, location, parentKey, collector);
                        if (collectPromise) {
                            collectionPromises.push(collectPromise);
                        }
                    });
                }
            }
        }
    }

    private getCustomTagValueCompletions(collector: CompletionsCollector) {
        const validCustomTags = filterInvalidCustomTags(this.customTags);
        validCustomTags.forEach(validTag => {
            // Valid custom tags are guarenteed to be strings
            const label = validTag.split(' ')[0];
            this.addCustomTagValueCompletion(collector, ' ', label);
        });
    }

    private addSchemaValueCompletions(schema: JSONSchema, collector: CompletionsCollector, separatorAfter: string, forArrayItem = false): void {
        const types: { [type: string]: boolean } = { };
        this.addSchemaValueCompletionsCore(schema, collector, types, separatorAfter, forArrayItem);
        if (types['boolean']) {
            this.addBooleanValueCompletion(true, collector, separatorAfter);
            this.addBooleanValueCompletion(false, collector, separatorAfter);
        }
        if (types['null']) {
            this.addNullValueCompletion(collector, separatorAfter);
        }
    }

    private addSchemaValueCompletionsCore(schema: JSONSchema,
        collector: CompletionsCollector,
        types: { [type: string]: boolean },
        separatorAfter: string,
        forArrayItem = false
        ): void {
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
        if (Array.isArray(schema['examples'])) {
            schema['examples'].forEach(example => {
                let type = schema.type;
                let value = example;
                for (let i = arrayDepth; i > 0; i--) {
                    value = [value];
                    type = 'array';
                }
                collector.add({
                    kind: this.getSuggestionKind(type),
                    label: this.getLabelForValue(value),
                    insertText: this.getInsertTextForValue(value, separatorAfter),
                    insertTextFormat: InsertTextFormat.Snippet
                });
                hasProposals = true;
            });
        }
        if (!hasProposals && schema.items && !Array.isArray(schema.items)) {
            this.addDefaultValueCompletions(schema.items, collector, separatorAfter, arrayDepth + 1);
        }
    }

    private addEnumValueCompletions(schema: JSONSchema, collector: CompletionsCollector, separatorAfter: string, forArrayItem = false): void {
        if (isDefined(schema['const'])) {
            collector.add({
                kind: this.getSuggestionKind(schema.type),
                label: this.getLabelForValue(schema['const']),
                insertText: this.getInsertTextForValue(schema['const'], separatorAfter),
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: schema.description
            });
        }
        if (Array.isArray(schema.enum)) {
            for (let i = 0, length = schema.enum.length; i < length; i++) {
                const enm = schema.enum[i];
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
        const type = schema.type;
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

    // tslint:disable-next-line: no-any
    private getLabelForValue(value: any): string {
        const label = typeof value === 'string' ? value : JSON.stringify(value);
        if (label.length > 57) {
            return label.substr(0, 57).trim() + '...';
        }
        return label;
    }

    // tslint:disable-next-line: no-any
    private getSuggestionKind(type: any): CompletionItemKind {
        if (Array.isArray(type)) {
            // tslint:disable-next-line: no-any
            const array = <any[]> type;
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
        let i = offset - 1;
        const text = document.getText();
        while (i >= 0 && ' \t\n\r\v":{[,]}'.indexOf(text.charAt(i)) === -1) {
            i--;
        }
        return text.substring(i + 1, offset);
    }

    private findItemAtOffset(node: Parser.ASTNode, document: TextDocument, offset: number) {
        const scanner = Json.createScanner(document.getText(), true);
        const children = node.getChildNodes();
        for (let i = children.length - 1; i >= 0; i--) {
            const child = children[i];
            if (offset > child.end) {
                scanner.setPosition(child.end);
                const token = scanner.scan();
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

    // private isInComment(document: TextDocument, start: number, offset: number) {
    // 	let scanner = Json.createScanner(document.getText(), false);
    // 	scanner.setPosition(start);
    // 	let token = scanner.scan();
    // 	while (token !== Json.SyntaxKind.EOF && (scanner.getTokenOffset() + scanner.getTokenLength() < offset)) {
    // 		token = scanner.scan();
    // 	}
    // 	return (token === Json.SyntaxKind.LineCommentTrivia || token === Json.SyntaxKind.BlockCommentTrivia) && scanner.getTokenOffset() <= offset;
    // }

    private getInsertTextForPlainText(text: string): string {
        return text.replace(/[\\\$\}]/g, '\\$&');   // escape $, \ and }
    }

    // tslint:disable-next-line: no-any
    private getInsertTextForValue(value: any, separatorAfter: string): string {
        const text = value;
        if (text === '{}') {
            return '{\n\t$1\n}' + separatorAfter;
        } else if (text === '[]') {
            return '[\n\t$1\n]' + separatorAfter;
        }
        return this.getInsertTextForPlainText(text + separatorAfter);
    }

    private getInsertTextForObject(schema: JSONSchema, separatorAfter: string, indent = '\t', insertIndex = 1) {
        let insertText = '';
        if (!schema.properties) {
            insertText = `${indent}\$${insertIndex++}\n`;
            return { insertText, insertIndex };
        }

        Object.keys(schema.properties).forEach((key: string) => {
            const propertySchema = schema.properties[key];
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
                        insertText += `${indent}${key}: \$${insertIndex++}\n`;
                        break;
                    case 'array':
                        const arrayInsertResult = this.getInsertTextForArray(propertySchema.items, separatorAfter, `${indent}\t`, insertIndex++);
                        insertIndex = arrayInsertResult.insertIndex;
                        insertText += `${indent}${key}:\n${indent}\t- ${arrayInsertResult.insertText}\n`;
                        break;
                    case 'object':
                        const objectInsertResult = this.getInsertTextForObject(propertySchema, separatorAfter, `${indent}\t`, insertIndex++);
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
                        insertText += `${indent}${key}: \${${insertIndex++}:${propertySchema.default}}\n`;
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
                const objectInsertResult = this.getInsertTextForObject(schema, separatorAfter, `${indent}\t`, insertIndex++);
                insertText = objectInsertResult.insertText.trimLeft();
                insertIndex = objectInsertResult.insertIndex;
                break;
        }
        return { insertText, insertIndex };
    }

    private getInsertTextForProperty(key: string, propertySchema: JSONSchema, addValue: boolean, separatorAfter: string,
                                     ident: string = '\t'): string {

        const propertyText = this.getInsertTextForValue(key, '');
        // if (!addValue) {
        //     return propertyText;
        // }
        const resultText = propertyText + ':';

        let value;
        if (propertySchema) {
            if (propertySchema.default !== undefined) {
                value = ` \${1:${propertySchema.default}}`;
            } else if (propertySchema.properties) {
                return `${resultText}\n${this.getInsertTextForObject(propertySchema, separatorAfter, ident).insertText}`;
            } else if (propertySchema.items) {
                return `${resultText}\n\t- ${this.getInsertTextForArray(propertySchema.items, separatorAfter, ident).insertText}`;
            } else {
                const type = Array.isArray(propertySchema.type) ? propertySchema.type[0] : propertySchema.type;
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
        // let scanner = Json.createScanner(document.getText(), true);
        // scanner.setPosition(offset);
        // let token = scanner.scan();
        // switch (token) {
        // 	case Json.SyntaxKind.CommaToken:
        // 	case Json.SyntaxKind.CloseBraceToken:
        // 	case Json.SyntaxKind.CloseBracketToken:
        // 	case Json.SyntaxKind.EOF:
        // 		return '';
        // 	default:
        // 		return '';
        // }
        return '';
    }

    /**
     * Corrects simple syntax mistakes to load possible nodes even if a semicolon is missing
     */
    private completionHelper(document: TextDocument, textDocumentPosition: Position) {
        // Get the string we are looking at via a substring
        const linePos = textDocumentPosition.line;
        const position = textDocumentPosition;
        const lineOffset = getLineOffsets(document.getText());
        const start = lineOffset[linePos]; // Start of where the autocompletion is happening
        let end = 0; // End of where the autocompletion is happening

        if (lineOffset[linePos + 1]) {
            end = lineOffset[linePos + 1];
        } else {
            end = document.getText().length;
        }

        while (end - 1 >= 0 && this.is_EOL(document.getText().charCodeAt(end - 1))) {
            end--;
        }

        const textLine = document.getText().substring(start, end);

        // Check if the string we are looking at is a node
        if (textLine.indexOf(':') === -1) {
            // We need to add the ":" to load the nodes
            let newText = '';

            // This is for the empty line case
            const trimmedText = textLine.trim();
            if (trimmedText.length === 0 || (trimmedText.length === 1 && trimmedText[0] === '-')) {
                // Add a temp node that is in the document but we don't use at all.
                newText = document.getText().substring(0, start + textLine.length) +
                    (trimmedText[0] === '-' && !textLine.endsWith(' ') ? ' ' : '') + 'holder:\r\n' +
                    document.getText().substr(lineOffset[linePos + 1] || document.getText().length);

                // For when missing semi colon case
            } else {
                // Add a semicolon to the end of the current line so we can validate the node
                newText = document.getText().substring(0, start + textLine.length) + ':\r\n' + document.getText().substr(lineOffset[linePos + 1] || document.getText().length);
            }

            return {
                'newText': newText,
                'newPosition': textDocumentPosition
            };
        } else {
            // All the nodes are loaded
            position.character = position.character - 1;

            return {
                'newText': document.getText(),
                'newPosition': position
            };
        }
    }

    private is_EOL(c: number) {
        return (c === 0x0A/* LF */) || (c === 0x0D/* CR */);
    }

    // Called by onCompletion
    private setKubernetesParserOption(jsonDocuments: Parser.JSONDocument[], option: boolean) {
        for (const jsonDoc in jsonDocuments) {
            jsonDocuments[jsonDoc].configureSettings({
                isKubernetes: option
            });
        }
    }
}

// tslint:disable-next-line: no-any
function isDefined(val: any): val is object {
    return val !== undefined;
}
