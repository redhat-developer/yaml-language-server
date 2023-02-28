/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import { JSONDocument } from './jsonParser07';
import { Document, isNode, isPair, isScalar, LineCounter, Node, visit, YAMLError } from 'yaml';
import { ASTNode, YamlNode } from '../jsonASTTypes';
import { defaultOptions, parse as parseYAML, ParserOptions } from './yamlParser07';
import { ErrorCode } from 'vscode-json-languageservice';
import { convertAST } from './ast-converter';
import { YAMLDocDiagnostic } from '../utils/parseUtils';
import { isArrayEqual } from '../utils/arrUtils';
import { getParent } from '../utils/astUtils';
import { TextBuffer } from '../utils/textBuffer';
import { getIndentation } from '../utils/strings';
import { Token } from 'yaml/dist/parse/cst';

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

  /**
   * Create a deep copy of this document
   */
  clone(): SingleYAMLDocument {
    const copy = new SingleYAMLDocument(this.lineCounter);
    copy.isKubernetes = this.isKubernetes;
    copy.disableAdditionalProperties = this.disableAdditionalProperties;
    copy.uri = this.uri;
    copy.currentDocIndex = this.currentDocIndex;
    copy._lineComments = this.lineComments.slice();
    // this will re-create root node
    copy.internalDocument = this._internalDocument.clone();
    return copy;
  }

  private collectLineComments(): void {
    this._lineComments = [];
    if (this._internalDocument.commentBefore) {
      const comments = this._internalDocument.commentBefore.split('\n');
      comments.forEach((comment) => this._lineComments.push(`#${comment}`));
    }
    visit(this.internalDocument, (_key, node: Node) => {
      if (node?.commentBefore) {
        const comments = node?.commentBefore.split('\n');
        comments.forEach((comment) => this._lineComments.push(`#${comment}`));
      }

      if (node?.comment) {
        this._lineComments.push(`#${node.comment}`);
      }
    });

    if (this._internalDocument.comment) {
      this._lineComments.push(`#${this._internalDocument.comment}`);
    }
  }
  /**
   * Updates the internal AST tree of the object
   * from the internal node. This is call whenever the
   * internalDocument is set but also can be called to
   * reflect any changes on the underlying document
   * without setting the internalDocument explicitly.
   */
  public updateFromInternalDocument(): void {
    this.root = convertAST(null, this._internalDocument.contents as Node, this._internalDocument, this.lineCounter);
  }

  set internalDocument(document: Document) {
    this._internalDocument = document;
    this.updateFromInternalDocument();
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

  getNodeFromPosition(
    positionOffset: number,
    textBuffer: TextBuffer,
    configuredIndentation?: number
  ): [YamlNode | undefined, boolean] {
    const position = textBuffer.getPosition(positionOffset);
    const lineContent = textBuffer.getLineContent(position.line);
    if (lineContent.trim().length === 0) {
      return [this.findClosestNode(positionOffset, textBuffer, configuredIndentation), true];
    }

    const textAfterPosition = lineContent.substring(position.character);
    const spacesAfterPositionMatch = textAfterPosition.match(/^([ ]+)\n?$/);
    const areOnlySpacesAfterPosition = !!spacesAfterPositionMatch;
    const countOfSpacesAfterPosition = spacesAfterPositionMatch?.[1].length;
    let closestNode: Node;
    visit(this.internalDocument, (key, node: Node) => {
      if (!node) {
        return;
      }
      const range = node.range;
      if (!range) {
        return;
      }

      const isNullNodeOnTheLine = (): boolean =>
        areOnlySpacesAfterPosition &&
        positionOffset + countOfSpacesAfterPosition === range[2] &&
        isScalar(node) &&
        node.value === null;

      if ((range[0] <= positionOffset && range[1] >= positionOffset) || isNullNodeOnTheLine()) {
        closestNode = node;
      } else {
        return visit.SKIP;
      }
    });

    return [closestNode, false];
  }

  findClosestNode(offset: number, textBuffer: TextBuffer, configuredIndentation?: number): YamlNode {
    let offsetDiff = this.internalDocument.range[2];
    let maxOffset = this.internalDocument.range[0];
    let closestNode: YamlNode;
    visit(this.internalDocument, (key, node: Node) => {
      if (!node) {
        return;
      }
      const range = node.range;
      if (!range) {
        return;
      }
      const diff = range[1] - offset;
      if (maxOffset <= range[0] && diff <= 0 && Math.abs(diff) <= offsetDiff) {
        offsetDiff = Math.abs(diff);
        maxOffset = range[0];
        closestNode = node;
      }
    });

    const position = textBuffer.getPosition(offset);
    const lineContent = textBuffer.getLineContent(position.line);
    const indentation = getIndentation(lineContent, position.character);

    if (isScalar(closestNode) && closestNode.value === null) {
      return closestNode;
    }

    if (indentation === position.character) {
      closestNode = this.getProperParentByIndentation(indentation, closestNode, textBuffer, '', configuredIndentation);
    }

    return closestNode;
  }

  private getProperParentByIndentation(
    indentation: number,
    node: YamlNode,
    textBuffer: TextBuffer,
    currentLine: string,
    configuredIndentation: number,
    rootParent?: YamlNode
  ): YamlNode {
    if (!node) {
      return this.internalDocument.contents as Node;
    }
    configuredIndentation = !configuredIndentation ? 2 : configuredIndentation;
    if (isNode(node) && node.range) {
      const position = textBuffer.getPosition(node.range[0]);
      const lineContent = textBuffer.getLineContent(position.line);
      currentLine = currentLine === '' ? lineContent.trim() : currentLine;
      if (currentLine.startsWith('-') && indentation === configuredIndentation && currentLine === lineContent.trim()) {
        position.character += indentation;
      }
      if (position.character > indentation && position.character > 0) {
        const parent = this.getParent(node);
        if (parent) {
          return this.getProperParentByIndentation(
            indentation,
            parent,
            textBuffer,
            currentLine,
            configuredIndentation,
            rootParent
          );
        }
      } else if (position.character < indentation) {
        const parent = this.getParent(node);
        if (isPair(parent) && isNode(parent.value)) {
          return parent.value;
        } else if (isPair(rootParent) && isNode(rootParent.value)) {
          return rootParent.value;
        }
      } else {
        return node;
      }
    } else if (isPair(node)) {
      rootParent = node;
      const parent = this.getParent(node);
      return this.getProperParentByIndentation(indentation, parent, textBuffer, currentLine, configuredIndentation, rootParent);
    }
    return node;
  }

  getParent(node: YamlNode): YamlNode | undefined {
    return getParent(this.internalDocument, node);
  }
}

/**
 * Contains the SingleYAMLDocuments, to be passed
 * to the `parseYAML` caller.
 */
export class YAMLDocument {
  documents: SingleYAMLDocument[];
  tokens: Token[];

  private errors: YAMLDocDiagnostic[];
  private warnings: YAMLDocDiagnostic[];

  constructor(documents: SingleYAMLDocument[], tokens: Token[]) {
    this.documents = documents;
    this.tokens = tokens;
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
   * @param parserOptions YAML parserOptions
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
      this.cache.set(key, { version: -1, document: new YAMLDocument([], []), parserOptions: defaultOptions });
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
      const doc = parseYAML(text, parserOptions, document);
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
