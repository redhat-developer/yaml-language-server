/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  ClientCapabilities,
  CompletionItem,
  CompletionItemKind,
  CompletionList,
  InsertTextFormat,
  MarkupContent,
  MarkupKind,
  Position,
  Range,
  TextEdit,
} from 'vscode-languageserver/node';
import { Node, isPair, isScalar, isMap, YAMLMap, isSeq, YAMLSeq, isNode } from 'yaml';
import { Telemetry } from '../../languageserver/telemetry';
import { SingleYAMLDocument, YamlDocuments } from '../parser/yaml-documents';
import { YamlVersion } from '../parser/yamlParser07';
import { filterInvalidCustomTags, matchOffsetToDocument } from '../utils/arrUtils';
import { guessIndentation } from '../utils/indentationGuesser';
import { TextBuffer } from '../utils/textBuffer';
import { LanguageSettings } from '../yamlLanguageService';
import { YAMLSchemaService } from './yamlSchemaService';
import { ResolvedSchema } from 'vscode-json-languageservice/lib/umd/services/jsonSchemaService';
import { JSONSchema, JSONSchemaRef } from '../jsonSchema';
import { stringifyObject, StringifySettings } from '../utils/json';
import { isDefined, isString } from '../utils/objects';
import * as nls from 'vscode-nls';
import { setKubernetesParserOption } from '../parser/isKubernetes';

const localize = nls.loadMessageBundle();

const doubleQuotesEscapeRegExp = /[\\]+"/g;

interface CompletionsCollector {
  add(suggestion: CompletionItem): void;
  error(message: string): void;
  log(message: string): void;
  getNumberOfProposals(): number;
}

interface InsertText {
  insertText: string;
  insertIndex: number;
}

export class YamlCompletion {
  private customTags: string[];
  private completionEnabled = true;
  private configuredIndentation: string | undefined;
  private yamlVersion: YamlVersion;
  private indentation: string;
  private supportsMarkdown: boolean | undefined;

  constructor(
    private schemaService: YAMLSchemaService,
    private clientCapabilities: ClientCapabilities = {},
    private yamlDocument: YamlDocuments,
    private readonly telemetry: Telemetry
  ) {}

  configure(languageSettings: LanguageSettings): void {
    if (languageSettings) {
      this.completionEnabled = languageSettings.completion;
    }
    this.customTags = languageSettings.customTags;
    this.yamlVersion = languageSettings.yamlVersion;
    this.configuredIndentation = languageSettings.indentation;
  }

