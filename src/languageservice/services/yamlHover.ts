/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover, MarkupContent, MarkupKind, Position, Range } from 'vscode-languageserver-types';
import { URI } from 'vscode-uri';
import { isAlias, isMap, isSeq, Node, stringify as stringifyYAML } from 'yaml';
import { ASTNode, ObjectASTNode, PropertyASTNode } from '../jsonASTTypes';
import { JSONSchema } from '../jsonSchema';
import { setKubernetesParserOption } from '../parser/isKubernetes';
import { getNodeValue } from '../parser/astNodeUtils';
import { IApplicableSchema } from '../parser/schemaValidation/baseValidator';
import { yamlDocumentsCache } from '../parser/yaml-documents';
import { SingleYAMLDocument } from '../parser/yamlParser07';
import { Telemetry } from '../telemetry';
import { matchOffsetToDocument } from '../utils/arrUtils';
import { toYamlStringScalar } from '../utils/yamlScalar';
import { LanguageSettings } from '../yamlLanguageService';
import { YAMLSchemaService } from './yamlSchemaService';

export class YAMLHover {
  private shouldHover: boolean;
  private shouldHoverAnchor: boolean;
  private indentation: string;
  private schemaService: YAMLSchemaService;

  constructor(
    schemaService: YAMLSchemaService,
    private readonly telemetry?: Telemetry
  ) {
    this.shouldHover = true;
    this.schemaService = schemaService;
  }

  configure(languageSettings: LanguageSettings): void {
    if (languageSettings) {
      this.shouldHover = languageSettings.hover;
      this.shouldHoverAnchor = languageSettings.hoverAnchor;
      this.indentation = languageSettings.indentation;
    }
  }

  doHover(document: TextDocument, position: Position, isKubernetes = false): Promise<Hover | null> {
    try {
      if (!this.shouldHover || !document) {
        return Promise.resolve(undefined);
      }
      const doc = yamlDocumentsCache.getYamlDocument(document);
      const offset = document.offsetAt(position);
      const currentDoc = matchOffsetToDocument(offset, doc);
      if (currentDoc === null) {
        return Promise.resolve(undefined);
      }

      setKubernetesParserOption(doc.documents, isKubernetes);
      const currentDocIndex = doc.documents.indexOf(currentDoc);
      currentDoc.currentDocIndex = currentDocIndex;
      return this.getHover(document, position, currentDoc);
    } catch (error) {
      this.telemetry?.sendError('yaml.hover.error', error);
    }
  }

