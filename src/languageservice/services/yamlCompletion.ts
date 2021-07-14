/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Parser from '../parser/jsonParser07';
import { ASTNode, ObjectASTNode, PropertyASTNode } from '../jsonASTTypes';
import { parse as parseYAML } from '../parser/yamlParser07';
import { YAMLSchemaService } from './yamlSchemaService';
import { JSONSchema, JSONSchemaRef } from '../jsonSchema';
import { CompletionsCollector } from 'vscode-json-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  CompletionItem,
  CompletionItemKind,
  CompletionList,
  Position,
  Range,
  TextEdit,
  InsertTextFormat,
} from 'vscode-languageserver-types';
import * as nls from 'vscode-nls';
import { getLineOffsets, filterInvalidCustomTags, matchOffsetToDocument } from '../utils/arrUtils';
import { LanguageSettings } from '../yamlLanguageService';
import { ResolvedSchema } from 'vscode-json-languageservice/lib/umd/services/jsonSchemaService';
import { JSONCompletion } from 'vscode-json-languageservice/lib/umd/services/jsonCompletion';
import { stringifyObject, StringifySettings } from '../utils/json';
import { guessIndentation } from '../utils/indentationGuesser';
import { TextBuffer } from '../utils/textBuffer';
import { setKubernetesParserOption } from '../parser/isKubernetes';
import { ClientCapabilities, MarkupContent } from 'vscode-languageserver';
import { Telemetry } from '../../languageserver/telemetry';
const localize = nls.loadMessageBundle();

const doubleQuotesEscapeRegExp = /[\\]+"/g;

export class YAMLCompletion extends JSONCompletion {
  private schemaService: YAMLSchemaService;
  private customTags: Array<string>;
  private completion: boolean;
  private indentation: string;
  private configuredIndentation: string | undefined;

  constructor(
    schemaService: YAMLSchemaService,
    clientCapabilities: ClientCapabilities = {},
    private readonly telemetry: Telemetry
  ) {
    super(schemaService, [], Promise, clientCapabilities);
    this.schemaService = schemaService;
    this.customTags = [];
    this.completion = true;
  }

  public configure(languageSettings: LanguageSettings, customTags: Array<string>): void {
    if (languageSettings) {
      this.completion = languageSettings.completion;
    }
    this.customTags = customTags;
    this.configuredIndentation = languageSettings.indentation;
  }

