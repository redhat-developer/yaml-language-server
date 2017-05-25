import { ASTVisitor } from '../utils/astServices';
import { YAMLNode, Kind, YAMLScalar, YAMLSequence, YAMLMapping, YamlMap, YAMLAnchorReference } from 'yaml-ast-parser';
import { JSONSchema } from "../jsonSchema";
import { SchemaToMappingTransformer } from "../schemaToMappingTransformer"

export class YAMLSChemaValidator extends ASTVisitor {
  private schema: JSONSchema;

  constructor(schema: JSONSchema) {
    super();
    this.schema = schema;
  }

  public visit(node: YAMLNode): boolean {
    switch(node.kind){
      
      /*
      The actual string value on the right side of the item

      Validate the type
      */
      case Kind.SCALAR :
        new SchemaToMappingTransformer(this.schema);
        break;
      
      /*
      An item prefaced by -? i.e. 
      objects:
         - apiVersion: v1
           kind: Secret
      
      Validate ??? 
      */
      case Kind.SEQ :
        this.validateSeq(<YAMLScalar>node);
        break;
      
      /*
      The left side of the item i.e. the node. E.g. apiVersion (Mapping value): v1
      
      Validate the the left side is in properties and correct depth or additional properties
      */
      case Kind.MAPPING :
        this.validateMapping(<YAMLScalar>node); 
        break;

      /*
      A list of mappings

      Validate that the children are of the property type
      */
      case Kind.MAP : 
        this.validateMap(<YAMLScalar>node);
        break;
      
      /*
      Unsure
      */
      case Kind.ANCHOR_REF :
        this.validateAnchorRef(<YAMLScalar>node); 
        break;
      
    }
    return true;
  };

  public endVisit(node:YAMLNode): void {
    
  };

  /*
  Get the parent node names in the format of closest to node to least closest

  A -> B -> C.
  getParentNodes(C) -> [B, A]
  */
  private getParentNodes(node:YAMLNode){
    
    if(!node){
      return [];
    }

    let holderNode = node;

    let parentNodeArray = [];
    
    while(holderNode.parent != null && holderNode.parent != holderNode){
      parentNodeArray.push((holderNode.parent).value);
      holderNode = holderNode.parent;
    }

    return parentNodeArray;

  }

  private traverseBackToLocation(node:YAMLNode){
    
    //
    //  Schema mapping
    //  "matchExpressions": {0: {"children": ["key", "operator", "values"]}}
    //



















































  }

  /*
  The actual string value on the right side of the item

  Validate the type. Return false if not valid.
  */
  private validateScalar(node:YAMLScalar){
    
    if(!node){
      return true;
    }

    //Just an idea, not the full working code. Can potentially be made more efficient.
    let traversedSchema = this.traverseBackToLocation(node);
    return traversedSchema[node.key].type == typeof node.value;

  }

  private validateSeq(node:YAMLScalar){
    node.value;
  }

  /*
  The key value node pair itself E.g. apiVersion : v1
  
  Validate it is in properties and the correct depth (Automatically done) or has additional properties
  */
  private validateMapping(node:YAMLScalar){
  
    //Just an idea, not the full working code. Can potentially be made more efficient.
    let traversedSchema = this.traverseBackToLocation(node);
    //return traversedSchema.type == typeof node.value;
  
  }

  /*
  In order for this to be valid you need the correct value in the key node and correct type in the value node
  */
  private validateMap(node:YAMLScalar){
    node.value;
  }

  private validateAnchorRef(node:YAMLScalar){
    node.value;
  }

}
