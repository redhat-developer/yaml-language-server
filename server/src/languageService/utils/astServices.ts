
import {YAMLNode, Kind, YAMLScalar, YAMLSequence, YAMLMapping, YamlMap, YAMLAnchorReference} from  'yaml-ast-parser';

export function traverse ( node: YAMLNode, visitor:ASTVisitor){
  if(!node || !visitor) return;
  switch(node.kind){
    case Kind.SCALAR:
      let scalar = <YAMLScalar> node;
      visitor.visit(scalar);
      break;
    case Kind.SEQ:
      let seq = <YAMLSequence> node;
      visitor.visit(seq);
      seq.items.forEach(item=>{
          traverse(item,visitor);
      });
      break;
    case Kind.MAPPING:
      let mapping = <YAMLMapping> node;
      visitor.visit(mapping)
      traverse(mapping.value,visitor);
      break;
    case Kind.MAP:
      let map = <YamlMap> node;
      visitor.visit(map);
      map.mappings.forEach(mapping=>{
        traverse(mapping,visitor);
      });
      break;
    case Kind.ANCHOR_REF:
      let anchor = <YAMLAnchorReference> node;
      visitor.visit(anchor)
      traverse(anchor.value,visitor);      
      break
  }
}

export class ASTVisitor{
  public visit(node: YAMLNode) : boolean {
    return true;
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
