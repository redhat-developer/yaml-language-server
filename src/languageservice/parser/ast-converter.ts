import { Node, isScalar, Scalar, isMap, YAMLMap, isPair, Pair, isSeq, YAMLSeq, isNode, isAlias, Alias, Document } from 'yaml';
import { ASTNode } from '../jsonASTTypes';
import {
  NullASTNodeImpl,
  PropertyASTNodeImpl,
  StringASTNodeImpl,
  ObjectASTNodeImpl,
  NumberASTNodeImpl,
  ArrayASTNodeImpl,
  BooleanASTNodeImpl,
} from './jsonParser07';
import { Doc } from 'prettier';

export function convertAST(parent: ASTNode, node: Node, doc: Document): ASTNode {
  if (!node) {
    return;
  }
  if (isMap(node)) {
    return convertMap(node, parent, doc);
  }
  if (isPair(node)) {
    return convertPair(node, parent, doc);
  }
  if (isSeq(node)) {
    return convertSeq(node, parent, doc);
  }
  if (isScalar(node)) {
    return convertScalar(node, parent);
  }
  if (isAlias(node)) {
    return convertAlias(node, parent, doc);
  }
}

function convertMap(node: YAMLMap<unknown, unknown>, parent: ASTNode, doc: Document): ASTNode {
  const result = new ObjectASTNodeImpl(parent, ...toOffsetLength(node.range));
  for (const it of node.items) {
    if (isPair(it)) {
      result.properties.push(<PropertyASTNodeImpl>convertAST(result, it, doc));
    }
  }
  return result;
}

function convertPair(node: Pair, parent: ASTNode, doc: Document): ASTNode {
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
  const result = new PropertyASTNodeImpl(parent as ObjectASTNodeImpl, ...toOffsetLength([rangeStart, rangeEnd, nodeEnd]));
  result.keyNode = <StringASTNodeImpl>convertAST(result, keyNode, doc);
  result.valueNode = convertAST(result, valueNode, doc);
  return result;
}

function convertSeq(node: YAMLSeq, parent: ASTNode, doc: Document): ASTNode {
  const result = new ArrayASTNodeImpl(parent, ...toOffsetLength(node.range));
  for (const it of node.items) {
    if (isNode(it)) {
      result.children.push(convertAST(result, it, doc));
    }
  }
  return result;
}

function convertScalar(node: Scalar, parent: ASTNode): ASTNode {
  if (node.value === null) {
    return new NullASTNodeImpl(parent, ...toOffsetLength(node.range));
  }

  switch (typeof node.value) {
    case 'string': {
      const result = new StringASTNodeImpl(parent, ...toOffsetLength(node.range));
      result.value = node.value;
      return result;
    }
    case 'boolean':
      return new BooleanASTNodeImpl(parent, node.value, ...toOffsetLength(node.range));
    case 'number': {
      const result = new NumberASTNodeImpl(parent, ...toOffsetLength(node.range));
      result.value = node.value;
      result.isInteger = Number.isInteger(result.value);
      return result;
    }
  }
}

function convertAlias(node: Alias, parent: ASTNode, doc: Document): ASTNode {
  return convertAST(parent, node.resolve(doc), doc);
}

function toOffsetLength(range: [number, number, number]): [number, number] {
  return [range[0], range[1] - range[0]];
}