  // method copied from https://github.com/microsoft/vscode-json-languageservice/blob/2ea5ad3d2ffbbe40dea11cfe764a502becf113ce/src/services/jsonHover.ts#L23
  private getHover(document: TextDocument, position: Position, doc: SingleYAMLDocument): Promise<Hover | null> {
    const offset = document.offsetAt(position);
    let node = doc.getNodeFromOffset(offset);
    if (
      !node ||
      ((node.type === 'object' || node.type === 'array') && offset > node.offset + 1 && offset < node.offset + node.length - 1)
    ) {
      return Promise.resolve(null);
    }
    const hoverRangeNode = node;

    // use the property description when hovering over an object key
    if (node.type === 'string') {
      const parent = node.parent;
      if (parent && parent.type === 'property' && parent.keyNode === node) {
        node = parent.valueNode;
        if (!node) {
          return Promise.resolve(null);
        }
      }
    }

    const hoverRange = Range.create(
      document.positionAt(hoverRangeNode.offset),
      document.positionAt(hoverRangeNode.offset + hoverRangeNode.length)
    );

    const createHover = (contents: string): Hover => {
      const markupContent: MarkupContent = {
        kind: MarkupKind.Markdown,
        value: contents,
      };
      const result: Hover = {
        contents: markupContent,
        range: hoverRange,
      };
      return result;
    };

    if (this.shouldHoverAnchor && node.type === 'property' && node.valueNode) {
      if (node.valueNode.type === 'object') {
        const resolved = this.resolveMergeKeys(node.valueNode as ObjectASTNode, doc);
        const contents = '```yaml\n' + stringifyYAML(resolved, null, 2) + '\n```';
        return Promise.resolve(createHover(contents));
      }
    }

    const removePipe = (value: string): string => {
      return value.replace(/\s\|\|\s*$/, '');
    };

    return this.schemaService.getSchemaForResource(document.uri, doc).then((schema) => {
      if (schema && node && !schema.errors.length) {
        const matchingSchemas = doc.getMatchingSchemas(schema.schema, node.offset);

        let title: string | undefined = undefined;
        let markdownDescription: string | undefined = undefined;
        let markdownEnumDescriptions: string[] = [];
        const markdownExamples: string[] = [];
        const markdownEnums: markdownEnum[] = [];
        let enumIdx: number | undefined = undefined;
        matchingSchemas.every((s) => {
          if ((s.node === node || (node.type === 'property' && node.valueNode === s.node)) && !s.inverted && s.schema) {
            title = title || s.schema.title || s.schema.closestTitle;
            markdownDescription = markdownDescription || s.schema.markdownDescription || this.toMarkdown(s.schema.description);
            if (s.schema.enum) {
              enumIdx = s.schema.enum.indexOf(getNodeValue(node));
              if (s.schema.markdownEnumDescriptions) {
                markdownEnumDescriptions = s.schema.markdownEnumDescriptions;
              } else if (s.schema.enumDescriptions) {
                markdownEnumDescriptions = s.schema.enumDescriptions.map(this.toMarkdown, this);
              } else {
                markdownEnumDescriptions = [];
              }
              s.schema.enum.forEach((enumValue, idx) => {
                enumValue = typeof enumValue === 'string' ? toYamlStringScalar(enumValue, false) : JSON.stringify(enumValue);
                //insert only if the value is not present yet (avoiding duplicates)
                //but it also adds or keeps the description of the enum value
                const foundIdx = markdownEnums.findIndex((me) => me.value === enumValue);
                if (foundIdx < 0) {
                  markdownEnums.push({
                    value: enumValue,
                    description: markdownEnumDescriptions[idx],
                  });
                } else {
                  markdownEnums[foundIdx].description ||= markdownEnumDescriptions[idx];
                }
              });
            }
            if (s.schema.anyOf && isAllSchemasMatched(node, matchingSchemas, s.schema)) {
              //if append title and description of all matched schemas on hover
              title = '';
              markdownDescription = s.schema.description ? s.schema.description + '\n' : '';
              s.schema.anyOf.forEach((childSchema: JSONSchema, index: number) => {
                title += childSchema.title || s.schema.closestTitle || '';
                markdownDescription += childSchema.markdownDescription || this.toMarkdown(childSchema.description) || '';
                if (index !== s.schema.anyOf.length - 1) {
                  title += ' || ';
                  markdownDescription += ' || ';
                }
              });
              title = removePipe(title);
              markdownDescription = removePipe(markdownDescription);
            }
            if (s.schema.examples) {
              s.schema.examples.forEach((example) => {
                markdownExamples.push(stringifyYAML(example, null, 2));
              });
            }
          }
          return true;
        });
        let result = '';
        if (title) {
          result = '#### ' + this.toMarkdown(title);
        }
        if (markdownDescription) {
          result = ensureLineBreak(result);
          result += markdownDescription;
        }
        if (markdownEnums.length !== 0) {
          result = ensureLineBreak(result);
          result += l10n.t('Allowed Values:') + '\n\n';
          if (enumIdx) {
            markdownEnums.unshift(markdownEnums.splice(enumIdx, 1)[0]);
          }
          markdownEnums.forEach((me) => {
            if (me.description) {
              result += `* \`${toMarkdownCodeBlock(me.value)}\`: ${me.description}\n`;
            } else {
              result += `* \`${toMarkdownCodeBlock(me.value)}\`\n`;
            }
          });
        }
        if (markdownExamples.length !== 0) {
          markdownExamples.forEach((example) => {
            result = ensureLineBreak(result);
            result += l10n.t('Example:') + '\n\n';
            result += `\`\`\`yaml\n${example}\`\`\`\n`;
          });
        }
        if (result.length > 0 && schema.schema.url) {
          result = ensureLineBreak(result);
          result += l10n.t('Source: [{0}]({1})', getSchemaName(schema.schema), schema.schema.url);
        }
        return createHover(result);
      }
      return null;
    });
  }

  /**
   * Resolves merge keys (<<) and anchors recursively in an object node
   * @param node The object AST node to resolve
   * @param doc The YAML document for resolving anchors
   * @param currentRecursionLevel Current recursion level (default: 0)
   * @returns A plain JavaScript object with all merges resolved
   */
  private resolveMergeKeys(node: ObjectASTNode, doc: SingleYAMLDocument, currentRecursionLevel = 0): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const unprocessedProperties: PropertyASTNode[] = [...node.properties];

    while (unprocessedProperties.length > 0) {
      const propertyNode = unprocessedProperties.shift();
      const key = propertyNode.keyNode.value;

      if (key === '<<' && propertyNode.valueNode) {
        // Handle merge key
        const mergeValue = this.resolveMergeValue(propertyNode.valueNode, doc, currentRecursionLevel + 1);
        if (mergeValue && typeof mergeValue === 'object' && !Array.isArray(mergeValue)) {
          // Merge properties from the resolved value
          const mergeKeys = Object.keys(mergeValue);
          for (const mergeKey of mergeKeys) {
            result[mergeKey] = mergeValue[mergeKey];
          }
        }
      } else {
        // Regular property
        result[key] = this.astNodeToValue(propertyNode.valueNode, doc, currentRecursionLevel);
      }
    }