  async doComplete(document: TextDocument, position: Position, isKubernetes = false): Promise<CompletionList> {
    const result = CompletionList.create([], false);
    if (!this.completionEnabled) {
      return result;
    }
    const doc = this.yamlDocument.getYamlDocument(document, { customTags: this.customTags, yamlVersion: this.yamlVersion }, true);
    const textBuffer = new TextBuffer(document);

    if (!this.configuredIndentation) {
      const indent = guessIndentation(textBuffer, 2, true);
      this.indentation = indent.insertSpaces ? ' '.repeat(indent.tabSize) : '\t';
    } else {
      this.indentation = this.configuredIndentation;
    }

    setKubernetesParserOption(doc.documents, isKubernetes);

    const offset = document.offsetAt(position);

    if (document.getText().charAt(offset - 1) === ':') {
      return Promise.resolve(result);
    }

    const currentDoc = matchOffsetToDocument(offset, doc);
    if (currentDoc === null) {
      return Promise.resolve(result);
    }

    let node = currentDoc.getNodeFromPosition(offset);

    const currentWord = this.getCurrentWord(document, offset);

    let overwriteRange = null;
    if (node && isScalar(node) && node.value === 'null') {
      const nodeStartPos = document.positionAt(node.range[0]);
      nodeStartPos.character += 1;
      const nodeEndPos = document.positionAt(node.range[2]);
      nodeEndPos.character += 1;
      overwriteRange = Range.create(nodeStartPos, nodeEndPos);
    } else if (node && isScalar(node)) {
      const start = document.positionAt(node.range[0]);
      if (offset > 0 && document.getText().charAt(offset - 1) === '-') {
        start.character -= 1;
      }
      overwriteRange = Range.create(start, document.positionAt(node.range[1]));
    } else {
      let overwriteStart = document.offsetAt(position) - currentWord.length;
      if (overwriteStart > 0 && document.getText()[overwriteStart - 1] === '"') {
        overwriteStart--;
      }
      overwriteRange = Range.create(document.positionAt(overwriteStart), position);
    }

    const proposed: { [key: string]: CompletionItem } = {};
    const collector: CompletionsCollector = {
      add: (completionItem: CompletionItem) => {
        let label = completionItem.label;
        if (!label) {
          // we receive not valid CompletionItem as `label` is mandatory field, so just ignore it
          console.warn(`Ignoring CompletionItem without label: ${JSON.stringify(completionItem)}`);
          return;
        }
        if (!isString(label)) {
          label = String(label);
        }
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
            completionItem.textEdit = TextEdit.replace(overwriteRange, completionItem.insertText);
          }
          completionItem.label = label;
          proposed[label] = completionItem;
          result.items.push(completionItem);
        }
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

    try {
      const schema = await this.schemaService.getSchemaForResource(document.uri, currentDoc);
      if (!schema || schema.errors.length) {
        return result;
      }

      let currentProperty: Node = null;
      let foundByClosest = false;
      if (!node) {
        if (!currentDoc.internalDocument.contents || isScalar(currentDoc.internalDocument.contents)) {
          const map = currentDoc.internalDocument.createNode({});
          map.range = [offset, offset + 1, offset + 1];
          currentDoc.internalDocument.contents = map;
          node = map;
        } else {
          node = currentDoc.findClosestNode(offset, textBuffer);
          foundByClosest = true;
        }
      }

      let lineContent = textBuffer.getLineContent(position.line);
      if (lineContent.endsWith('\n')) {
        lineContent = lineContent.substr(0, lineContent.length - 1);
      }
      if (node) {
        if (lineContent.length === 0) {
          node = currentDoc.internalDocument.contents as Node;
        } else {
          const parent = currentDoc.getParent(node);
          if (parent) {
            if (isScalar(node)) {
              if (node.value) {
                if (isPair(parent)) {
                  if (parent.value === node) {
                    if (lineContent.trim().length > 0 && lineContent.indexOf(':') < 0) {
                      const map = this.createTempObjNode(currentWord, node, currentDoc);
                      currentDoc.internalDocument.set(parent.key, map);
                      currentProperty = (map as YAMLMap).items[0];
                      node = map;
                    } else if (lineContent.trim().length === 0) {
                      const parentParent = currentDoc.getParent(parent);
                      if (parentParent) {
                        node = parentParent;
                      }
                    }
                  } else if (parent.key === node) {
                    const parentParent = currentDoc.getParent(parent);
                    currentProperty = parent;
                    if (parentParent) {
                      node = parentParent;
                    }
                  }
                } else if (isSeq(parent)) {
                  if (lineContent.trim().length > 0) {
                    const map = this.createTempObjNode(currentWord, node, currentDoc);
                    parent.delete(node);
                    parent.add(map);
                    node = map;
                  } else {
                    node = parent;
                  }
                }
              } else if (node.value === null) {
                if (isPair(parent) && parent.key === node) {
                  node = parent;
                } else if (
                  isPair(parent) &&
                  lineContent.trim().length === 0 &&
                  textBuffer.getLineContent(position.line - 1).indexOf(':') > 0 &&
                  textBuffer.getLineContent(position.line - 1).indexOf('-') < 0
                ) {
                  const map = this.createTempObjNode(currentWord, node, currentDoc);

                  const parentParent = currentDoc.getParent(parent);
                  if (parentParent && (isMap(parentParent) || isSeq(parentParent))) {
                    parentParent.set(parent.key, map);
                  } else {
                    currentDoc.internalDocument.set(parent.key, map);
                  }
                  currentProperty = (map as YAMLMap).items[0];
                  node = map;
                } else if (lineContent.trim().length === 0) {
                  const parentParent = currentDoc.getParent(parent);
                  if (parentParent) {
                    node = parentParent;
                  }
                } else if (isSeq(parent)) {
                  if (lineContent.charAt(position.character - 1) !== '-') {
                    const map = this.createTempObjNode(currentWord, node, currentDoc);
                    parent.delete(node);
                    parent.add(map);
                    node = map;
                  } else {
                    node = parent;
                  }
                }
              }
            } else if (isMap(node)) {
              if (!foundByClosest && lineContent.trim().length === 0 && isSeq(parent)) {
                node = parent;
              }
            }
          } else if (isScalar(node)) {
            const map = this.createTempObjNode(currentWord, node, currentDoc);
            currentDoc.internalDocument.contents = map;
            currentProperty = map.items[0];
            node = map;
          } else if (isMap(node)) {
            for (const pair of node.items) {
              if (isNode(pair.value) && pair.value.range && pair.value.range[0] === offset + 1) {
                node = pair.value;
              }
            }
          }
        }
      }

      // completion for object keys
      if (node && isMap(node)) {
        // don't suggest properties that are already present
        const properties = node.items;
        for (const p of properties) {
          if (!currentProperty || currentProperty !== p) {
            if (isScalar(p.key)) {
              proposed[p.key.value.toString()] = CompletionItem.create('__');
            }
          }
        }

        this.addPropertyCompletions(schema, currentDoc, node, '', collector, textBuffer, overwriteRange);

        if (!schema && currentWord.length > 0 && document.getText().charAt(offset - currentWord.length - 1) !== '"') {
          collector.add({
            kind: CompletionItemKind.Property,
            label: currentWord,
            insertText: this.getInsertTextForProperty(currentWord, null, ''),
            insertTextFormat: InsertTextFormat.Snippet,
          });
        }
      }

      // proposals for values
      const types: { [type: string]: boolean } = {};
      this.getValueCompletions(schema, currentDoc, node, offset, document, collector, types);
    } catch (err) {
      if (err.stack) {
        console.error(err.stack);
      } else {
        console.error(err);
      }
      this.telemetry.sendError('yaml.completion.error', { error: err });
    }

    return result;
  }

