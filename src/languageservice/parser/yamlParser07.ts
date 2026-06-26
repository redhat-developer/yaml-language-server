/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Adam Voss. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CST, Document, ParseOptions, DocumentOptions, SchemaOptions } from 'yaml';
import { Parser, Composer, LineCounter } from 'yaml';
import { YAMLDocument, SingleYAMLDocument } from './yaml-documents';
import { getCustomTags } from './custom-tag-provider';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { TextBuffer } from '../utils/textBuffer';

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
export function parse(text: string, parserOptions: ParserOptions = defaultOptions, document?: TextDocument): YAMLDocument {
  const options: ParseOptions & DocumentOptions & SchemaOptions = {
    strict: false,
    customTags: getCustomTags(parserOptions.customTags),
    version: parserOptions.yamlVersion ?? defaultOptions.yamlVersion,
    keepSourceTokens: true,
  };
  const composer = new Composer(options);
  const lineCounter = new LineCounter();
  let isLastLineEmpty = false;
  if (document) {
    const textBuffer = new TextBuffer(document);
    const position = textBuffer.getPosition(text.length);
    const lineContent = textBuffer.getLineContent(position.line);
    isLastLineEmpty = lineContent.trim().length === 0;
  }
  const parser = isLastLineEmpty ? new Parser() : new Parser(lineCounter.addNewLine);
  const tokens = parser.parse(text);
  const tokensArr = Array.from(tokens);
  const docs = composer.compose(tokensArr, true, text.length);
  const documentHeaderComments = getDocumentHeaderComments(tokensArr);
  // Generate the SingleYAMLDocs from the AST nodes
  const yamlDocs: SingleYAMLDocument[] = Array.from(docs, (doc, index) =>
    parsedDocToSingleYAMLDocument(doc, lineCounter, documentHeaderComments[index] ?? [])
  );

  // Consolidate the SingleYAMLDocs
  return new YAMLDocument(yamlDocs, tokensArr);
}

function parsedDocToSingleYAMLDocument(
  parsedDoc: Document,
  lineCounter: LineCounter,
  documentHeaderComments: string[]
): SingleYAMLDocument {
  const syd = new SingleYAMLDocument(lineCounter);
  syd.documentHeaderComments = documentHeaderComments;
  syd.internalDocument = parsedDoc;
  return syd;
}

function getDocumentHeaderComments(tokens: CST.Token[]): string[][] {
  const documentHeaderComments: string[][] = [];
  let pendingComments: string[] = [];

  for (const token of tokens) {
    if (token.type === 'comment') {
      pendingComments.push(token.source);
      continue;
    }
    if (token.type === 'newline' || token.type === 'space' || token.type === 'byte-order-mark' || token.type === 'directive') {
      continue;
    }
    if (token.type === 'doc-end') {
      pendingComments = [];
      continue;
    }
    if (token.type === 'document') {
      const startComments = token.start
        .filter((startToken) => startToken.type === 'comment')
        .map((startToken) => startToken.source);
      documentHeaderComments.push([...pendingComments, ...startComments]);
      pendingComments = [];
      continue;
    }
    pendingComments = [];
  }
  if (pendingComments.length > 0) {
    documentHeaderComments.push(pendingComments);
  }
  return documentHeaderComments;
}
