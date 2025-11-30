/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Range, WorkspaceEdit, TextEdit } from 'vscode-languageserver-types';
import { yamlDocumentsCache } from '../parser/yaml-documents';
import { matchOffsetToDocument } from '../utils/arrUtils';
import { TextBuffer } from '../utils/textBuffer';
import { Telemetry } from '../telemetry';
import { CST, isAlias, isCollection, isScalar, visit, Node } from 'yaml';
import { SourceToken, CollectionItem } from 'yaml/dist/parse/cst';
import { SingleYAMLDocument } from '../parser/yamlParser07';
import { isCollectionItem } from '../utils/astUtils';
import { PrepareRenameParams, RenameParams } from 'vscode-languageserver-protocol';

interface RenameTarget {
  anchorNode: Node;
  token: SourceToken;
  yamlDoc: SingleYAMLDocument;
}

export class YamlRename {
  constructor(private readonly telemetry?: Telemetry) {}

  prepareRename(document: TextDocument, params: PrepareRenameParams): Range | null {
    try {
      const target = this.findTarget(document, params.position);
      if (!target) {
        return null;
      }
      if (!this.findAnchorToken(target.yamlDoc, target.anchorNode)) {
        return null;
      }
      return this.getNameRange(document, target.token);
    } catch (err) {
      this.telemetry?.sendError('yaml.prepareRename.error', err);
      return null;
    }
  }

  doRename(document: TextDocument, params: RenameParams): WorkspaceEdit | null {
    try {
      const target = this.findTarget(document, params.position);
      if (!target) {
        return null;
      }

      const anchorToken = this.findAnchorToken(target.yamlDoc, target.anchorNode);
      if (!anchorToken) {
        return null;
      }

      const normalizedNewName = this.normalizeName(params.newName);
      const edits: TextEdit[] = [];

      edits.push(TextEdit.replace(this.getNameRange(document, anchorToken), normalizedNewName));

      visit(target.yamlDoc.internalDocument, (key, node) => {
        if (isAlias(node) && node.srcToken && node.resolve(target.yamlDoc.internalDocument) === target.anchorNode) {
          edits.push(TextEdit.replace(this.getNameRange(document, node.srcToken as SourceToken), normalizedNewName));
        }
      });

      if (edits.length === 0) {
        return null;
      }

      return {
        changes: {
          [document.uri]: edits,
        },
      };
    } catch (err) {
      this.telemetry?.sendError('yaml.rename.error', err);
      return null;
    }
  }

  private findTarget(document: TextDocument, position: Position): RenameTarget | null {
    const yamlDocuments = yamlDocumentsCache.getYamlDocument(document);
    const offset = document.offsetAt(position);
    const yamlDoc = matchOffsetToDocument(offset, yamlDocuments);
    if (!yamlDoc) {
      return null;
    }

    const [node] = yamlDoc.getNodeFromPosition(offset, new TextBuffer(document));
    if (!node) {
      return this.findByToken(yamlDoc, offset);
    }

    if (isAlias(node) && node.srcToken && this.isOffsetInsideToken(node.srcToken as SourceToken, offset)) {
      const anchorNode = node.resolve(yamlDoc.internalDocument);
      if (!anchorNode) {
        return null;
      }
      return { anchorNode, token: node.srcToken as SourceToken, yamlDoc };
    }

    if ((isCollection(node) || isScalar(node)) && node.anchor) {
      const anchorToken = this.findAnchorToken(yamlDoc, node);
      if (anchorToken && this.isOffsetInsideToken(anchorToken, offset)) {
        return { anchorNode: node, token: anchorToken, yamlDoc };
      }
    }

    return this.findByToken(yamlDoc, offset);
  }

  private findByToken(yamlDoc: SingleYAMLDocument, offset: number): RenameTarget | null {
    let target: RenameTarget;
    visit(yamlDoc.internalDocument, (key, node) => {
      if (isAlias(node) && node.srcToken && this.isOffsetInsideToken(node.srcToken as SourceToken, offset)) {
        const anchorNode = node.resolve(yamlDoc.internalDocument);
        if (anchorNode) {
          target = { anchorNode, token: node.srcToken as SourceToken, yamlDoc };
          return visit.BREAK;
        }
      }
      if ((isCollection(node) || isScalar(node)) && node.anchor) {
        const anchorToken = this.findAnchorToken(yamlDoc, node);
        if (anchorToken && this.isOffsetInsideToken(anchorToken, offset)) {
          target = { anchorNode: node, token: anchorToken, yamlDoc };
          return visit.BREAK;
        }
      }
    });

    return target ?? null;
  }

  private findAnchorToken(yamlDoc: SingleYAMLDocument, node: Node): SourceToken | undefined {
    const parent = yamlDoc.getParent(node);
    const candidates = [];
    if (parent && (parent as unknown as { srcToken?: SourceToken }).srcToken) {
      candidates.push((parent as unknown as { srcToken: SourceToken }).srcToken);
    }
    if ((node as unknown as { srcToken?: SourceToken }).srcToken) {
      candidates.push((node as unknown as { srcToken: SourceToken }).srcToken);
    }

    for (const token of candidates) {
      const anchor = this.getAnchorFromToken(token, node);
      if (anchor) {
        return anchor;
      }
    }

    return undefined;
  }

  private getAnchorFromToken(token: SourceToken, node: Node): SourceToken | undefined {
    if (isCollectionItem(token)) {
      return this.getAnchorFromCollectionItem(token);
    } else if (CST.isCollection(token)) {
      const collection = token as unknown as { items?: CollectionItem[] };
      for (const item of collection.items ?? []) {
        if (item.value !== (node as unknown as { srcToken?: SourceToken }).srcToken) {
          continue;
        }
        const anchor = this.getAnchorFromCollectionItem(item);
        if (anchor) {
          return anchor;
        }
      }
    }
    return undefined;
  }

  private getAnchorFromCollectionItem(token: CollectionItem): SourceToken | undefined {
    for (const t of token.start) {
      if (t.type === 'anchor') {
        return t;
      }
    }
    if (token.sep && Array.isArray(token.sep)) {
      for (const t of token.sep) {
        if (t.type === 'anchor') {
          return t;
        }
      }
    }
    return undefined;
  }

  private getNameRange(document: TextDocument, token: SourceToken): Range {
    const startOffset = token.offset + 1;
    const endOffset = token.offset + token.source.length;
    return Range.create(document.positionAt(startOffset), document.positionAt(endOffset));
  }

  private isOffsetInsideToken(token: SourceToken, offset: number): boolean {
    return offset >= token.offset && offset <= token.offset + token.source.length;
  }

  private normalizeName(name: string): string {
    return name.replace(/^([*&])/, '');
  }
}
