import type { ASTNode } from '../jsonASTTypes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getNodeValue(node: ASTNode): any {
  switch (node.type) {
    case 'array':
      return node.children.map(getNodeValue);
    case 'object': {
      const obj = Object.create(null);
      for (let _i = 0, _a = node.children; _i < _a.length; _i++) {
        const prop = _a[_i];
        const valueNode = prop.children[1];
        if (valueNode) {
          obj[prop.children[0].value as string] = getNodeValue(valueNode);
        }
      }
      return obj;
    }
    case 'null':
    case 'string':
    case 'number':
      return node.value;
    case 'boolean':
      return node.source;
    default:
      return undefined;
  }
}

export function contains(node: ASTNode, offset: number, includeRightBound = false): boolean {
  return (
    (offset >= node.offset && offset <= node.offset + node.length) || (includeRightBound && offset === node.offset + node.length)
  );
}

export function findNodeAtOffset(node: ASTNode, offset: number, includeRightBound: boolean): ASTNode {
  if (includeRightBound === void 0) {
    includeRightBound = false;
  }
  if (contains(node, offset, includeRightBound)) {
    const children = node.children;
    if (Array.isArray(children)) {
      for (let i = 0; i < children.length && children[i].offset <= offset; i++) {
        const item = findNodeAtOffset(children[i], offset, includeRightBound);
        if (item) {
          return item;
        }
      }
    }
    return node;
  }
  return undefined;
}
