/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { getNodePath, getNodeValue } from 'jsonc-parser';
import { ASTNode, JSONSchema, MarkedString, MarkupContent, Range } from 'vscode-json-languageservice';
import { JSONHover } from 'vscode-json-languageservice/lib/umd/services/jsonHover';
import { Hover, Position, TextDocument } from 'vscode-languageserver-types';
import { setKubernetesParserOption } from '../parser/isKubernetes';
import { parse as parseYAML, SingleYAMLDocument } from '../parser/yamlParser07';
import { matchOffsetToDocument } from '../utils/arrUtils';
import { decycle } from '../utils/jigx/cycle';
import { Schema2Md } from '../utils/jigx/schema2md';
import { LanguageSettings } from '../yamlLanguageService';
import { YAMLSchemaService } from './yamlSchemaService';

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
  private jsonHover;
  private appendTypes = true;
  private promise: PromiseConstructor;
  private schema2Md = new Schema2Md();
  propTableStyle: YamlHoverDetailPropTableStyle;

  constructor(private schemaService: YAMLSchemaService) {
    this.jsonHover = new JSONHover(schemaService, [], Promise);
    // this.promise = promiseConstructor || Promise;
  }

  public configure(languageSettings: LanguageSettings): void {
    // eslint-disable-next-line no-empty
    if (languageSettings) {
      this.propTableStyle = languageSettings.propTableStyle;
    }
    this.schema2Md.configure({ propTableStyle: this.propTableStyle });
  }

  public getHoverDetail(document: TextDocument, position: Position, isKubernetes = false): Thenable<Hover> {
    if (!document) {
      return Promise.resolve(undefined);
    }
    const doc = parseYAML(document.getText());
    const offset = document.offsetAt(position);
    const currentDoc = matchOffsetToDocument(offset, doc);
    if (currentDoc === null) {
      return Promise.resolve(undefined);
    }

    setKubernetesParserOption(doc.documents, isKubernetes);
    const currentDocIndex = doc.documents.indexOf(currentDoc);
    currentDoc.currentDocIndex = currentDocIndex;
    const detail = this.getHoverSchemaDetail(document, position, currentDoc);
    return detail;
  }

  private getHoverSchemaDetail(document: TextDocument, position: Position, doc: SingleYAMLDocument): Thenable<Hover | null> {
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
          return this.promise.resolve(null);
        }
      }
    }

    const hoverRange = Range.create(
      document.positionAt(hoverRangeNode.offset),
      document.positionAt(hoverRangeNode.offset + hoverRangeNode.length)
    );

    const createPropDetail = (contents: MarkedString[], schemas: JSONSchema[], node: ASTNode): YamlHoverDetailResult => {
      const result: YamlHoverDetailResult = {
        contents: contents,
        range: hoverRange,
        schemas: schemas,
        node: node,
      };
      return result;
    };

    const location = getNodePath(node);
    for (let i = this.jsonHover.contributions.length - 1; i >= 0; i--) {
      const contribution = this.jsonHover.contributions[i];
      const promise = contribution.getInfoContribution(document.uri, location);
      if (promise) {
        return promise.then((htmlContent) => createPropDetail(htmlContent, [], node));
      }
    }

    return this.schemaService.getSchemaForResource(document.uri, doc).then((schema) => {
      if (schema && node) {
        //for each node from yaml it will find schema part
        //for node from yaml, there could be more schemas subpart
        //example
        //  node: componentId: '@jigx/jw-value' options: bottom:
        //      find 3 schemas - 3. last one has anyOf to 1. and 2.
        const matchingSchemas = doc.getMatchingSchemas(schema.schema, node.offset);
        const resSchemas: JSONSchema[] = [];
        let title: string | undefined = undefined;
        let markdownDescription: string | undefined = undefined;
        let markdownEnumValueDescription: string | undefined = undefined,
          enumValue: string | undefined = undefined;
        let propertiesMd = [];

        matchingSchemas.every((s) => {
          if (s.node === node && !s.inverted && s.schema) {
            title = title || s.schema.title;
            markdownDescription = markdownDescription || s.schema.markdownDescription || toMarkdown(s.schema.description);
            if (s.schema.enum) {
              const idx = s.schema.enum.indexOf(getNodeValue(node));
              if (s.schema.markdownEnumDescriptions) {
                markdownEnumValueDescription = s.schema.markdownEnumDescriptions[idx];
              } else if (s.schema.enumDescriptions) {
                markdownEnumValueDescription = toMarkdown(s.schema.enumDescriptions[idx]);
              }
              if (markdownEnumValueDescription) {
                enumValue = s.schema.enum[idx];
                if (typeof enumValue !== 'string') {
                  enumValue = JSON.stringify(enumValue);
                }
              }
            }
            const decycleSchema = decycle(s.schema, 8);
            resSchemas.push(decycleSchema);
            if (this.propTableStyle !== 'none') {
              const propMd = this.schema2Md.generateMd(s.schema, node.location);
              if (propMd) {
                // propertiesMd.push(propMd);
                //take only last one
                propertiesMd = [propMd];
              }
            }
          }
          return true;
        });
        let result = '';
        if (title) {
          result = toMarkdown(title);
        }
        if (markdownDescription) {
          if (result.length > 0) {
            result += '\n\n';
          }
          result += markdownDescription;
        }
        if (markdownEnumValueDescription) {
          if (result.length > 0) {
            result += '\n\n';
          }
          result += `\`${toMarkdownCodeBlock(enumValue)}\`: ${markdownEnumValueDescription}`;
        }

        if (this.appendTypes && propertiesMd.length) {
          // result += propertiesMd.length > 1 ? '\n\n Possible match count: ' + propertiesMd.length : '';
          // result += propertiesMd.map((p, i) => '\n\n----\n' + (propertiesMd.length > 1 ? `${i + 1}.\n` : '') + p).join('');
          result += '\n\n----\n' + propertiesMd.join('\n\n----\n');
        }
        const decycleNode = decycle(node, 8);
        return createPropDetail([result], resSchemas, decycleNode);
      }
      return null;
    });
  }
}

function toMarkdown(plain: string): string;
function toMarkdown(plain: string | undefined): string | undefined;
function toMarkdown(plain: string | undefined): string | undefined {
  if (plain) {
    const res = plain.replace(/([^\n\r])(\r?\n)([^\n\r])/gm, '$1\n\n$3'); // single new lines to \n\n (Markdown paragraph)
    return res.replace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&'); // escape markdown syntax tokens: http://daringfireball.net/projects/markdown/syntax#backslash
  }
  return undefined;
}

function toMarkdownCodeBlock(content: string): string {
  // see https://daringfireball.net/projects/markdown/syntax#precode
  if (content.indexOf('`') !== -1) {
    return '`` ' + content + ' ``';
  }
  return content;
}
