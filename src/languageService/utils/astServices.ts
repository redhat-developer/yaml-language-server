/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import {YAMLNode, Kind, YAMLScalar, YAMLSequence, YAMLMapping, YamlMap, YAMLAnchorReference} from  'yaml-ast-parser';

export function traverse (node, visitor:ASTVisitor){
  if(!node || !visitor) return;
  switch(node.type){
    case Kind.SCALAR:
      let scalar = node;
      if (visitor.visit(scalar)){
      }
      break;
    case Kind.SEQ:
      let seq = node;
      if(visitor.visit(seq)){
        seq.items.forEach(item=>{
            traverse(item,visitor);
        })
      }
      break;
    case Kind.MAPPING:
      let mapping = node;
      if(visitor.visit(mapping)){
        traverse(mapping.value,visitor);
      }
      break;
    case Kind.MAP:
      let map = node;
      if(visitor.visit(map)){
        map.mappings.forEach(mapping=>{
          traverse(mapping,visitor);
        })
      }
      break;
    case Kind.ANCHOR_REF:
      let anchor = node;
      if(visitor.visit(anchor)){
        traverse(anchor.value,visitor);
      }
      break
  }
}

export class ASTVisitor{
  public visit(node) : boolean {
    return true;
  };
  public traverseBackToLocation(node): void{
  }
}

export function findNode(node, offset: number) {
  let lastNode;
  class Finder extends ASTVisitor {
      visit(node):boolean {
        if(node.endPosition >= offset && node.startPosition <= offset){
          lastNode=node;
          return true;
        }
        return false;
      }
  }
  traverse(node, new Finder());
  return lastNode;
}

export function generateChildren(node){
    if(!node) return [];
    switch(node.kind){
      case Kind.SCALAR :
        return [];
      case Kind.MAPPING : 
        return node;
      case Kind.MAP :
        let yamlMappingNodeList = [];
        (<YamlMap> node).mappings.forEach(node => {
          let gen = generateChildren(node);
          yamlMappingNodeList.push(gen);  
        });
        return [].concat([], yamlMappingNodeList);
      case Kind.SEQ :
        let yamlSeqNodeList = [];
        (<YAMLSequence> node).items.forEach(node => {
          let gen = generateChildren(node);
          gen.forEach(element => {
            yamlSeqNodeList.push(element);  
          });
        });
        return [].concat([], yamlSeqNodeList);
    }
}

export function generateParents(node){
    if(!node) return [];
    switch(node.kind){
      case Kind.SCALAR :
        let scalarNode = <YAMLScalar> node;
        if(scalarNode.parent === null){
          return [];
        }else{
          return this.generateParents(scalarNode.parent);
        }
      case Kind.MAPPING : 
        let mappingNode = <YAMLMapping> node;
        if(mappingNode.parent === null){
          return [];
        }else{
          return [mappingNode.key].concat(this.generateParents(mappingNode.parent));
        }
      case Kind.MAP :
        let mapNode = <YamlMap> node;
        if(mapNode.parent === null){
          return [];
        }else{
          return this.generateParents(mapNode.parent);
        }
      case Kind.SEQ :
        let seqNode = <YAMLSequence> node;
        if(seqNode.parent === null){
          return [];
        }else{
          return this.generateParents(seqNode.parent);
        }
    }
}