  private createTempObjNode(currentWord: string, node: Node, currentDoc: SingleYAMLDocument): YAMLMap {
    const obj = {};
    obj[currentWord] = null;
    const map: YAMLMap = currentDoc.internalDocument.createNode(obj) as YAMLMap;
    map.range = node.range;
    (map.items[0].key as Node).range = node.range;
    (map.items[0].value as Node).range = node.range;
    return map;
  }

  private addPropertyCompletions(
    schema: ResolvedSchema,
    doc: SingleYAMLDocument,
    node: YAMLMap,
    separatorAfter: string,
    collector: CompletionsCollector,
    textBuffer: TextBuffer,
    overwriteRange: Range
  ): void {
    const matchingSchemas = doc.matchSchemas(schema.schema);
    const existingKey = textBuffer.getText(overwriteRange);
    const hasColumn = textBuffer.getLineContent(overwriteRange.start.line).indexOf(':') === -1;

    const nodeParent = doc.getParent(node);
    for (const schema of matchingSchemas) {
      if (schema.node === node && !schema.inverted) {
        this.collectDefaultSnippets(schema.schema, separatorAfter, collector, {
          newLineFirst: false,
          indentFirstObject: false,
          shouldIndentWithTab: false,
        });

        const schemaProperties = schema.schema.properties;
        if (schemaProperties) {
          const maxProperties = schema.schema.maxProperties;
          if (maxProperties === undefined || node.items === undefined || node.items.length < maxProperties) {
            for (const key in schemaProperties) {
              if (Object.prototype.hasOwnProperty.call(schemaProperties, key)) {
                const propertySchema = schemaProperties[key];

                if (typeof propertySchema === 'object' && !propertySchema.deprecationMessage && !propertySchema['doNotSuggest']) {
                  let identCompensation = '';
                  if (nodeParent && isSeq(nodeParent) && node.items.length <= 1) {
                    // because there is a slash '-' to prevent the properties generated to have the correct
                    // indent
                    const sourceText = textBuffer.getText();
                    const indexOfSlash = sourceText.lastIndexOf('-', node.range[0] - 1);
                    if (indexOfSlash >= 0) {
                      // add one space to compensate the '-'
                      identCompensation = ' ' + sourceText.slice(indexOfSlash + 1, node.range[0]);
                    }
                  }

                  let insertText = key;
                  if (!key.startsWith(existingKey) || hasColumn) {
                    insertText = this.getInsertTextForProperty(
                      key,
                      propertySchema,
                      separatorAfter,
                      identCompensation + this.indentation
                    );
                  }

                  collector.add({
                    kind: CompletionItemKind.Property,
                    label: key,
                    insertText,
                    insertTextFormat: InsertTextFormat.Snippet,
                    documentation: this.fromMarkup(propertySchema.markdownDescription) || propertySchema.description || '',
                  });
                }
              }
            }
          }
        }
        // Error fix
        // If this is a array of string/boolean/number
        //  test:
        //    - item1
        // it will treated as a property key since `:` has been appended
        if (nodeParent && isSeq(nodeParent) && schema.schema.type !== 'object') {
          this.addSchemaValueCompletions(schema.schema, separatorAfter, collector, {});
        }
      }

      if (nodeParent && schema.node === nodeParent && schema.schema.defaultSnippets) {
        // For some reason the first item in the array needs to be treated differently, otherwise
        // the indentation will not be correct
        if (node.items.length === 1) {
          this.collectDefaultSnippets(
            schema.schema,
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
            schema.schema,
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
    }
  }

  private getValueCompletions(
    schema: ResolvedSchema,
    doc: SingleYAMLDocument,
    node: Node,
    offset: number,
    document: TextDocument,
    collector: CompletionsCollector,
    types: { [type: string]: boolean }
  ): void {
    let parentKey: string = null;

    if (node && isScalar(node)) {
      node = doc.getParent(node);
    }

    if (!node) {
      this.addSchemaValueCompletions(schema.schema, '', collector, types);
      return;
    }

    if (isPair(node)) {
      const valueNode: Node = node.value as Node;
      if (valueNode && offset > valueNode.range[0] + valueNode.range[2]) {
        return; // we are past the value node
      }
      parentKey = isScalar(node.key) ? node.key.value.toString() : null;
      node = doc.getParent(node);
    }

    if (node && (parentKey !== null || isSeq(node))) {
      const separatorAfter = '';
      const matchingSchemas = doc.matchSchemas(schema.schema);
      for (const s of matchingSchemas) {
        if (s.node === node && !s.inverted && s.schema) {
          if (s.schema.items) {
            this.collectDefaultSnippets(s.schema, separatorAfter, collector, {
              newLineFirst: false,
              indentFirstObject: false,
              shouldIndentWithTab: false,
            });
            if (isSeq(node) && node.items) {
              if (Array.isArray(s.schema.items)) {
                const index = this.findItemAtOffset(node, document, offset);
                if (index < s.schema.items.length) {
                  this.addSchemaValueCompletions(s.schema.items[index], separatorAfter, collector, types);
                }
              } else if (typeof s.schema.items === 'object' && s.schema.items.type === 'object') {
                collector.add({
                  kind: this.getSuggestionKind(s.schema.items.type),
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
                      kind: this.getSuggestionKind(i.type),
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
          }
          if (s.schema.properties) {
            const propertySchema = s.schema.properties[parentKey];
            if (propertySchema) {
              this.addSchemaValueCompletions(propertySchema, separatorAfter, collector, types);
            }
          }
        }
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

  private getInsertTextForProperty(
    key: string,
    propertySchema: JSONSchema,
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

  private getInsertTextForPlainText(text: string): string {
    return text.replace(/[\\$}]/g, '\\$&'); // escape $, \ and }
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

  private addSchemaValueCompletions(
    schema: JSONSchemaRef,
    separatorAfter: string,
    collector: CompletionsCollector,
    types: unknown
  ): void {
    if (typeof schema === 'object') {
      this.addEnumValueCompletions(schema, separatorAfter, collector);
      this.addDefaultValueCompletions(schema, separatorAfter, collector);
      this.collectTypes(schema, types);
      if (Array.isArray(schema.allOf)) {
        schema.allOf.forEach((s) => {
          return this.addSchemaValueCompletions(s, separatorAfter, collector, types);
        });
      }
      if (Array.isArray(schema.anyOf)) {
        schema.anyOf.forEach((s) => {
          return this.addSchemaValueCompletions(s, separatorAfter, collector, types);
        });
      }
      if (Array.isArray(schema.oneOf)) {
        schema.oneOf.forEach((s) => {
          return this.addSchemaValueCompletions(s, separatorAfter, collector, types);
        });
      }
    }
  }

  private collectTypes(schema: JSONSchema, types: unknown): void {
    if (Array.isArray(schema.enum) || isDefined(schema.const)) {
      return;
    }
    const type = schema.type;
    if (Array.isArray(type)) {
      type.forEach(function (t) {
        return (types[t] = true);
      });
    } else if (type) {
      types[type] = true;
    }
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

  private addEnumValueCompletions(schema: JSONSchema, separatorAfter: string, collector: CompletionsCollector): void {
    if (isDefined(schema.const)) {
      collector.add({
        kind: this.getSuggestionKind(schema.type),
        label: this.getLabelForValue(schema.const),
        insertText: this.getInsertTextForValue(schema.const, separatorAfter, undefined),
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: this.fromMarkup(schema.markdownDescription) || schema.description,
      });
    }
    if (Array.isArray(schema.enum)) {
      for (let i = 0, length = schema.enum.length; i < length; i++) {
        const enm = schema.enum[i];
        let documentation = this.fromMarkup(schema.markdownDescription) || schema.description;
        if (schema.markdownEnumDescriptions && i < schema.markdownEnumDescriptions.length && this.doesSupportMarkdown()) {
          documentation = this.fromMarkup(schema.markdownEnumDescriptions[i]);
        } else if (schema.enumDescriptions && i < schema.enumDescriptions.length) {
          documentation = schema.enumDescriptions[i];
        }
        collector.add({
          kind: this.getSuggestionKind(schema.type),
          label: this.getLabelForValue(enm),
          insertText: this.getInsertTextForValue(enm, separatorAfter, undefined),
          insertTextFormat: InsertTextFormat.Snippet,
          documentation: documentation,
        });
      }
    }
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

  private collectDefaultSnippets(
    schema: JSONSchema,
    separatorAfter: string,
    collector: CompletionsCollector,
    settings: StringifySettings,
    arrayDepth = 0
  ): void {
    if (Array.isArray(schema.defaultSnippets)) {
      for (const s of schema.defaultSnippets) {
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
          documentation: this.fromMarkup(s.markdownDescription) || s.description,
          insertText,
          insertTextFormat: InsertTextFormat.Snippet,
          filterText,
        });
      }
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

  private addBooleanValueCompletion(value: boolean, separatorAfter: string, collector: CompletionsCollector): void {
    collector.add({
      kind: this.getSuggestionKind('boolean'),
      label: value ? 'true' : 'false',
      insertText: this.getInsertTextForValue(value, separatorAfter, 'boolean'),
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: '',
    });
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
  private getLabelForSnippetValue(value: any): string {
    const label = JSON.stringify(value);
    return label.replace(/\$\{\d+:([^}]+)\}|\$\d+/g, '$1');
  }

  private getCustomTagValueCompletions(collector: CompletionsCollector): void {
    const validCustomTags = filterInvalidCustomTags(this.customTags);
    validCustomTags.forEach((validTag) => {
      // Valid custom tags are guarenteed to be strings
      const label = validTag.split(' ')[0];
      this.addCustomTagValueCompletion(collector, ' ', label);
    });
  }

  private addCustomTagValueCompletion(collector: CompletionsCollector, separatorAfter: string, label: string): void {
    collector.add({
      kind: this.getSuggestionKind('string'),
      label: label,
      insertText: label + separatorAfter,
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: '',
    });
  }

  private getDocumentationWithMarkdownText(documentation: string, insertText: string): string | MarkupContent {
    let res: string | MarkupContent = documentation;
    if (this.doesSupportMarkdown()) {
      insertText = insertText
        .replace(/\${[0-9]+[:|](.*)}/g, (s, arg) => {
          return arg;
        })
        .replace(/\$([0-9]+)/g, '');
      res = this.fromMarkup(`${documentation}\n \`\`\`\n${insertText}\n\`\`\``) as MarkupContent;
    }
    return res;
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

  private getCurrentWord(doc: TextDocument, offset: number): string {
    let i = offset - 1;
    const text = doc.getText();
    while (i >= 0 && ' \t\n\r\v":{[,]}'.indexOf(text.charAt(i)) === -1) {
      i--;
    }
    return text.substring(i + 1, offset);
  }

  private fromMarkup(markupString: string): MarkupContent | undefined {
    if (markupString && this.doesSupportMarkdown()) {
      return {
        kind: MarkupKind.Markdown,
        value: markupString,
      };
    }
    return undefined;
  }

  private doesSupportMarkdown(): boolean {
    if (this.supportsMarkdown === undefined) {
      const completion = this.clientCapabilities.textDocument && this.clientCapabilities.textDocument.completion;
      this.supportsMarkdown =
        completion &&
        completion.completionItem &&
        Array.isArray(completion.completionItem.documentationFormat) &&
        completion.completionItem.documentationFormat.indexOf(MarkupKind.Markdown) !== -1;
    }
    return this.supportsMarkdown;
  }

  private findItemAtOffset(seqNode: YAMLSeq, doc: TextDocument, offset: number): number {
    for (let i = seqNode.items.length - 1; i >= 0; i--) {
      const node = seqNode.items[i];
      if (isNode(node)) {
        if (node.range) {
          if (offset > node.range[1]) {
            return i;
          } else if (offset >= node.range[0]) {
            return i;
          }
        }
      }
    }

    return 0;
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
