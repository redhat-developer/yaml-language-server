/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  Node,
  isScalar,
  Scalar,
  isMap,
  YAMLMap,
  isPair,
  Pair,
  isSeq,
  YAMLSeq,
  isNode,
  isAlias,
  Alias,
  Document,
  LineCounter,
} from 'yaml';
import { ASTNode, YamlNode } from '../jsonASTTypes';
import {
  NullASTNodeImpl,
  PropertyASTNodeImpl,
  StringASTNodeImpl,
  ObjectASTNodeImpl,
  NumberASTNodeImpl,
  ArrayASTNodeImpl,
  BooleanASTNodeImpl,
} from './jsonParser07';

type NodeRange = [number, number, number];

const maxRefCount = 1000;
let refDepth = 0;
const seenAlias = new Set<Alias>();

export function convertAST(parent: ASTNode, node: YamlNode, doc: Document, lineCounter: LineCounter): ASTNode | undefined {
  if (!parent) {
    // first invocation
    refDepth = 0;
  }

  if (!node) {
    return null;
  }
  if (isMap(node)) {
    return convertMap(node, parent, doc, lineCounter);
  }
  if (isPair(node)) {
    return convertPair(node, parent, doc, lineCounter);
  }
  if (isSeq(node)) {
    return convertSeq(node, parent, doc, lineCounter);
  }
  if (isScalar(node)) {
    return convertScalar(node, parent);
  }
  if (isAlias(node) && !seenAlias.has(node) && refDepth < maxRefCount) {
    seenAlias.add(node);
    const converted = convertAlias(node, parent, doc, lineCounter);
    seenAlias.delete(node);
    return converted;
  } else {
    return;
  }
}

function convertMap(node: YAMLMap<unknown, unknown>, parent: ASTNode, doc: Document, lineCounter: LineCounter): ASTNode {
  let range: NodeRange;
  if (node.flow && !node.range) {
    range = collectFlowMapRange(node);
  } else {
    range = node.range;
  }
  const result = new ObjectASTNodeImpl(parent, node, ...toFixedOffsetLength(range, lineCounter));
  for (const it of node.items) {
    if (isPair(it)) {
      result.properties.push(<PropertyASTNodeImpl>convertAST(result, it, doc, lineCounter));
    }
  }
  return result;
}

function convertPair(node: Pair, parent: ASTNode, doc: Document, lineCounter: LineCounter): ASTNode {
  const keyNode = <Node>node.key;
  const valueNode = <Node>node.value;
  const rangeStart = keyNode.range[0];
  let rangeEnd = keyNode.range[1];
  let nodeEnd = keyNode.range[2];
  if (valueNode) {
    rangeEnd = valueNode.range[1];
    nodeEnd = valueNode.range[2];
  }

  // Pair does not return a range using the key/value ranges to fake one.
  const result = new PropertyASTNodeImpl(
    parent as ObjectASTNodeImpl,
    node,
    ...toFixedOffsetLength([rangeStart, rangeEnd, nodeEnd], lineCounter)
  );
  if (isAlias(keyNode)) {
    const keyAlias = new StringASTNodeImpl(parent, keyNode, ...toOffsetLength(keyNode.range));
    keyAlias.value = keyNode.source;
    result.keyNode = keyAlias;
  } else {
    result.keyNode = <StringASTNodeImpl>convertAST(result, keyNode, doc, lineCounter);
  }
  result.valueNode = convertAST(result, valueNode, doc, lineCounter);
  return result;
}

function convertSeq(node: YAMLSeq, parent: ASTNode, doc: Document, lineCounter: LineCounter): ASTNode {
  const result = new ArrayASTNodeImpl(parent, node, ...toOffsetLength(node.range));
  for (const it of node.items) {
    if (isNode(it)) {
      const convertedNode = convertAST(result, it, doc, lineCounter);
      // due to recursion protection, convertAST may return undefined
      if (convertedNode) {
        result.children.push(convertedNode);
      }
    }
  }
  return result;
}

function convertScalar(node: Scalar, parent: ASTNode): ASTNode {
  if (node.value === null) {
    return new NullASTNodeImpl(parent, node, ...toOffsetLength(node.range));
  }

  switch (typeof node.value) {
    case 'string': {
      const result = new StringASTNodeImpl(parent, node, ...toOffsetLength(node.range));
      result.value = node.value;
      return result;
    }
    case 'boolean':
      return new BooleanASTNodeImpl(parent, node, node.value, ...toOffsetLength(node.range));
    case 'number': {
      const result = new NumberASTNodeImpl(parent, node, ...toOffsetLength(node.range));
      result.value = node.value;
      result.isInteger = Number.isInteger(result.value);
      return result;
    }
    default: {
      // fail safe converting, we need to return some node anyway
      const result = new StringASTNodeImpl(parent, node, ...toOffsetLength(node.range));
      result.value = node.source;
      return result;
    }
  }
}

function convertAlias(node: Alias, parent: ASTNode, doc: Document, lineCounter: LineCounter): ASTNode {
  refDepth++;
  const resolvedNode = node.resolve(doc);
  if (resolvedNode) {
    return convertAST(parent, resolvedNode, doc, lineCounter);
  } else {
    const resultNode = new StringASTNodeImpl(parent, node, ...toOffsetLength(node.range));
    resultNode.value = node.source;
    return resultNode;
  }
}

export function toOffsetLength(range: NodeRange): [number, number] {
  return [range[0], range[1] - range[0]];
}

/**
 * Convert offsets to offset+length with fix length to not include '\n' character in some cases
 * @param range the yaml ast range
 * @param lineCounter the line counter
 * @returns the offset and length
 */
function toFixedOffsetLength(range: NodeRange, lineCounter: LineCounter): [number, number] {
  const start = lineCounter.linePos(range[0]);
  const end = lineCounter.linePos(range[1]);

  const result: [number, number] = [range[0], range[1] - range[0]];
  // -1 as range may include '\n'
  if (start.line !== end.line && (lineCounter.lineStarts.length !== end.line || end.col === 1)) {
    result[1]--;
  }

  return result;
}

function collectFlowMapRange(node: YAMLMap): NodeRange {
  let start = Number.MAX_SAFE_INTEGER;
  let end = 0;
  for (const it of node.items) {
    if (isPair(it)) {
      if (isNode(it.key)) {
        if (it.key.range && it.key.range[0] <= start) {
          start = it.key.range[0];
        }
      }

      if (isNode(it.value)) {
        if (it.value.range && it.value.range[2] >= end) {
          end = it.value.range[2];
        }
      }
    }
  }

  return [start, end, end];
}
