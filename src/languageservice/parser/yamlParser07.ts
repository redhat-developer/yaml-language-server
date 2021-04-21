/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Adam Voss. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Parser, Composer, Document, LineCounter, Tags, ParseOptions, DocumentOptions, SchemaOptions } from 'yaml';
import { YAMLDocument, SingleYAMLDocument } from './yaml-documents';
import { customTagsToTags } from '../utils/parseUtils';


export { YAMLDocument, SingleYAMLDocument };

/**
 * `yaml-ast-parser-custom-tags` parses the AST and
 * returns YAML AST nodes, which are then formatted
 * for consumption via the language server.
 */
export function parse(text: string, customTags = []): YAMLDocument {
  const options: ParseOptions & DocumentOptions & SchemaOptions = {
    strict: true,
    customTags: customTagsToTags(customTags),
  };
  const composer = new Composer(options);
  const lineCounter = new LineCounter();
  const parser = new Parser(lineCounter.addNewLine);
  const tokens = parser.parse(text);
  const docs = composer.compose(tokens);

  // Generate the SingleYAMLDocs from the AST nodes
  const yamlDocs: SingleYAMLDocument[] = Array.from(docs, (doc) => parsedDocToSingleYAMLDocument(doc, lineCounter.lineStarts));

  // Consolidate the SingleYAMLDocs
  return new YAMLDocument(yamlDocs);
}

function parsedDocToSingleYAMLDocument(parsedDoc: Document, lineStarts: number[]): SingleYAMLDocument {
  const syd = new SingleYAMLDocument(lineStarts);
  syd.internalDocument = parsedDoc;
  return syd;
}
