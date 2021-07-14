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
import { getNodeValue } from '../parser/jsonParser07';
import { JSONSchema } from '../jsonSchema';
import { URI } from 'vscode-uri';
import * as path from 'path';

export class YAMLHover {
  private shouldHover: boolean;
  private schemaService: YAMLSchemaService;

  constructor(schemaService: YAMLSchemaService) {
    this.shouldHover = true;
    this.schemaService = schemaService;
  }

  configure(languageSettings: LanguageSettings): void {
    if (languageSettings) {
      this.shouldHover = languageSettings.hover;
    }
  }

  doHover(document: TextDocument, position: Position, isKubernetes = false): Promise<Hover | null> {
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
        kind: 'markdown',
        value: contents,
      };
      const result: Hover = {
        contents: markupContent,
        range: hoverRange,
      };
      return result;
    };

    return this.schemaService.getSchemaForResource(document.uri, doc).then((schema) => {
      if (schema && node && !schema.errors.length) {
        const matchingSchemas = doc.getMatchingSchemas(schema.schema, node.offset);

        let title: string | undefined = undefined;
        let markdownDescription: string | undefined = undefined;
        let markdownEnumValueDescription: string | undefined = undefined,
          enumValue: string | undefined = undefined;
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
          }
          return true;
        });
        let result = '';
        if (title) {
          result = '#### ' + toMarkdown(title);
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

        if (result.length > 0 && schema.schema.url) {
          result += `\n\nSource: [${getSchemaName(schema.schema)}](${schema.schema.url})`;
        }
        return createHover(result);
      }
      return null;
    });
  }
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
