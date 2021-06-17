/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import { JSONDocument } from './jsonParser07';
import { Document, LineCounter, visit, YAMLError } from 'yaml';
import { ASTNode } from '../jsonASTTypes';
import { defaultOptions, parse as parseYAML, ParserOptions } from './yamlParser07';
import { ErrorCode } from 'vscode-json-languageservice';
import { Node } from 'yaml/dist/nodes/Node';
import { convertAST } from './ast-converter';
import { YAMLDocDiagnostic } from '../utils/parseUtils';
import { isArrayEqual } from '../utils/arrUtils';

/**
 * These documents are collected into a final YAMLDocument
 * and passed to the `parseYAML` caller.
 */
export class SingleYAMLDocument extends JSONDocument {
  private lineCounter: LineCounter;
  private _internalDocument: Document;
  public root: ASTNode;
  public currentDocIndex: number;
  private _lineComments: string[];

  constructor(lineCounter?: LineCounter) {
    super(null, []);
    this.lineCounter = lineCounter;
  }

  private collectLineComments(): void {
    this._lineComments = [];
    if (this._internalDocument.commentBefore) {
      this._lineComments.push(`#${this._internalDocument.commentBefore}`);
    }
    visit(this.internalDocument, (_key, node: Node) => {
      if (node?.commentBefore) {
        this._lineComments.push(`#${node.commentBefore}`);
      }
    });
  }

  set internalDocument(document: Document) {
    this._internalDocument = document;
    this.root = convertAST(null, this._internalDocument.contents as Node, this._internalDocument, this.lineCounter);
  }

  get internalDocument(): Document {
    return this._internalDocument;
  }

  get lineComments(): string[] {
    if (!this._lineComments) {
      this.collectLineComments();
    }
    return this._lineComments;
  }
  set lineComments(val: string[]) {
    this._lineComments = val;
  }
  get errors(): YAMLDocDiagnostic[] {
    return this.internalDocument.errors.map(YAMLErrorToYamlDocDiagnostics);
  }
  get warnings(): YAMLDocDiagnostic[] {
    return this.internalDocument.warnings.map(YAMLErrorToYamlDocDiagnostics);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  public getSchemas(schema: any, doc: any, node: any): any[] {
    const matchingSchemas = [];
    doc.validate(schema, matchingSchemas, node.start);
    return matchingSchemas;
  }
}

/**
 * Contains the SingleYAMLDocuments, to be passed
 * to the `parseYAML` caller.
 */
export class YAMLDocument {
  public documents: SingleYAMLDocument[];
  private errors: YAMLDocDiagnostic[];
  private warnings: YAMLDocDiagnostic[];

  constructor(documents: SingleYAMLDocument[]) {
    this.documents = documents;
    this.errors = [];
    this.warnings = [];
  }
}

interface YamlCachedDocument {
  version: number;
  parserOptions: ParserOptions;
  document: YAMLDocument;
}
export class YamlDocuments {
  // a mapping of URIs to cached documents
  private cache = new Map<string, YamlCachedDocument>();

  /**
   * Get cached YAMLDocument
   * @param document TextDocument to parse
   * @param customTags YAML custom tags
   * @param addRootObject if true and document is empty add empty object {} to force schema usage
   * @returns the YAMLDocument
   */
  getYamlDocument(document: TextDocument, parserOptions?: ParserOptions, addRootObject = false): YAMLDocument {
    this.ensureCache(document, parserOptions ?? defaultOptions, addRootObject);
    return this.cache.get(document.uri).document;
  }

  /**
   * For test purpose only!
   */
  clear(): void {
    this.cache.clear();
  }

  private ensureCache(document: TextDocument, parserOptions: ParserOptions, addRootObject: boolean): void {
    const key = document.uri;
    if (!this.cache.has(key)) {
      this.cache.set(key, { version: -1, document: new YAMLDocument([]), parserOptions: defaultOptions });
    }
    const cacheEntry = this.cache.get(key);
    if (
      cacheEntry.version !== document.version ||
      (parserOptions.customTags && !isArrayEqual(cacheEntry.parserOptions.customTags, parserOptions.customTags))
    ) {
      let text = document.getText();
      // if text is contains only whitespace wrap all text in object to force schema selection
      if (addRootObject && !/\S/.test(text)) {
        text = `{${text}}`;
      }
      const doc = parseYAML(text, parserOptions);
      cacheEntry.document = doc;
      cacheEntry.version = document.version;
      cacheEntry.parserOptions = parserOptions;
    }
  }
}

export const yamlDocumentsCache = new YamlDocuments();

function YAMLErrorToYamlDocDiagnostics(error: YAMLError): YAMLDocDiagnostic {
  return {
    message: error.message,
    location: {
      start: error.pos[0],
      end: error.pos[1],
      toLineEnd: true,
    },
    severity: 1,
    code: ErrorCode.Undefined,
  };
}
