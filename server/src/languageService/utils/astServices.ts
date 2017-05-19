
import {YAMLNode, Kind, YAMLScalar, YAMLSequence, YAMLMapping, YamlMap, YAMLAnchorReference} from  'yaml-ast-parser';

export function traverse ( node: YAMLNode, visitor:ASTVisitor){
  if(!node || !visitor) return;
  switch(node.kind){
    case Kind.SCALAR:
      let scalar = <YAMLScalar> node;
      if (visitor.visit(scalar)){
        visitor.endVisit(scalar);
      }
      break;
    case Kind.SEQ:
      let seq = <YAMLSequence> node;
      if(visitor.visit(seq)){
        seq.items.forEach(item=>{
            traverse(item,visitor);
        })
        visitor.endVisit(seq);
      }
      break;
    case Kind.MAPPING:
      let mapping = <YAMLMapping> node;
      if(visitor.visit(mapping)){
        traverse(mapping.value,visitor);
        visitor.endVisit(mapping)
      }
      break;
    case Kind.MAP:
      let map = <YamlMap> node;
      if(visitor.visit(map)){
        map.mappings.forEach(mapping=>{
          traverse(mapping,visitor);
        })
        visitor.endVisit(map);
      }
      break;
    case Kind.ANCHOR_REF:
      let anchor = <YAMLAnchorReference> node;
      if(visitor.visit(anchor)){
        traverse(anchor.value,visitor);
        visitor.endVisit(anchor);
      }
      break
  }
}

export class ASTVisitor{
  public visit(node: YAMLNode) : boolean {
    return true;
  };
  public endVisit(node: YAMLNode) : void{
  };
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