  public doComplete(document: TextDocument, position: Position, isKubernetes = false): Promise<CompletionList> {
    const result: CompletionList = {
      items: [],
      isIncomplete: false,
    };

    if (!this.completion) {
      return Promise.resolve(result);
    }
    const originalPosition = Position.create(position.line, position.character);
    const completionFix = this.completionHelper(document, position);
    const newText = completionFix.newText;
    const doc = parseYAML(newText);
    const textBuffer = new TextBuffer(document);
    if (!this.configuredIndentation) {
      const indent = guessIndentation(textBuffer, 2, true);
      this.indentation = indent.insertSpaces ? ' '.repeat(indent.tabSize) : '\t';
    } else {
      this.indentation = this.configuredIndentation;
    }
    setKubernetesParserOption(doc.documents, isKubernetes);

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

    const currentWord = super.getCurrentWord(document, offset);

    let overwriteRange = null;
    if (node && node.type === 'null') {
      const nodeStartPos = document.positionAt(node.offset);
      nodeStartPos.character += 1;
      const nodeEndPos = document.positionAt(node.offset + node.length);
      nodeEndPos.character += 1;
      overwriteRange = Range.create(nodeStartPos, nodeEndPos);
    } else if (node && (node.type === 'string' || node.type === 'number' || node.type === 'boolean')) {
      overwriteRange = Range.create(document.positionAt(node.offset), document.positionAt(node.offset + node.length));
    } else {
      let overwriteStart = document.offsetAt(originalPosition) - currentWord.length;
      if (overwriteStart > 0 && document.getText()[overwriteStart - 1] === '"') {
        overwriteStart--;
      }
      overwriteRange = Range.create(document.positionAt(overwriteStart), originalPosition);
    }

    const proposed: { [key: string]: CompletionItem } = {};
    const collector: CompletionsCollector = {
      add: (suggestion: CompletionItem) => {
        let label = suggestion.label;
        const existing = proposed[label];
        if (!existing) {
          label = label.replace(/[\n]/g, '↵');
          if (label.length > 60) {
            const shortendedLabel = label.substr(0, 57).trim() + '...';
            if (!proposed[shortendedLabel]) {
              label = shortendedLabel;
            }
          }
          if (overwriteRange && overwriteRange.start.line === overwriteRange.end.line) {
            suggestion.textEdit = TextEdit.replace(overwriteRange, suggestion.insertText);
          }
          suggestion.label = label;
          proposed[label] = suggestion;
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
        this.telemetry.sendError('yaml.completion.error', { error: message });
      },
      log: (message: string) => {
        console.log(message);
      },
      getNumberOfProposals: () => {
        return result.items.length;
      },
    };

    if (this.customTags.length > 0) {
      this.getCustomTagValueCompletions(collector);
    }

    currentDoc.currentDocIndex = currentDocIndex;
    return this.schemaService.getSchemaForResource(document.uri, currentDoc).then((schema) => {
      if (!schema || schema.errors.length) {
        return Promise.resolve(result);
      }
      const newSchema = schema;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const collectionPromises: Promise<any>[] = [];

      let addValue = true;

      let currentProperty: PropertyASTNode = null;
      if (node) {
        if (node.type === 'string') {
          const parent = node.parent;
          if (parent && parent.type === 'property' && parent.keyNode === node) {
            addValue = !parent.valueNode;
            currentProperty = parent;
            if (parent) {
              node = parent.parent;
            }
          }
        }
        if (node.type === 'null') {
          const parent = node.parent;
          if (parent && parent.type === 'property' && parent.valueNode === node) {
            addValue = !parent.valueNode;
            currentProperty = parent;
            if (parent) {
              node = parent;
            }
          }
        }
      }

      // proposals for properties
      if (node && node.type === 'object') {
        // don't suggest properties that are already present
        const properties = (<ObjectASTNode>node).properties;
        properties.forEach((p) => {
          if (!currentProperty || currentProperty !== p) {
            proposed[p.keyNode.value] = CompletionItem.create('__');
          }
        });

        const separatorAfter = '';
        if (newSchema) {
          // property proposals with schema
          this.getPropertyCompletions(
            newSchema,
            currentDoc,
            node,
            addValue,
            separatorAfter,
            collector,
            textBuffer,
            overwriteRange
          );
        }

        if (!schema && currentWord.length > 0 && document.getText().charAt(offset - currentWord.length - 1) !== '"') {
          collector.add({
            kind: CompletionItemKind.Property,
            label: currentWord,
            insertText: this.getInsertTextForProperty(currentWord, null, false, separatorAfter),
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: '',
          });
        }
      }

      // proposals for values
      const types: { [type: string]: boolean } = {};
      if (newSchema) {
        this.getValueCompletions(newSchema, currentDoc, node, offset, document, collector, types);
      }

      return Promise.all(collectionPromises).then(() => {
        return result;
      });
    });
  }

  private getPropertyCompletions(
    schema: ResolvedSchema,
    doc: Parser.JSONDocument,
    node: ObjectASTNode,
    addValue: boolean,
    separatorAfter: string,
    collector: CompletionsCollector,
    textBuffer: TextBuffer,
    overwriteRange: Range
  ): void {
    const matchingSchemas = doc.getMatchingSchemas(schema.schema);
    const existingKey = textBuffer.getText(overwriteRange);
    const hasColumn = textBuffer.getLineContent(overwriteRange.start.line).indexOf(':') === -1;
    matchingSchemas.forEach((s) => {
      if (s.node === node && !s.inverted) {
        this.collectDefaultSnippets(s.schema, separatorAfter, collector, {
          newLineFirst: false,
          indentFirstObject: false,
          shouldIndentWithTab: false,
        });
        const schemaProperties = s.schema.properties;
        if (schemaProperties) {
          const maxProperties = s.schema.maxProperties;
          if (maxProperties === undefined || node.properties === undefined || node.properties.length <= maxProperties) {
            Object.keys(schemaProperties).forEach((key: string) => {
              const propertySchema = schemaProperties[key];
              if (typeof propertySchema === 'object' && !propertySchema.deprecationMessage && !propertySchema['doNotSuggest']) {
                let identCompensation = '';
                if (node.parent && node.parent.type === 'array' && node.properties.length <= 1) {
                  // because there is a slash '-' to prevent the properties generated to have the correct
                  // indent
                  const sourceText = textBuffer.getText();
                  const indexOfSlash = sourceText.lastIndexOf('-', node.offset - 1);
                  if (indexOfSlash >= 0) {
                    // add one space to compensate the '-'
                    identCompensation = ' ' + sourceText.slice(indexOfSlash + 1, node.offset);
                  }
                }

                let insertText = key;
                if (!key.startsWith(existingKey) || hasColumn) {
                  insertText = this.getInsertTextForProperty(
                    key,
                    propertySchema,
                    addValue,
                    separatorAfter,
                    identCompensation + this.indentation
                  );
                }

                collector.add({
                  kind: CompletionItemKind.Property,
                  label: key,
                  insertText,
                  insertTextFormat: InsertTextFormat.Snippet,
                  documentation: super.fromMarkup(propertySchema.markdownDescription) || propertySchema.description || '',
                });
              }
            });
          }
        }
        // Error fix
        // If this is a array of string/boolean/number
        //  test:
        //    - item1
        // it will treated as a property key since `:` has been appended
        if (node.type === 'object' && node.parent && node.parent.type === 'array' && s.schema.type !== 'object') {
          this.addSchemaValueCompletions(s.schema, separatorAfter, collector, {});
        }
      }

      if (node.parent && s.node === node.parent && node.type === 'object' && s.schema.defaultSnippets) {
        // For some reason the first item in the array needs to be treated differently, otherwise
        // the indentation will not be correct
        if (node.properties.length === 1) {
          this.collectDefaultSnippets(
            s.schema,
            separatorAfter,
            collector,
            {
              newLineFirst: false,
              indentFirstObject: false,
              shouldIndentWithTab: true,
            },
            1
          );
        } else {
          this.collectDefaultSnippets(
            s.schema,
            separatorAfter,
            collector,
            {
              newLineFirst: false,
              indentFirstObject: true,
              shouldIndentWithTab: false,
            },
            1
          );
        }
      }
    });
  }

  private getValueCompletions(
    schema: ResolvedSchema,
    doc: Parser.JSONDocument,
    node: ASTNode,
    offset: number,
    document: TextDocument,
    collector: CompletionsCollector,
    types: { [type: string]: boolean }
  ): void {
    let parentKey: string = null;

    if (node && (node.type === 'string' || node.type === 'number' || node.type === 'boolean')) {
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
          if (currNode.keyNode && currNode.keyNode.value === node.location) {
            node = currNode;
          }
        }
      }
    }

