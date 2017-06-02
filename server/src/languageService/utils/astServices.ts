
import {YAMLNode, Kind, YAMLScalar, YAMLSequence, YAMLMapping, YamlMap, YAMLAnchorReference} from  'yaml-ast-parser';

export function traverse ( node: YAMLNode, visitor:ASTVisitor){
  if(!node || !visitor) return;
  visitor.traverseBackToLocation(node);
}

export class ASTVisitor{
  public visit(node: YAMLNode) : boolean {
    return true;
  };
  public traverseBackToLocation(node: YAMLNode){
    return null;
  }
}

export function findNode(node:YAMLNode, offset: number): YAMLNode {
  let lastNode:YAMLNode;
  class Finder extends ASTVisitor {
      visit(node:YAMLNode):boolean{
        if(node.endPosition > offset  && node.startPosition < offset){
          lastNode=node;
          return true;
        }
        return false;
      }
  }
  traverse(node, new Finder());
  return lastNode;
}

/**
 * Traverse up the ast getting the parent node names in the order of parent to root.
 * @param {YAMLNode} node - The node to use
 */
export function getParentNodes(node:YAMLNode){
  
  if(!node){
    return [];
  }

  let holderNode = node;

  let parentNodeArray = [];
  
  while(holderNode.parent != null && holderNode.parent != holderNode){

    //When there is a parent key value we can add it
    if(typeof holderNode.parent.key != "undefined"){
      parentNodeArray.push(holderNode.parent.key.value);
    }

    holderNode = holderNode.parent;
  
  }

  return parentNodeArray;

}
