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

export function convertAST(parent: ASTNode, node: Node, doc: Document, lineCounter: LineCounter): ASTNode {
  if (!node) {
    return;
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
  if (isAlias(node)) {
    return convertAlias(node, parent);
  }
}

function convertMap(node: YAMLMap<unknown, unknown>, parent: ASTNode, doc: Document, lineCounter: LineCounter): ASTNode {
  const result = new ObjectASTNodeImpl(parent, ...toFixedOffsetLength(node.range, lineCounter));
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
    ...toFixedOffsetLength([rangeStart, rangeEnd, nodeEnd], lineCounter)
  );
  result.keyNode = <StringASTNodeImpl>convertAST(result, keyNode, doc, lineCounter);
  result.valueNode = convertAST(result, valueNode, doc, lineCounter);
  return result;
}

function convertSeq(node: YAMLSeq, parent: ASTNode, doc: Document, lineCounter: LineCounter): ASTNode {
  const result = new ArrayASTNodeImpl(parent, ...toOffsetLength(node.range));
  for (const it of node.items) {
    if (isNode(it)) {
      result.children.push(convertAST(result, it, doc, lineCounter));
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

function convertAlias(node: Alias, parent: ASTNode): ASTNode {
  //node.resolve() will break Document Symbols as selection range will be not inside Symbol range
  // to be compatible with JSON AST
  const result = new StringASTNodeImpl(parent, ...toOffsetLength(node.range));
  result.value = node.source;
  return result;
}

function toOffsetLength(range: [number, number, number]): [number, number] {
  return [range[0], range[1] - range[0]];
}

/**
 * Convert offsets to offset+length with fix length to not include '\n' character in some cases
 * @param range the yaml ast range
 * @param lineCounter the line counter
 * @returns the offset and length
 */
function toFixedOffsetLength(range: [number, number, number], lineCounter: LineCounter): [number, number] {
  const start = lineCounter.linePos(range[0]);
  const end = lineCounter.linePos(range[1]);

  const result: [number, number] = [range[0], range[1] - range[0]];
  // -1 as range may include '\n'
  if (start.line !== end.line && (lineCounter.lineStarts.length !== end.line || end.col === 1)) {
    result[1]--;
  }

  return result;
}
