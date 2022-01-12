/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  ClientCapabilities,
  CompletionItem as CompletionItemBase,
  CompletionItemKind,
  CompletionList,
  InsertTextFormat,
  InsertTextMode,
  MarkupContent,
  MarkupKind,
  Position,
  Range,
  TextEdit,
} from 'vscode-languageserver/node';
import { Node, isPair, isScalar, isMap, YAMLMap, isSeq, YAMLSeq, isNode, Pair } from 'yaml';
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
import { convertErrorToTelemetryMsg, isDefined, isString } from '../utils/objects';
import * as nls from 'vscode-nls';
import { setKubernetesParserOption } from '../parser/isKubernetes';
import { isInComment, isMapContainsEmptyPair } from '../utils/astUtils';
import { indexOf } from '../utils/astUtils';
import { isModeline } from './modelineUtil';
import { getSchemaTypeName } from '../utils/schemaUtils';

const localize = nls.loadMessageBundle();

const doubleQuotesEscapeRegExp = /[\\]+"/g;

const parentCompletionKind = CompletionItemKind.Class;

interface ParentCompletionItemOptions {
  schemaType: string;
  indent?: string;
  insertTexts?: string[];
}

interface CompletionItem extends CompletionItemBase {
  parent?: ParentCompletionItemOptions;
}
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
  private disableDefaultProperties: boolean;

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
    this.disableDefaultProperties = languageSettings.disableDefaultProperties;
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

    let [node, foundByClosest] = currentDoc.getNodeFromPosition(offset, textBuffer);

    const currentWord = this.getCurrentWord(document, offset);

    let overwriteRange = null;
    if (node && isScalar(node) && node.value === 'null') {
      const nodeStartPos = document.positionAt(node.range[0]);
      nodeStartPos.character += 1;
      const nodeEndPos = document.positionAt(node.range[2]);
      nodeEndPos.character += 1;
      overwriteRange = Range.create(nodeStartPos, nodeEndPos);
    } else if (node && isScalar(node) && node.value) {
      const start = document.positionAt(node.range[0]);
      if (offset > 0 && start.character > 0 && document.getText().charAt(offset - 1) === '-') {
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
    const existingProposeItem = '__';
    const collector: CompletionsCollector = {
      add: (completionItem: CompletionItem) => {
        const addSuggestionForParent = function (completionItem: CompletionItem): void {
          const existsInYaml = proposed[completionItem.label]?.label === existingProposeItem;
          //don't put to parent suggestion if already in yaml
          if (existsInYaml) {
            return;
          }

          const schemaType = completionItem.parent.schemaType;
          let parentCompletion: CompletionItem | undefined = result.items.find(
            (item) => item.label === schemaType && item.kind === parentCompletionKind
          );

          if (parentCompletion && parentCompletion.parent.insertTexts.includes(completionItem.insertText)) {
            // already exists in the parent
            return;
          } else if (!parentCompletion) {
            // create a new parent
            parentCompletion = {
              ...completionItem,
              label: schemaType,
              sortText: '_' + schemaType, // this parent completion goes first,
              kind: parentCompletionKind,
            };
            parentCompletion.parent.insertTexts = [completionItem.insertText];
            result.items.push(parentCompletion);
          } else {
            // add to the existing parent
            parentCompletion.parent.insertTexts.push(completionItem.insertText);
          }
        };

        const isForParentCompletion = !!completionItem.parent;
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
        if (!existing || isForParentCompletion) {
          label = label.replace(/[\n]/g, '↵');
          if (label.length > 60) {
            const shortendedLabel = label.substr(0, 57).trim() + '...';
            if (!proposed[shortendedLabel]) {
              label = shortendedLabel;
            }
          }

          // trim $1 from end of completion
          if (completionItem.insertText.endsWith('$1') && !isForParentCompletion) {
            completionItem.insertText = completionItem.insertText.substr(0, completionItem.insertText.length - 2);
          }
          if (overwriteRange && overwriteRange.start.line === overwriteRange.end.line) {
            completionItem.textEdit = TextEdit.replace(overwriteRange, completionItem.insertText);
          }

          completionItem.label = label;

          if (isForParentCompletion) {
            addSuggestionForParent(completionItem);
          }

          if (!existing) {
            proposed[label] = completionItem;
            result.items.push(completionItem);
          }
        } else if (!existing.documentation && completionItem.documentation) {
          existing.documentation = completionItem.documentation;
        }
      },
      error: (message: string) => {
        this.telemetry.sendError('yaml.completion.error', { error: convertErrorToTelemetryMsg(message) });
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

    let lineContent = textBuffer.getLineContent(position.line);
    if (lineContent.endsWith('\n')) {
      lineContent = lineContent.substr(0, lineContent.length - 1);
    }

    try {
      const schema = await this.schemaService.getSchemaForResource(document.uri, currentDoc);

      if (!schema || schema.errors.length) {
        if (position.line === 0 && position.character === 0 && !isModeline(lineContent)) {
          const inlineSchemaCompletion = {
            kind: CompletionItemKind.Text,
            label: 'Inline schema',
            insertText: '# yaml-language-server: $schema=',
            insertTextFormat: InsertTextFormat.PlainText,
          };
          result.items.push(inlineSchemaCompletion);
        }
      }

      if (isModeline(lineContent) || isInComment(doc.tokens, offset)) {
        const schemaIndex = lineContent.indexOf('$schema=');
        if (schemaIndex !== -1 && schemaIndex + '$schema='.length <= position.character) {
          this.schemaService.getAllSchemas().forEach((schema) => {
            const schemaIdCompletion: CompletionItem = {
              kind: CompletionItemKind.Constant,
              label: schema.name ?? schema.uri,
              detail: schema.description,
              insertText: schema.uri,
              insertTextFormat: InsertTextFormat.PlainText,
              insertTextMode: InsertTextMode.asIs,
            };
            result.items.push(schemaIdCompletion);
          });
        }
        return result;
      }

      if (!schema || schema.errors.length) {
        return result;
      }

      let currentProperty: Node = null;

      if (!node) {
        if (!currentDoc.internalDocument.contents || isScalar(currentDoc.internalDocument.contents)) {
          const map = currentDoc.internalDocument.createNode({});
          map.range = [offset, offset + 1, offset + 1];
          currentDoc.internalDocument.contents = map;
          // eslint-disable-next-line no-self-assign
          currentDoc.internalDocument = currentDoc.internalDocument;
          node = map;
        } else {
          node = currentDoc.findClosestNode(offset, textBuffer);
          foundByClosest = true;
        }
      }

      const originalNode = node;
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
                      if (isSeq(currentDoc.internalDocument.contents)) {
                        const index = indexOf(currentDoc.internalDocument.contents, parent);
                        if (typeof index === 'number') {
                          currentDoc.internalDocument.set(index, map);
                          // eslint-disable-next-line no-self-assign
                          currentDoc.internalDocument = currentDoc.internalDocument;
                        }
                      } else {
                        currentDoc.internalDocument.set(parent.key, map);
                        // eslint-disable-next-line no-self-assign
                        currentDoc.internalDocument = currentDoc.internalDocument;
                      }

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
                    // eslint-disable-next-line no-self-assign
                    currentDoc.internalDocument = currentDoc.internalDocument;
                    node = map;
                  } else {
                    node = parent;
                  }
                }
              } else if (node.value === null) {
                if (isPair(parent)) {
                  if (parent.key === node) {
                    node = parent;
                  } else {
                    if (isNode(parent.key) && parent.key.range) {
                      const parentParent = currentDoc.getParent(parent);
                      if (foundByClosest && parentParent && isMap(parentParent) && isMapContainsEmptyPair(parentParent)) {
                        node = parentParent;
                      } else {
                        const parentPosition = document.positionAt(parent.key.range[0]);
                        //if cursor has bigger indentation that parent key, then we need to complete new empty object
                        if (position.character > parentPosition.character && position.line !== parentPosition.line) {
                          const map = this.createTempObjNode(currentWord, node, currentDoc);

                          if (parentParent && (isMap(parentParent) || isSeq(parentParent))) {
                            parentParent.set(parent.key, map);
                            // eslint-disable-next-line no-self-assign
                            currentDoc.internalDocument = currentDoc.internalDocument;
                          } else {
                            currentDoc.internalDocument.set(parent.key, map);
                            // eslint-disable-next-line no-self-assign
                            currentDoc.internalDocument = currentDoc.internalDocument;
                          }
                          currentProperty = (map as YAMLMap).items[0];
                          node = map;
                        } else if (parentPosition.character === position.character) {
                          if (parentParent) {
                            node = parentParent;
                          }
                        }
                      }
                    }
                  }
                } else if (isSeq(parent)) {
                  if (lineContent.charAt(position.character - 1) !== '-') {
                    const map = this.createTempObjNode(currentWord, node, currentDoc);
                    parent.delete(node);
                    parent.add(map);
                    // eslint-disable-next-line no-self-assign
                    currentDoc.internalDocument = currentDoc.internalDocument;
                    node = map;
                  } else {
                    node = parent;
                  }
                }
              }
            } else if (isMap(node)) {
              if (!foundByClosest && lineContent.trim().length === 0 && isSeq(parent)) {
                const nextLine = textBuffer.getLineContent(position.line + 1);
                if (textBuffer.getLineCount() === position.line + 1 || nextLine.trim().length === 0) {
                  node = parent;
                }
              }
            }
          } else if (isScalar(node)) {
            const map = this.createTempObjNode(currentWord, node, currentDoc);
            currentDoc.internalDocument.contents = map;
            // eslint-disable-next-line no-self-assign
            currentDoc.internalDocument = currentDoc.internalDocument;
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
              proposed[p.key.value.toString()] = CompletionItemBase.create(existingProposeItem);
            }
          }
        }

        this.addPropertyCompletions(schema, currentDoc, node, originalNode, '', collector, textBuffer, overwriteRange);

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
      this.telemetry.sendError('yaml.completion.error', { error: convertErrorToTelemetryMsg(err) });
    }

    this.finalizeParentCompletion(result);

    return result;
  }

  private finalizeParentCompletion(result: CompletionList): void {
    const reindexText = (insertTexts: string[]): string[] => {
      //modify added props to have unique $x
      let max$index = 0;
      return insertTexts.map((text) => {
        const match = text.match(/\$([0-9]+)|\${[0-9]+:/g);
        if (!match) {
          return text;
        }
        const max$indexLocal = match
          .map((m) => +m.replace(/\${([0-9]+)[:|]/g, '$1').replace('$', '')) // get numbers form $1 or ${1:...}
          .reduce((p, n) => (n > p ? n : p), 0); // find the max one
        const reindexedStr = text
          .replace(/\$([0-9]+)/g, (s, args) => '$' + (+args + max$index)) // increment each by max$index
          .replace(/\${([0-9]+)[:|]/g, (s, args) => '${' + (+args + max$index) + ':'); // increment each by max$index
        max$index += max$indexLocal;
        return reindexedStr;
      });
    };

    result.items.forEach((completionItem) => {
      if (isParentCompletionItem(completionItem)) {
        const indent = completionItem.parent.indent || '';

        const reindexedTexts = reindexText(completionItem.parent.insertTexts);

        // add indent to each object property and join completion item texts
        let insertText = reindexedTexts.join(`\n${indent}`);

        // trim $1 from end of completion
        if (insertText.endsWith('$1')) {
          insertText = insertText.substring(0, insertText.length - 2);
        }

        completionItem.insertText = insertText;
        if (completionItem.textEdit) {
          completionItem.textEdit.newText = insertText;
        }
        // remove $x or use {$x:value} in documentation
        const mdText = insertText.replace(/\${[0-9]+[:|](.*)}/g, (s, arg) => arg).replace(/\$([0-9]+)/g, '');

        const originalDocumentation = completionItem.documentation ? [completionItem.documentation, '', '----', ''] : [];
        completionItem.documentation = {
          kind: MarkupKind.Markdown,
          value: [...originalDocumentation, '```yaml', indent + mdText, '```'].join('\n'),
        };
        delete completionItem.parent;
      }
    });
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
    originalNode: Node,
    separatorAfter: string,
    collector: CompletionsCollector,
    textBuffer: TextBuffer,
    overwriteRange: Range
  ): void {
    const matchingSchemas = doc.getMatchingSchemas(schema.schema);
    const existingKey = textBuffer.getText(overwriteRange);
    const lineContent = textBuffer.getLineContent(overwriteRange.start.line);
    const hasOnlyWhitespace = lineContent.trim().length === 0;
    const hasColon = lineContent.indexOf(':') !== -1;

    const nodeParent = doc.getParent(node);

    const matchOriginal = matchingSchemas.find((it) => it.node.internalNode === originalNode && it.schema.properties);
    for (const schema of matchingSchemas) {
      if (
        ((schema.node.internalNode === node && !matchOriginal) || schema.node.internalNode === originalNode) &&
        !schema.inverted
      ) {
        this.collectDefaultSnippets(schema.schema, separatorAfter, collector, {
          newLineFirst: false,
          indentFirstObject: false,
          shouldIndentWithTab: false,
        });

        const schemaProperties = schema.schema.properties;
        if (schemaProperties) {
          const maxProperties = schema.schema.maxProperties;
          if (
            maxProperties === undefined ||
            node.items === undefined ||
            node.items.length < maxProperties ||
            (node.items.length === maxProperties && !hasOnlyWhitespace)
          ) {
            for (const key in schemaProperties) {
              if (Object.prototype.hasOwnProperty.call(schemaProperties, key)) {
                const propertySchema = schemaProperties[key];

                if (typeof propertySchema === 'object' && !propertySchema.deprecationMessage && !propertySchema['doNotSuggest']) {
                  let identCompensation = '';
                  if (nodeParent && isSeq(nodeParent) && node.items.length <= 1 && !hasOnlyWhitespace) {
                    // because there is a slash '-' to prevent the properties generated to have the correct
                    // indent
                    const sourceText = textBuffer.getText();
                    const indexOfSlash = sourceText.lastIndexOf('-', node.range[0] - 1);
                    if (indexOfSlash >= 0) {
                      // add one space to compensate the '-'
                      identCompensation = ' ' + sourceText.slice(indexOfSlash + 1, node.range[0]);
                    }
                  }

                  // if check that current node has last pair with "null" value and key witch match key from schema,
                  // and if schema has array definition it add completion item for array item creation
                  let pair: Pair;
                  if (
                    propertySchema.type === 'array' &&
                    (pair = node.items.find(
                      (it) =>
                        isScalar(it.key) &&
                        it.key.range &&
                        it.key.value === key &&
                        isScalar(it.value) &&
                        !it.value.value &&
                        textBuffer.getPosition(it.key.range[2]).line === overwriteRange.end.line - 1
                    )) &&
                    pair
                  ) {
                    if (Array.isArray(propertySchema.items)) {
                      this.addSchemaValueCompletions(propertySchema.items[0], separatorAfter, collector, {});
                    } else if (typeof propertySchema.items === 'object' && propertySchema.items.type === 'object') {
                      const insertText = `- ${this.getInsertTextForObject(
                        propertySchema.items,
                        separatorAfter,
                        '  '
                      ).insertText.trimLeft()}`;
                      const documentation = this.getDocumentationWithMarkdownText(
                        `Create an item of an array${propertySchema.description ? ' (' + propertySchema.description + ')' : ''}`,
                        insertText
                      );
                      collector.add({
                        kind: this.getSuggestionKind(propertySchema.items.type),
                        label: '- (array item)',
                        documentation,
                        insertText,
                        insertTextFormat: InsertTextFormat.Snippet,
                      });
                    }
                  }

                  let insertText = key;
                  if (!key.startsWith(existingKey) || !hasColon) {
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
                  // if the prop is required add it also to parent suggestion
                  if (schema.schema.required?.includes(key)) {
                    const schemaType = getSchemaTypeName(schema.schema);
                    collector.add({
                      label: key,
                      insertText: this.getInsertTextForProperty(
                        key,
                        propertySchema,
                        separatorAfter,
                        identCompensation + this.indentation
                      ),
                      insertTextFormat: InsertTextFormat.Snippet,
                      documentation: this.fromMarkup(propertySchema.markdownDescription) || propertySchema.description || '',
                      parent: {
                        schemaType,
                        indent: identCompensation,
                      },
                    });
                  }
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

      if (nodeParent && schema.node.internalNode === nodeParent && schema.schema.defaultSnippets) {
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
      if (valueNode && valueNode.range && offset > valueNode.range[0] + valueNode.range[2]) {
        return; // we are past the value node
      }
      parentKey = isScalar(node.key) ? node.key.value.toString() : null;
      node = doc.getParent(node);
    }

    if (node && (parentKey !== null || isSeq(node))) {
      const separatorAfter = '';
      const matchingSchemas = doc.getMatchingSchemas(schema.schema);
      for (const s of matchingSchemas) {
        if (s.node.internalNode === node && !s.inverted && s.schema) {
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
                const insertText = `- ${this.getInsertTextForObject(s.schema.items, separatorAfter, '  ').insertText.trimLeft()}`;
                const documentation = this.getDocumentationWithMarkdownText(
                  `Create an item of an array${s.schema.description ? ' (' + s.schema.description + ')' : ''}`,
                  insertText
                );
                collector.add({
                  kind: this.getSuggestionKind(s.schema.items.type),
                  label: '- (array item)',
                  documentation,
                  insertText,
                  insertTextFormat: InsertTextFormat.Snippet,
                });

                this.addSchemaValueCompletions(s.schema.items, separatorAfter, collector, types);
              } else if (typeof s.schema.items === 'object' && s.schema.items.anyOf) {
                s.schema.items.anyOf
                  .filter((i) => typeof i === 'object')
                  .forEach((i: JSONSchema, index) => {
                    const schemaType = getSchemaTypeName(i);
                    const insertText = `- ${this.getInsertTextForObject(i, separatorAfter).insertText.trimLeft()}`;
                    //append insertText to documentation
                    const schemaTypeTitle = schemaType ? ' type `' + schemaType + '`' : '';
                    const schemaDescription = s.schema.description ? ' (' + s.schema.description + ')' : '';
                    const documentation = this.getDocumentationWithMarkdownText(
                      `Create an item of an array${schemaTypeTitle}${schemaDescription}`,
                      insertText
                    );
                    collector.add({
                      kind: this.getSuggestionKind(i.type),
                      label: '- (array item) ' + (schemaType || index + 1),
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
    indent = this.indentation
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
        } else if (propertySchema.anyOf) {
          type = 'anyOf';
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

      if (propertySchema.const) {
        if (!value) {
          value = this.getInsertTextForGuessedValue(propertySchema.const, '', type);
          value = evaluateTab1Symbol(value); // prevent const being selected after snippet insert
          value = ' ' + value;
        }
        nValueProposals++;
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
        return `${resultText}\n${this.getInsertTextForObject(propertySchema, separatorAfter, indent).insertText}`;
      } else if (propertySchema.items) {
        return `${resultText}\n${indent}- ${
          this.getInsertTextForArray(propertySchema.items, separatorAfter, 1, indent).insertText
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
            value = `\n${indent}`;
            break;
          case 'array':
            value = `\n${indent}- `;
            break;
          case 'number':
          case 'integer':
            value = ' ${1:0}';
            break;
          case 'null':
            value = ' ${1:null}';
            break;
          case 'anyOf':
            value = ' $1';
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
        if (propertySchema.anyOf) {
          type = 'anyOf';
        }
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
          case 'anyOf': {
            let value = propertySchema.default || propertySchema.const;
            if (value) {
              if (type === 'string') {
                value = convertToStringValue(value);
              }
              insertText += `${indent}${key}: \${${insertIndex++}:${value}}\n`;
            } else {
              insertText += `${indent}${key}: $${insertIndex++}\n`;
            }
            break;
          }
          case 'array':
            {
              const arrayInsertResult = this.getInsertTextForArray(propertySchema.items, separatorAfter, insertIndex++, indent);
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
      } else if (!this.disableDefaultProperties && propertySchema.default !== undefined) {
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
  private getInsertTextForArray(schema: any, separatorAfter: string, insertIndex = 1, indent = this.indentation): InsertText {
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
          const objectInsertResult = this.getInsertTextForObject(schema, separatorAfter, `${indent}  `, insertIndex++);
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
        insertText: this.getInsertTextForValue(schema.const, separatorAfter, schema.type),
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
  if (value.length === 0) {
    return value;
  }

  if (value === 'true' || value === 'false' || value === 'null' || isNumberExp.test(value)) {
    return `"${value}"`;
  }

  if (value.indexOf('"') !== -1) {
    value = value.replace(doubleQuotesEscapeRegExp, '"');
  }

  let doQuote = value.charAt(0) === '@';

  if (!doQuote) {
    // need to quote value if in `foo: bar`, `foo : bar` (mapping) or `foo:` (partial map) format
    // but `foo:bar` and `:bar` (colon without white-space after it) are just plain string
    let idx = value.indexOf(':', 0);
    for (; idx > 0 && idx < value.length; idx = value.indexOf(':', idx + 1)) {
      if (idx === value.length - 1) {
        // `foo:` (partial map) format
        doQuote = true;
        break;
      }

      // there are only two valid kinds of white-space in yaml: space or tab
      // ref: https://yaml.org/spec/1.2.1/#id2775170
      const nextChar = value.charAt(idx + 1);
      if (nextChar === '\t' || nextChar === ' ') {
        doQuote = true;
        break;
      }
    }
  }

  if (doQuote) {
    value = `"${value}"`;
  }

  return value;
}

/**
 * simplify `{$1:value}` to `value`
 */
function evaluateTab1Symbol(value: string): string {
  const result = value.replace(/\$\{1:(.*)\}/, '$1');
  return result;
}

function isParentCompletionItem(item: CompletionItemBase): item is CompletionItem {
  return 'parent' in item;
}