    if (!node) {
      this.addSchemaValueCompletions(schema.schema, '', collector, types);
      return;
    }

    if (node.type === 'property' && offset > (<PropertyASTNode>node).colonOffset) {
      const valueNode = node.valueNode;
      if (valueNode && offset > valueNode.offset + valueNode.length) {
        return; // we are past the value node
      }
      parentKey = node.keyNode.value;
      node = node.parent;
    }

    if (node && (parentKey !== null || node.type === 'array')) {
      const separatorAfter = '';
      const matchingSchemas = doc.getMatchingSchemas(schema.schema);
      matchingSchemas.forEach((s) => {
        if (s.node === node && !s.inverted && s.schema) {
          if (s.schema.items) {
            this.collectDefaultSnippets(s.schema, separatorAfter, collector, {
              newLineFirst: false,
              indentFirstObject: false,
              shouldIndentWithTab: false,
            });
            if (Array.isArray(s.schema.items)) {
              const index = super.findItemAtOffset(node, document, offset);
              if (index < s.schema.items.length) {
                this.addSchemaValueCompletions(s.schema.items[index], separatorAfter, collector, types);
              }
            } else if (typeof s.schema.items === 'object' && s.schema.items.type === 'object') {
              collector.add({
                kind: super.getSuggestionKind(s.schema.items.type),
                label: '- (array item)',
                documentation: `Create an item of an array${
                  s.schema.description === undefined ? '' : '(' + s.schema.description + ')'
                }`,
                insertText: `- ${this.getInsertTextForObject(s.schema.items, separatorAfter, '  ').insertText.trimLeft()}`,
                insertTextFormat: InsertTextFormat.Snippet,
              });
              this.addSchemaValueCompletions(s.schema.items, separatorAfter, collector, types);
            } else if (typeof s.schema.items === 'object' && s.schema.items.anyOf) {
              s.schema.items.anyOf
                .filter((i) => typeof i === 'object')
                .forEach((i: JSONSchema, index) => {
                  const insertText = `- ${this.getInsertTextForObject(i, separatorAfter).insertText.trimLeft()}`;
                  //append insertText to documentation
                  const documentation = this.getDocumentationWithMarkdownText(
                    `Create an item of an array${s.schema.description === undefined ? '' : '(' + s.schema.description + ')'}`,
                    insertText
                  );
                  collector.add({
                    kind: super.getSuggestionKind(i.type),
                    label: '- (array item) ' + (index + 1),
                    documentation: documentation,
                    insertText: insertText,
                    insertTextFormat: InsertTextFormat.Snippet,
                  });
                });
              this.addSchemaValueCompletions(s.schema.items, separatorAfter, collector, types);
            } else {
              this.addSchemaValueCompletions(s.schema.items, separatorAfter, collector, types);
            }
          }
          if (s.schema.properties) {
            const propertySchema = s.schema.properties[parentKey];
            if (propertySchema) {
              this.addSchemaValueCompletions(propertySchema, separatorAfter, collector, types);
            }
          }
        }
      });

      if (types['boolean']) {
        this.addBooleanValueCompletion(true, separatorAfter, collector);
        this.addBooleanValueCompletion(false, separatorAfter, collector);
      }
      if (types['null']) {
        this.addNullValueCompletion(separatorAfter, collector);
      }
    }
  }

  private getCustomTagValueCompletions(collector: CompletionsCollector): void {
    const validCustomTags = filterInvalidCustomTags(this.customTags);
    validCustomTags.forEach((validTag) => {
      // Valid custom tags are guarenteed to be strings
      const label = validTag.split(' ')[0];
      this.addCustomTagValueCompletion(collector, ' ', label);
    });
  }

  private addSchemaValueCompletions(
    schema: JSONSchemaRef,
    separatorAfter: string,
    collector: CompletionsCollector,
    types: { [type: string]: boolean }
  ): void {
    super.addSchemaValueCompletions(schema, separatorAfter, collector, types);
  }

  private addDefaultValueCompletions(
    schema: JSONSchema,
    separatorAfter: string,
    collector: CompletionsCollector,
    arrayDepth = 0
  ): void {
    let hasProposals = false;
    if (isDefined(schema.default)) {
      let type = schema.type;
      let value = schema.default;
      for (let i = arrayDepth; i > 0; i--) {
        value = [value];
        type = 'array';
      }
      let label;
      if (typeof value == 'object') {
        label = 'Default value';
      } else {
        label = (value as unknown).toString().replace(doubleQuotesEscapeRegExp, '"');
      }
      collector.add({
        kind: this.getSuggestionKind(type),
        label,
        insertText: this.getInsertTextForValue(value, separatorAfter, type),
        insertTextFormat: InsertTextFormat.Snippet,
        detail: localize('json.suggest.default', 'Default value'),
      });
      hasProposals = true;
    }
    if (Array.isArray(schema.examples)) {
      schema.examples.forEach((example) => {
        let type = schema.type;
        let value = example;
        for (let i = arrayDepth; i > 0; i--) {
          value = [value];
          type = 'array';
        }
        collector.add({
          kind: this.getSuggestionKind(type),
          label: this.getLabelForValue(value),
          insertText: this.getInsertTextForValue(value, separatorAfter, type),
          insertTextFormat: InsertTextFormat.Snippet,
        });
        hasProposals = true;
      });
    }
    this.collectDefaultSnippets(schema, separatorAfter, collector, {
      newLineFirst: true,
      indentFirstObject: true,
      shouldIndentWithTab: true,
    });
    if (!hasProposals && typeof schema.items === 'object' && !Array.isArray(schema.items)) {
      this.addDefaultValueCompletions(schema.items, separatorAfter, collector, arrayDepth + 1);
    }
  }

  private collectDefaultSnippets(
    schema: JSONSchema,
    separatorAfter: string,
    collector: CompletionsCollector,
    settings: StringifySettings,
    arrayDepth = 0
  ): void {
    if (Array.isArray(schema.defaultSnippets)) {
      schema.defaultSnippets.forEach((s) => {
        let type = schema.type;
        let value = s.body;
        let label = s.label;
        let insertText: string;
        let filterText: string;
        if (isDefined(value)) {
          const type = s.type || schema.type;
          if (arrayDepth === 0 && type === 'array') {
            // We know that a - isn't present yet so we need to add one
            const fixedObj = {};
            Object.keys(value).forEach((val, index) => {
              if (index === 0 && !val.startsWith('-')) {
                fixedObj[`- ${val}`] = value[val];
              } else {
                fixedObj[`  ${val}`] = value[val];
              }
            });
            value = fixedObj;
          }
          insertText = this.getInsertTextForSnippetValue(value, separatorAfter, settings);
          label = label || this.getLabelForSnippetValue(value);
        } else if (typeof s.bodyText === 'string') {
          let prefix = '',
            suffix = '',
            indent = '';
          for (let i = arrayDepth; i > 0; i--) {
            prefix = prefix + indent + '[\n';
            suffix = suffix + '\n' + indent + ']';
            indent += this.indentation;
            type = 'array';
          }
          insertText = prefix + indent + s.bodyText.split('\n').join('\n' + indent) + suffix + separatorAfter;
          label = label || insertText;
          filterText = insertText.replace(/[\n]/g, ''); // remove new lines
        }
        collector.add({
          kind: s.suggestionKind || this.getSuggestionKind(type),
          label,
          documentation: super.fromMarkup(s.markdownDescription) || s.description,
          insertText,
          insertTextFormat: InsertTextFormat.Snippet,
          filterText,
        });
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getInsertTextForSnippetValue(value: any, separatorAfter: string, settings: StringifySettings, depth?: number): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const replacer = (value: any): string | any => {
      if (typeof value === 'string') {
        if (value[0] === '^') {
          return value.substr(1);
        }
        if (value === 'true' || value === 'false') {
          return `"${value}"`;
        }
      }
      return value;
    };
    return stringifyObject(value, '', replacer, settings, depth) + separatorAfter;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getLabelForSnippetValue(value: any): string {
    const label = JSON.stringify(value);
    return label.replace(/\$\{\d+:([^}]+)\}|\$\d+/g, '$1');
  }

  private addCustomTagValueCompletion(collector: CompletionsCollector, separatorAfter: string, label: string): void {
    collector.add({
      kind: super.getSuggestionKind('string'),
      label: label,
      insertText: label + separatorAfter,
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: '',
    });
  }

  private addBooleanValueCompletion(value: boolean, separatorAfter: string, collector: CompletionsCollector): void {
    collector.add({
      kind: this.getSuggestionKind('boolean'),
      label: value ? 'true' : 'false',
      insertText: this.getInsertTextForValue(value, separatorAfter, 'boolean'),
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: '',
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getSuggestionKind(type: any): CompletionItemKind {
    if (Array.isArray(type)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const array = <any[]>type;
      type = array.length > 0 ? array[0] : null;
    }
    if (!type) {
      return CompletionItemKind.Value;
    }
    switch (type) {
      case 'string':
        return CompletionItemKind.Value;
      case 'object':
        return CompletionItemKind.Module;
      case 'property':
        return CompletionItemKind.Property;
      default:
        return CompletionItemKind.Value;
    }
  }

  private addNullValueCompletion(separatorAfter: string, collector: CompletionsCollector): void {
    collector.add({
      kind: this.getSuggestionKind('null'),
      label: 'null',
      insertText: 'null' + separatorAfter,
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: '',
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getInsertTextForValue(value: any, separatorAfter: string, type: string | string[]): string {
    if (value === null) {
      value = 'null'; // replace type null with string 'null'
    }
    switch (typeof value) {
      case 'object': {
        const indent = this.indentation;
        return this.getInsertTemplateForValue(value, indent, { index: 1 }, separatorAfter);
      }
    }
    type = Array.isArray(type) ? type[0] : type;
    if (type === 'string') {
      value = convertToStringValue(value);
    }
    return this.getInsertTextForPlainText(value + separatorAfter);
  }

  private getInsertTemplateForValue(
    value: unknown | [],
    indent: string,
    navOrder: { index: number },
    separatorAfter: string
  ): string {
    if (Array.isArray(value)) {
      let insertText = '\n';
      for (const arrValue of value) {
        insertText += `${indent}- \${${navOrder.index++}:${arrValue}}\n`;
      }
      return insertText;
    } else if (typeof value === 'object') {
      let insertText = '\n';
      for (const key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          const element = value[key];
          insertText += `${indent}\${${navOrder.index++}:${key}}:`;
          let valueTemplate;
          if (typeof element === 'object') {
            valueTemplate = `${this.getInsertTemplateForValue(element, indent + this.indentation, navOrder, separatorAfter)}`;
          } else {
            valueTemplate = ` \${${navOrder.index++}:${this.getInsertTextForPlainText(element + separatorAfter)}}\n`;
          }
          insertText += `${valueTemplate}`;
        }
      }
      return insertText;
    }
    return this.getInsertTextForPlainText(value + separatorAfter);
  }

  private getInsertTextForPlainText(text: string): string {
    return text.replace(/[\\$}]/g, '\\$&'); // escape $, \ and }
  }

  private getInsertTextForObject(
    schema: JSONSchema,
    separatorAfter: string,
    indent = this.indentation,
    insertIndex = 1
  ): InsertText {
    let insertText = '';
    if (!schema.properties) {
      insertText = `${indent}$${insertIndex++}\n`;
      return { insertText, insertIndex };
    }

    Object.keys(schema.properties).forEach((key: string) => {
      const propertySchema = schema.properties[key] as JSONSchema;
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
            insertText += `${indent}${key}: $${insertIndex++}\n`;
            break;
          case 'array':
            {
              const arrayInsertResult = this.getInsertTextForArray(propertySchema.items, separatorAfter, insertIndex++);
              const arrayInsertLines = arrayInsertResult.insertText.split('\n');
              let arrayTemplate = arrayInsertResult.insertText;
              if (arrayInsertLines.length > 1) {
                for (let index = 1; index < arrayInsertLines.length; index++) {
                  const element = arrayInsertLines[index];
                  arrayInsertLines[index] = `${indent}${this.indentation}  ${element.trimLeft()}`;
                }
                arrayTemplate = arrayInsertLines.join('\n');
              }
              insertIndex = arrayInsertResult.insertIndex;
              insertText += `${indent}${key}:\n${indent}${this.indentation}- ${arrayTemplate}\n`;
            }
            break;
          case 'object':
            {
              const objectInsertResult = this.getInsertTextForObject(
                propertySchema,
                separatorAfter,
                `${indent}${this.indentation}`,
                insertIndex++
              );
              insertIndex = objectInsertResult.insertIndex;
              insertText += `${indent}${key}:\n${objectInsertResult.insertText}\n`;
            }
            break;
        }
      } else if (propertySchema.default !== undefined) {
        switch (type) {
          case 'boolean':
          case 'number':
          case 'integer':
            insertText += `${indent}${key}: \${${insertIndex++}:${propertySchema.default}}\n`;
            break;
          case 'string':
            insertText += `${indent}${key}: \${${insertIndex++}:${convertToStringValue(propertySchema.default)}}\n`;
            break;
          case 'array':
          case 'object':
            // TODO: support default value for array object
            break;
        }
      }
    });
    if (insertText.trim().length === 0) {
      insertText = `${indent}$${insertIndex++}\n`;
    }
    insertText = insertText.trimRight() + separatorAfter;
    return { insertText, insertIndex };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getInsertTextForArray(schema: any, separatorAfter: string, insertIndex = 1): InsertText {
    let insertText = '';
    if (!schema) {
      insertText = `$${insertIndex++}`;
      return { insertText, insertIndex };
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
        insertText = `\${${insertIndex++}:""}`;
        break;
      case 'object':
        {
          const objectInsertResult = this.getInsertTextForObject(schema, separatorAfter, `${this.indentation}  `, insertIndex++);
          insertText = objectInsertResult.insertText.trimLeft();
          insertIndex = objectInsertResult.insertIndex;
        }
        break;
    }
    return { insertText, insertIndex };
  }

  private getInsertTextForProperty(
    key: string,
    propertySchema: JSONSchema,
    addValue: boolean,
    separatorAfter: string,
    ident = this.indentation
  ): string {
    const propertyText = this.getInsertTextForValue(key, '', 'string');
    const resultText = propertyText + ':';

    let value: string;
    let nValueProposals = 0;
    if (propertySchema) {
      let type = Array.isArray(propertySchema.type) ? propertySchema.type[0] : propertySchema.type;
      if (!type) {
        if (propertySchema.properties) {
          type = 'object';
        } else if (propertySchema.items) {
          type = 'array';
        }
      }
      if (Array.isArray(propertySchema.defaultSnippets)) {
        if (propertySchema.defaultSnippets.length === 1) {
          const body = propertySchema.defaultSnippets[0].body;
          if (isDefined(body)) {
            value = this.getInsertTextForSnippetValue(
              body,
              '',
              {
                newLineFirst: true,
                indentFirstObject: false,
                shouldIndentWithTab: false,
              },
              1
            );
            // add space before default snippet value
            if (!value.startsWith(' ') && !value.startsWith('\n')) {
              value = ' ' + value;
            }
          }
        }
        nValueProposals += propertySchema.defaultSnippets.length;
      }
      if (propertySchema.enum) {
        if (!value && propertySchema.enum.length === 1) {
          value = ' ' + this.getInsertTextForGuessedValue(propertySchema.enum[0], '', type);
        }
        nValueProposals += propertySchema.enum.length;
      }
      if (isDefined(propertySchema.default)) {
        if (!value) {
          value = ' ' + this.getInsertTextForGuessedValue(propertySchema.default, '', type);
        }
        nValueProposals++;
      }
      if (Array.isArray(propertySchema.examples) && propertySchema.examples.length) {
        if (!value) {
          value = ' ' + this.getInsertTextForGuessedValue(propertySchema.examples[0], '', type);
        }
        nValueProposals += propertySchema.examples.length;
      }
      if (propertySchema.properties) {
        return `${resultText}\n${this.getInsertTextForObject(propertySchema, separatorAfter, ident).insertText}`;
      } else if (propertySchema.items) {
        return `${resultText}\n${this.indentation}- ${
          this.getInsertTextForArray(propertySchema.items, separatorAfter).insertText
        }`;
      }
      if (nValueProposals === 0) {
        switch (type) {
          case 'boolean':
            value = ' $1';
            break;
          case 'string':
            value = ' $1';
            break;
          case 'object':
            value = `\n${ident}`;
            break;
          case 'array':
            value = `\n${ident}- `;
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
      value = ' $1';
    }
    return resultText + value + separatorAfter;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getInsertTextForGuessedValue(value: any, separatorAfter: string, type: string): string {
    switch (typeof value) {
      case 'object':
        if (value === null) {
          return '${1:null}' + separatorAfter;
        }
        return this.getInsertTextForValue(value, separatorAfter, type);
      case 'string': {
        let snippetValue = JSON.stringify(value);
        snippetValue = snippetValue.substr(1, snippetValue.length - 2); // remove quotes
        snippetValue = this.getInsertTextForPlainText(snippetValue); // escape \ and }
        if (type === 'string') {
          snippetValue = convertToStringValue(snippetValue);
        }
        return '${1:' + snippetValue + '}' + separatorAfter;
      }
      case 'number':
      case 'boolean':
        return '${1:' + value + '}' + separatorAfter;
    }
    return this.getInsertTextForValue(value, separatorAfter, type);
  }

  private getLabelForValue(value: unknown): string {
    if (value === null) {
      return 'null'; // return string with 'null' value if schema contains null as possible value
    }
    if (Array.isArray(value)) {
      return JSON.stringify(value);
    }
    return value as string;
  }

  /**
   * Corrects simple syntax mistakes to load possible nodes even if a semicolon is missing
   */
  private completionHelper(document: TextDocument, textDocumentPosition: Position): NewTextAndPosition {
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

    // Check if document contains only white spaces and line delimiters
    if (document.getText().trim().length === 0) {
      return {
        // add empty object to be compatible with JSON
        newText: `{${document.getText()}}\n`,
        newPosition: textDocumentPosition,
      };
    }

    // Check if the string we are looking at is a node
    if (textLine.indexOf(':') === -1) {
      // We need to add the ":" to load the nodes
      let newText = '';

      // This is for the empty line case
      const trimmedText = textLine.trim();
      if (trimmedText.length === 0 || (trimmedText.length === 1 && trimmedText[0] === '-')) {
        //same condition as (end < start) - protect of jumping back across lines, when 'holder' is put into incorrect place
        const spaceLength = textLine.includes(' ') ? textLine.length : 0;
        // Add a temp node that is in the document but we don't use at all.
        newText =
          document.getText().substring(0, start + spaceLength) +
          (trimmedText[0] === '-' && !textLine.endsWith(' ') ? ' ' : '') +
          'holder:\r\n' +
          document.getText().substr(lineOffset[linePos + 1] || document.getText().length);

        // For when missing semi colon case
      } else if (trimmedText.indexOf('[') === -1) {
        // Add a semicolon to the end of the current line so we can validate the node
        newText =
          document.getText().substring(0, start + textLine.length) +
          ':\r\n' +
          document.getText().substr(lineOffset[linePos + 1] || document.getText().length);
      }

      if (newText.length === 0) {
        newText = document.getText();
      }

      return {
        newText: newText,
        newPosition: textDocumentPosition,
      };
    } else {
      // All the nodes are loaded
      position.character = position.character - 1;

      return {
        newText: document.getText(),
        newPosition: position,
      };
    }
  }

  private is_EOL(c: number): boolean {
    return c === 0x0a /* LF */ || c === 0x0d /* CR */;
  }

  private getDocumentationWithMarkdownText(documentation: string, insertText: string): string | MarkupContent {
    let res: string | MarkupContent = documentation;
    if (super.doesSupportMarkdown()) {
      insertText = insertText
        .replace(/\${[0-9]+[:|](.*)}/g, (s, arg) => {
          return arg;
        })
        .replace(/\$([0-9]+)/g, '');
      res = super.fromMarkup(`${documentation}\n \`\`\`\n${insertText}\n\`\`\``) as MarkupContent;
    }
    return res;
  }
}

const isNumberExp = /^\d+$/;
function convertToStringValue(value: string): string {
  if (value === 'true' || value === 'false' || value === 'null' || isNumberExp.test(value)) {
    return `"${value}"`;
  }

  // eslint-disable-next-line prettier/prettier, no-useless-escape
  if (value.indexOf('\"') !== -1) {
    value = value.replace(doubleQuotesEscapeRegExp, '"');
  }

  if ((value.length > 0 && value.charAt(0) === '@') || value.includes(':')) {
    value = `"${value}"`;
  }

  return value;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
function isDefined(val: any): val is object {
  return val !== undefined;
}

interface InsertText {
  insertText: string;
  insertIndex: number;
}

interface NewTextAndPosition {
  newText: string;
  newPosition: Position;
}