    return result;
  }

  /**
   * Resolves a merge value (which might be an alias) and recursively resolves its merge keys
   * @param node The AST node that might be an alias or object
   * @param doc The YAML document for resolving anchors
   * @param currentRecursionLevel Current recursion level
   * @returns The resolved value
   */
  private resolveMergeValue(node: ASTNode, doc: SingleYAMLDocument, currentRecursionLevel: number): unknown {
    const MAX_MERGE_RECURSION_LEVEL = 10;

    // Check if we've exceeded max recursion level
    if (currentRecursionLevel >= MAX_MERGE_RECURSION_LEVEL) {
      return { '<<': node.parent.internalNode['value'] + ' (recursion limit reached)' };
    }

    // If it's an object node, resolve its merge keys
    if (node.type === 'object') {
      return this.resolveMergeKeys(node as ObjectASTNode, doc, currentRecursionLevel);
    }

    // Otherwise, convert to value
    return this.astNodeToValue(node, doc, currentRecursionLevel);
  }

  /**
   * Converts an AST node to a plain JavaScript value
   * @param node The AST node to convert
   * @param doc The YAML document for resolving anchors
   * @param currentRecursionLevel Current recursion level
   * @returns The converted value
   */
  private astNodeToValue(node: ASTNode | undefined, doc: SingleYAMLDocument, currentRecursionLevel: number): unknown {
    if (!node) {
      return null;
    }

    switch (node.type) {
      case 'object': {
        return this.resolveMergeKeys(node as ObjectASTNode, doc, currentRecursionLevel);
      }
      case 'array': {
        return node.children.map((child) => this.astNodeToValue(child, doc, currentRecursionLevel));
      }
      case 'string':
      case 'number':
      case 'boolean':
      case 'null': {
        return node.value;
      }
      default: {
        return this.nodeToValue(node.internalNode as Node);
      }
    }
  }

  /**
   * Converts a YAML Node to a plain JavaScript value
   * @param node The YAML node to convert
   * @returns The converted value
   */
  private nodeToValue(node: Node): unknown {
    if (isAlias(node)) {
      return node.source;
    }
    if (isMap(node)) {
      const result: Record<string, unknown> = {};
      for (const pair of node.items) {
        if (pair.key && pair.value) {
          const key = this.nodeToValue(pair.key as Node);
          const value = this.nodeToValue(pair.value as Node);
          if (typeof key === 'string') {
            result[key] = value;
          }
        }
      }
      return result;
    }
    if (isSeq(node)) {
      return node.items.map((item) => this.nodeToValue(item as Node));
    }
    return (node as { value?: unknown }).value;
  }

  // copied from https://github.com/microsoft/vscode-json-languageservice/blob/2ea5ad3d2ffbbe40dea11cfe764a502becf113ce/src/services/jsonHover.ts#L112
  private toMarkdown(plain: string | undefined): string | undefined {
    if (plain) {
      let escaped = plain.replace(/([^\n\r])(\r?\n)([^\n\r])/gm, '$1\n\n$3'); // single new lines to \n\n (Markdown paragraph)
      escaped = escaped.replace(/[\\`*_{}[\]#+\-!]/g, '\\$&'); // escape some of the markdown syntax tokens http://daringfireball.net/projects/markdown/syntax#backslash to avoid unintended formatting
      if (this.indentation !== undefined) {
        // escape indentation whitespace to prevent it from being converted to markdown code blocks.
        const indentationMatchRegex = new RegExp(` {${this.indentation.length}}`, 'g');
        escaped = escaped.replace(indentationMatchRegex, '&emsp;');
      }
      return escaped;
    }
    return undefined;
  }
}

interface markdownEnum {
  value: string;
  description: string;
}

function ensureLineBreak(content: string): string {
  if (content.length === 0) {
    return content;
  }
  if (!content.endsWith('\n')) {
    content += '\n';
  }
  return content + '\n';
}

function getSchemaName(schema: JSONSchema): string {
  let result = 'JSON Schema';
  const urlString = schema.url;
  if (urlString) {
    const url = URI.parse(urlString);
    result = path.basename(url.fsPath);
  } else if (schema.title) {
    result = schema.title;
  }
  return result;
}

// copied from https://github.com/microsoft/vscode-json-languageservice/blob/2ea5ad3d2ffbbe40dea11cfe764a502becf113ce/src/services/jsonHover.ts#L122
function toMarkdownCodeBlock(content: string): string {
  // see https://daringfireball.net/projects/markdown/syntax#precode
  if (content.indexOf('`') !== -1) {
    return '`` ' + content + ' ``';
  }
  return content;
}

/**
 * check all the schemas which is inside anyOf presented or not in matching schema.
 * @param node node
 * @param matchingSchemas all matching schema
 * @param schema scheam which is having anyOf
 * @returns true if all the schemas which inside anyOf presents in matching schema
 */
function isAllSchemasMatched(node: ASTNode, matchingSchemas: IApplicableSchema[], schema: JSONSchema): boolean {
  let count = 0;
  for (const matchSchema of matchingSchemas) {
    if (node === matchSchema.node && matchSchema.schema !== schema) {
      schema.anyOf.forEach((childSchema: JSONSchema) => {
        if (
          matchSchema.schema.title === childSchema.title &&
          matchSchema.schema.description === childSchema.description &&
          matchSchema.schema.properties === childSchema.properties
        ) {
          count++;
        }
      });
    }
  }
  return count === schema.anyOf.length;
}
