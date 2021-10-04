/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Adam Voss. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Parser, Composer, Document, LineCounter, ParseOptions, DocumentOptions, SchemaOptions } from 'yaml';
import { YAMLDocument, SingleYAMLDocument } from './yaml-documents';
import { getCustomTags } from './custom-tag-provider';

export { YAMLDocument, SingleYAMLDocument };

export type YamlVersion = '1.1' | '1.2';
export interface ParserOptions {
  customTags: string[];
  yamlVersion: YamlVersion;
}
export const defaultOptions: ParserOptions = {
  customTags: [],
  yamlVersion: '1.2',
};
/**
 * `yaml-ast-parser-custom-tags` parses the AST and
 * returns YAML AST nodes, which are then formatted
 * for consumption via the language server.
 */
export function parse(text: string, parserOptions: ParserOptions = defaultOptions): YAMLDocument {
  const options: ParseOptions & DocumentOptions & SchemaOptions = {
    strict: false,
    customTags: getCustomTags(parserOptions.customTags),
    version: parserOptions.yamlVersion,
  };
  const composer = new Composer(options);
  const lineCounter = new LineCounter();
  const parser = new Parser(lineCounter.addNewLine);
  const tokens = parser.parse(text);
  const docs = composer.compose(tokens, true);

  // Generate the SingleYAMLDocs from the AST nodes
  const yamlDocs: SingleYAMLDocument[] = Array.from(docs, (doc) => parsedDocToSingleYAMLDocument(doc, lineCounter));

  // Consolidate the SingleYAMLDocs
  return new YAMLDocument(yamlDocs);
}

function parsedDocToSingleYAMLDocument(parsedDoc: Document, lineCounter: LineCounter): SingleYAMLDocument {
  const syd = new SingleYAMLDocument(lineCounter);
  syd.internalDocument = parsedDoc;
  return syd;
}
