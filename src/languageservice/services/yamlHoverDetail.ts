/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Hover, MarkupContent, Position, Range } from 'vscode-languageserver-types';
import { matchOffsetToDocument } from '../utils/arrUtils';
import { LanguageSettings } from '../yamlLanguageService';
import { YAMLSchemaService } from './yamlSchemaService';
import { setKubernetesParserOption } from '../parser/isKubernetes';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { yamlDocumentsCache } from '../parser/yaml-documents';
import { SingleYAMLDocument } from '../parser/yamlParser07';
import { getNodeValue, IApplicableSchema } from '../parser/jsonParser07';
import { JSONSchema } from '../jsonSchema';
import { URI } from 'vscode-uri';
import * as path from 'path';
import { Telemetry } from '../telemetry';
import { ASTNode, MarkedString } from 'vscode-json-languageservice';
import { Schema2Md } from '../utils/jigx/schema2md';
import { decycle } from '../utils/jigx/cycle';
import { Globals } from '../utils/jigx/globals';

interface YamlHoverDetailResult {
  /**
   * The hover's content
   */
  contents: MarkupContent | MarkedString | MarkedString[];
  /**
   * An optional range
   */
  range?: Range;

  schemas: JSONSchema[];

  node: ASTNode;
}
export type YamlHoverDetailPropTableStyle = 'table' | 'tsBlock' | 'none';
export class YamlHoverDetail {
  private shouldHover: boolean;
  private schemaService: YAMLSchemaService;
  private jsonHover;
  private appendTypes = true;
  private schema2Md = new Schema2Md();
  propTableStyle: YamlHoverDetailPropTableStyle;

  constructor(schemaService: YAMLSchemaService, private readonly telemetry: Telemetry) {
    // this.shouldHover = true;
    this.schemaService = schemaService;
  }

  public configure(languageSettings: LanguageSettings): void {
    if (languageSettings) {
      this.propTableStyle = languageSettings.propTableStyle;
      // this.shouldHover = languageSettings.hover;
    }
    this.schema2Md.configure({ propTableStyle: this.propTableStyle });
  }

