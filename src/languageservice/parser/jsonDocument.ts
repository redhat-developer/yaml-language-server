/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { JSONSchema } from '../jsonSchema';
import {
  ASTNode,
  ObjectASTNode,
  ArrayASTNode,
  BooleanASTNode,
  NumberASTNode,
  StringASTNode,
  NullASTNode,
  PropertyASTNode,
  YamlNode,
} from '../jsonASTTypes';
import { Diagnostic, Range } from 'vscode-languageserver-types';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Node, Pair } from 'yaml';
import { type IApplicableSchema } from './schemaValidation/baseValidator';
import { findNodeAtOffset } from './astUtils';
import { getValidator } from './schemaValidation/validatorFactory';

abstract class ASTNodeImpl {
  public abstract readonly type: 'object' | 'property' | 'array' | 'number' | 'boolean' | 'null' | 'string';

  public offset: number;
  public length: number;
  public readonly parent: ASTNode;
  public location: string;
  readonly internalNode: YamlNode;

  constructor(parent: ASTNode, internalNode: YamlNode, offset: number, length?: number) {
    this.offset = offset;
    this.length = length;
    this.parent = parent;
    this.internalNode = internalNode;
  }

  public getNodeFromOffsetEndInclusive(offset: number): ASTNode {
    const collector = [];
    const findNode = (node: ASTNode | ASTNodeImpl): ASTNode | ASTNodeImpl => {
      if (offset >= node.offset && offset <= node.offset + node.length) {
        const children = node.children;
        for (let i = 0; i < children.length && children[i].offset <= offset; i++) {
          const item = findNode(children[i]);
          if (item) {
            collector.push(item);
          }
        }
        return node;
      }
      return null;
    };
    const foundNode = findNode(this);
    let currMinDist = Number.MAX_VALUE;
    let currMinNode = null;
    for (const currNode of collector) {
      const minDist = currNode.length + currNode.offset - offset + (offset - currNode.offset);
      if (minDist < currMinDist) {
        currMinNode = currNode;
        currMinDist = minDist;
      }
    }
    return currMinNode || foundNode;
  }

  public get children(): ASTNode[] {
    return [];
  }

  public toString(): string {
    return (
      'type: ' +
      this.type +
      ' (' +
      this.offset +
      '/' +
      this.length +
      ')' +
      (this.parent ? ' parent: {' + this.parent.toString() + '}' : '')
    );
  }
}

export class NullASTNodeImpl extends ASTNodeImpl implements NullASTNode {
  public type: 'null' = 'null' as const;
  public value = null;
  constructor(parent: ASTNode, internalNode: Node, offset: number, length?: number) {
    super(parent, internalNode, offset, length);
  }
}

export class BooleanASTNodeImpl extends ASTNodeImpl implements BooleanASTNode {
  public type: 'boolean' = 'boolean' as const;
  public value: boolean;
  public source: string;

  constructor(parent: ASTNode, internalNode: Node, boolValue: boolean, boolSource: string, offset: number, length?: number) {
    super(parent, internalNode, offset, length);
    this.value = boolValue;
    this.source = boolSource;
  }
}

export class ArrayASTNodeImpl extends ASTNodeImpl implements ArrayASTNode {
  public type: 'array' = 'array' as const;
  public items: ASTNode[];

  constructor(parent: ASTNode, internalNode: Node, offset: number, length?: number) {
    super(parent, internalNode, offset, length);
    this.items = [];
  }

  public get children(): ASTNode[] {
    return this.items;
  }
}

export class NumberASTNodeImpl extends ASTNodeImpl implements NumberASTNode {
  public type: 'number' = 'number' as const;
  public isInteger: boolean;
  public value: number;

  constructor(parent: ASTNode, internalNode: Node, offset: number, length?: number) {
    super(parent, internalNode, offset, length);
    this.isInteger = true;
    this.value = Number.NaN;
  }
}

export class StringASTNodeImpl extends ASTNodeImpl implements StringASTNode {
  public type: 'string' = 'string' as const;
  public value: string;

  constructor(parent: ASTNode, internalNode: Node, offset: number, length?: number) {
    super(parent, internalNode, offset, length);
    this.value = '';
  }
}

export class PropertyASTNodeImpl extends ASTNodeImpl implements PropertyASTNode {
  public type: 'property' = 'property' as const;
  public keyNode: StringASTNode;
  public valueNode: ASTNode;
  public colonOffset: number;

  constructor(parent: ObjectASTNode, internalNode: Pair, offset: number, length?: number) {
    super(parent, internalNode, offset, length);
    this.colonOffset = -1;
  }

  public get children(): ASTNode[] {
    return this.valueNode ? [this.keyNode, this.valueNode] : [this.keyNode];
  }
}

export class ObjectASTNodeImpl extends ASTNodeImpl implements ObjectASTNode {
  public type: 'object' = 'object' as const;
  public properties: PropertyASTNode[];

  constructor(parent: ASTNode, internalNode: Node, offset: number, length?: number) {
    super(parent, internalNode, offset, length);

    this.properties = [];
  }

  public get children(): ASTNode[] {
    return this.properties;
  }
}

export interface JSONDocumentConfig {
  collectComments?: boolean;
}

export enum EnumMatch {
  Key,
  Enum,
}

export function newJSONDocument(root: ASTNode, diagnostics: Diagnostic[] = []): JSONDocument {
  return new JSONDocument(root, diagnostics, []);
}

export class JSONDocument {
  public isKubernetes: boolean;
  public disableAdditionalProperties: boolean;
  public uri: string;

  constructor(
    public readonly root: ASTNode,
    public readonly syntaxErrors: Diagnostic[] = [],
    public readonly comments: Range[] = []
  ) {}

  public getNodeFromOffset(offset: number, includeRightBound = false): ASTNode | undefined {
    if (this.root) {
      return findNodeAtOffset(this.root, offset, includeRightBound);
    }
    return undefined;
  }

  public getNodeFromOffsetEndInclusive(offset: number): ASTNode {
    return this.root && this.root.getNodeFromOffsetEndInclusive(offset);
  }

  public visit(visitor: (node: ASTNode) => boolean): void {
    if (this.root) {
      const doVisit = (node: ASTNode): boolean => {
        let ctn = visitor(node);
        const children = node.children;
        if (Array.isArray(children)) {
          for (let i = 0; i < children.length && ctn; i++) {
            ctn = doVisit(children[i]);
          }
        }
        return ctn;
      };
      doVisit(this.root);
    }
  }

  public validate(textDocument: TextDocument, schema: JSONSchema): Diagnostic[] {
    if (!this.root || !schema) return null;

    const validator = getValidator(schema._dialect);
    return validator.validateDocument(this.root, textDocument, schema, {
      isKubernetes: this.isKubernetes,
      disableAdditionalProperties: this.disableAdditionalProperties,
      uri: this.uri,
    });
  }

  public getMatchingSchemas(
    schema: JSONSchema,
    focusOffset = -1,
    exclude: ASTNode = null,
    didCallFromAutoComplete?: boolean
  ): IApplicableSchema[] {
    if (!this.root || !schema) return [];

    const validator = getValidator(schema._dialect);
    return validator.getMatchingSchemas(
      this.root,
      schema,
      {
        isKubernetes: this.isKubernetes,
        disableAdditionalProperties: this.disableAdditionalProperties,
        uri: this.uri,
        callFromAutoComplete: didCallFromAutoComplete,
      },
      focusOffset,
      exclude
    );
  }
}
