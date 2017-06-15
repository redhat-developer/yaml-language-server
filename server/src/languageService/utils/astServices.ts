
import {YAMLNode, Kind, YAMLScalar, YAMLSequence, YAMLMapping, YamlMap, YAMLAnchorReference} from  'yaml-ast-parser';

export function traverse ( node: YAMLNode, visitor:ASTVisitor){
  if(!node || !visitor) return;
  switch(node.kind){
    case Kind.SCALAR:
      let scalar = <YAMLScalar> node;
      if (visitor.visit(scalar)){
      }
      break;
    case Kind.SEQ:
      let seq = <YAMLSequence> node;
      if(visitor.visit(seq)){
        seq.items.forEach(item=>{
            traverse(item,visitor);
        })
      }
      break;
    case Kind.MAPPING:
      let mapping = <YAMLMapping> node;
      if(visitor.visit(mapping)){
        traverse(mapping.value,visitor);
      }
      break;
    case Kind.MAP:
      let map = <YamlMap> node;
      if(visitor.visit(map)){
        map.mappings.forEach(mapping=>{
          traverse(mapping,visitor);
        })
      }
      break;
    case Kind.ANCHOR_REF:
      let anchor = <YAMLAnchorReference> node;
      if(visitor.visit(anchor)){
        traverse(anchor.value,visitor);
      }
      break
  }
}
export class ASTVisitor{
  public visit(node: YAMLNode) : boolean {
    return true;
  };
  public traverseBackToLocation(node: YAMLNode): void{
  }
}

export function findNode(node:YAMLNode, offset: number): YAMLNode {
  let lastNode:YAMLNode;
  class Finder extends ASTVisitor {
      visit(node:YAMLNode):boolean {
        if(node.endPosition >= offset  && node.startPosition < offset){
          lastNode=node;
          return true;
        }
        return false;
      }
  }
  traverse(node, new Finder());
  return lastNode;
}

export class ASTHelper {
  
  private addr = [];
  private parentAddr = [];
  
  public getChildrenNodes(node: YAMLNode, depth){
    if(!node || depth > 1) return;
    switch(node.kind){
      case Kind.SCALAR:
        return [];
      case Kind.SEQ:
        let seq = <YAMLSequence> node;
        if(seq.items.length > 0){
          seq.items.forEach(item=>{
            this.getChildrenNodes(item, depth);
          });
        }
        break;
      case Kind.MAPPING:
        let mapping = <YAMLMapping> node;
        this.addr.push(mapping.key); 
        this.getChildrenNodes(mapping.value, depth+1);
        break;
      case Kind.MAP:
        let map = <YamlMap> node;
        if(map.mappings !== undefined && map.mappings.length > 0 && depth <= 1){
          map.mappings.forEach(mapping=>{
            this.getChildrenNodes(mapping, depth);
          });
        }
        break;
      case Kind.ANCHOR_REF:
        let anchor = <YAMLAnchorReference> node;
        this.getChildrenNodes(anchor.value, depth);
        break;
      }
    }  

/**
 * Traverse up the ast getting the parent node names in the order of parent to root.
 * @param {YAMLNode} node - The node to use
 */
public getParentNodes(node:YAMLNode){
  
    if(!node || !node.parent) return;

    switch(node.kind){
      case Kind.SCALAR:
        let scalar = <YAMLScalar> node;
        this.getParentNodes(scalar.parent);
      case Kind.SEQ:
        let seq = <YAMLSequence> node;
        if(seq.items.length > 0){
          seq.items.forEach(item=>{
            this.getParentNodes(item);
          });
        }
        break;
      case Kind.MAPPING:
        let mapping = <YAMLMapping> node;
        this.parentAddr.push(mapping.key.value);
        this.getParentNodes(mapping.parent);
        break;
      case Kind.MAP:
        let map = <YamlMap> node;
        this.getParentNodes(map.parent); 
        break;
      case Kind.ANCHOR_REF:
        let anchor = <YAMLAnchorReference> node;
        this.getParentNodes(anchor.value);
        break;
    }

}

  public getAddr(){
    return this.addr;
  }

  public getParentAddr(){
    return this.parentAddr;
  }

}