  public doHoverDetail(document: TextDocument, position: Position, isKubernetes = false): Thenable<Hover> {
    try {
      if (/*!this.shouldHover ||*/ !document) {
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
      const detail = this.getHover(document, position, currentDoc);
      return detail;
    } catch (error) {
      this.telemetry.sendError('yaml.hover.error', { error, documentUri: document.uri });
    }
  }

  private getHover(document: TextDocument, position: Position, doc: SingleYAMLDocument): Thenable<Hover | null> {
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

    const createHover = (contents: string, schemas: JSONSchema[], node: ASTNode): YamlHoverDetailResult => {
      const markupContent: MarkupContent = {
        kind: 'markdown',
        value: contents,
      };
      const result: YamlHoverDetailResult = {
        contents: markupContent,
        range: hoverRange,
        schemas: schemas,
        node: node,
      };
      return result;
    };

    // const location = getNodePath(node);
    const propertyName = node.parent?.children?.[0].value?.toString();

    return this.schemaService.getSchemaForResource(document.uri, doc).then((schema) => {
      if (schema && node && !schema.errors.length) {
        //for each node from yaml it will find schema part
        //for node from yaml, there could be more schemas subpart
        //example
        //  node: componentId: '@jigx/jw-value' options: bottom:
        //      find 3 schemas - 3. last one has anyOf to 1. and 2.
        //todo: exclude any_of???? try to implement #70 and check what happen with hover
        const resSchemas: JSONSchema[] = [];
        const hoverRes: {
          title?: string;
          markdownDescription?: string;
          markdownEnumValueDescription?: string;
          enumValue?: string;
          propertyMd?: string;
        }[] = [];
        let matchingSchemas = doc.getMatchingSchemas(schema.schema, node.offset);
        // take only schemas for current node offset
        matchingSchemas = matchingSchemas.filter(
          (s) => (s.node === node || (node.type === 'property' && node.valueNode === s.node)) && !s.inverted && s.schema
        );
        const matchingSchemasDistinct = distinctSchemas(matchingSchemas);
        matchingSchemasDistinct.every((s) => {
          const hover = {
            title: s.schema.title || s.schema.closestTitle,
            markdownDescription:
              s.schema.markdownDescription ||
              (s.schema.url?.startsWith(Globals.dynamicSchema) ? s.schema.description : toMarkdown(s.schema.description)),
            markdownEnumValueDescription: undefined,
            enumValue: undefined,
            propertyMd: undefined,
          };
          if (s.schema.enum) {
            const idx = s.schema.enum.indexOf(getNodeValue(node));
            if (s.schema.markdownEnumDescriptions) {
              hover.markdownEnumValueDescription = s.schema.markdownEnumDescriptions[idx];
            } else if (s.schema.enumDescriptions) {
              hover.markdownEnumValueDescription = toMarkdown(s.schema.enumDescriptions[idx]);
            }
            if (hover.markdownEnumValueDescription) {
              hover.enumValue = s.schema.enum[idx];
              if (typeof hover.enumValue !== 'string') {
                hover.enumValue = JSON.stringify(hover.enumValue);
              }
            }
          }
          const decycleSchema = decycle(s.schema, 8);
          resSchemas.push(decycleSchema);
          if (this.propTableStyle !== 'none') {
            const propMd = this.schema2Md.generateMd(s.schema, propertyName || 'property');
            if (propMd) {
              // propertiesMd.push(propMd);
              //take only last one
              hover.propertyMd = propMd;
            }
          }
          hoverRes.push(hover);
          return true;
        });
        const newLineWithHr = '\n\n----\n';
        let results: string[] = [];
        if (hoverRes.length > 1) {
          const titleAll = hoverRes
            .filter((h) => h.title)
            .map((h) => toMarkdown(h.title))
            .join(' | ');
          if (titleAll) {
            results.push('one of\n```yaml\n' + titleAll + '\n```');
          }
        }
        for (const hover of hoverRes) {
          let result = '';
          if (hover.title) {
            result += '### ' + toMarkdown(hover.title);
          }
          if (hover.markdownDescription) {
            if (result.length > 0) {
              result += '\n\n';
            }
            result += hover.markdownDescription;
          }
          if (hover.markdownEnumValueDescription) {
            if (result.length > 0) {
              result += '\n\n';
            }
            result += `\`${toMarkdownCodeBlock(hover.enumValue)}\`: ${hover.markdownEnumValueDescription}`;
          }

          if (this.appendTypes && hover.propertyMd) {
            result +=
              newLineWithHr +
              '##\n' + // to put some space between horizontal line and first block
              hover.propertyMd;
          }
          if (result) {
            results.push(result);
          }
        }

        const decycleNode = decycle(node, 8);

        // disable sources
        // if (results.length && schema.schema.url) {
        //   if (results.some((l) => l.includes(newLineWithHr))) {
        //     results.push('----');
        //   }

        //   const source = resSchemas.map((schema) => {
        //     return `Source: [${getSchemaName(schema) || schema.closestTitle}](${schema.url})`;
        //   });
        //   results.push(source.join('\n\n'));
        // }

        if (!results.length) {
          results = [''];
        }

        let content = results.join('\n\n');

        content = descriptionImageCleanUp(content);

        return createHover(content, resSchemas, decycleNode);
      }
      return null;
    });
  }
}

/**
 * we need to filter duplicate schemas. Result contains even anyOf that reference another schemas in matchingSchemas result
 * it takes only schemas from anyOf and referenced schemas will be removed
 * @param matchingSchemas
 */
function distinctSchemas(matchingSchemas: IApplicableSchema[]): IApplicableSchema[] {
  // sort schemas (anyOf go first)
  let matchingSchemasDistinct = matchingSchemas.sort((a) => (a.schema.anyOf ? -1 : 1));
  const seenSchemaFromAnyOf = [].concat(
    ...matchingSchemasDistinct
      .filter((s) => s.schema.anyOf || s.schema.allOf || s.schema.oneOf)
      .map((s) =>
        (s.schema.anyOf || s.schema.allOf || s.schema.oneOf).map((sr: JSONSchema) => sr.$id || sr._$ref || sr.url || 'noId')
      )
  );
  matchingSchemasDistinct = matchingSchemasDistinct.filter(
    (s) =>
      s.schema.anyOf ||
      s.schema.allOf ||
      s.schema.oneOf ||
      !seenSchemaFromAnyOf.includes(s.schema.$id || s.schema._$ref || s.schema.url)
  );

  // see jsonParser07.testBranch need to solve better
  if (matchingSchemasDistinct.some((s) => s.schema.$comment === 'then/else')) {
    matchingSchemasDistinct = matchingSchemasDistinct.filter((s) => s.schema.$comment === 'then/else');
  }

  // if (matchingSchemas.length != matchingSchemasDistinct.length) {
  //   const removedCount = matchingSchemas.length - matchingSchemasDistinct.length;
  //   console.log('removing some schemas: ' + seenSchemaFromAnyOf.join(', ') + '. removed count:' + removedCount);
  // }
  return matchingSchemasDistinct;
}

function getSchemaName(schema: JSONSchema): string {
  let result = 'JSON Schema';
  const urlString = schema.url;
  if (urlString) {
    const url = URI.parse(urlString);
    result = path.basename(url.fsPath || url.authority);
  } else if (schema.title) {
    result = schema.title;
  }
  return result;
}

// copied from https://github.com/microsoft/vscode-json-languageservice/blob/2ea5ad3d2ffbbe40dea11cfe764a502becf113ce/src/services/jsonHover.ts#L112
function toMarkdown(plain: string): string;
function toMarkdown(plain: string | undefined): string | undefined;
function toMarkdown(plain: string | undefined): string | undefined {
  if (plain) {
    const res = plain.replace(/([^\n\r])(\r?\n)([^\n\r])/gm, '$1\n\n$3'); // single new lines to \n\n (Markdown paragraph)
    return res.replace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&'); // escape markdown syntax tokens: http://daringfireball.net/projects/markdown/syntax#backslash
  }
  return undefined;
}

// copied from https://github.com/microsoft/vscode-json-languageservice/blob/2ea5ad3d2ffbbe40dea11cfe764a502becf113ce/src/services/jsonHover.ts#L122
function toMarkdownCodeBlock(content: string): string {
  // see https://daringfireball.net/projects/markdown/syntax#precode
  if (content.indexOf('`') !== -1) {
    return '`` ' + content + ' ``';
  }
  return content;
}

function descriptionImageCleanUp(markdownString: string): string {
  return markdownString.replace(/<img[^>]+>/gm, (img) => (img.includes('enableInHover') ? img : ''));
}
