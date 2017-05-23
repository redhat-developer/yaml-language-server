import { ASTVisitor } from '../utils/astServices';
import { YAMLNode, Kind, YAMLScalar, YAMLSequence, YAMLMapping, YamlMap, YAMLAnchorReference } from 'yaml-ast-parser';
import { JSONSchema } from "../jsonSchema";

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
        this.validateScalar(<YAMLScalar>node);
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

  public endVisit(node: YAMLNode): void {
    
  };


  private getParentNodeNames(node){
    
    let parentNodeNames = [];
    
    while(node.parent != null && node.parent != node){
      parentNodeNames.push(node.parent.value);
    }

    return parentNodeNames;

  }

  /*
  The actual string value on the right side of the item

  Validate the type. Return false if not valid.
  */
  private validateScalar(node:YAMLScalar){
    
    //The parents given type is correct if true else it fails
    //this.schema[] at this location current location all the way down is true
    
    //Just an idea, not the full working code. Can potentially be made more efficient.
    let parentNodeNames = this.getParentNodeNames(node);
    let depth = null;
    for(let x = 0; x < parentNodeNames.length; x++){
      depth = this.schema[parentNodeNames[x]];
    }

    return depth.type == typeof node.value;

  }

  private validateSeq(node:YAMLScalar){
    node.value;
  }

  /*
  The left side of the item i.e. the node. E.g. apiVersion (Mapping value): v1
  
  Validate the the left side is in properties and correct depth or additional properties
  */
  private validateMapping(node:YAMLScalar){
    node.value;
  }

  private validateMap(node:YAMLScalar){
    node.value;
  }

  private validateAnchorRef(node:YAMLScalar){
    node.value;
  }

}
