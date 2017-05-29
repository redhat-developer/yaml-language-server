import { ASTVisitor } from '../utils/astServices';
import { YAMLNode, Kind, YAMLScalar, YAMLSequence, YAMLMapping, YamlMap, YAMLAnchorReference } from 'yaml-ast-parser';
import { JSONSchema } from "../jsonSchema";
import { SchemaToMappingTransformer } from "../schemaToMappingTransformer"
import { DiagnosticSeverity } from "vscode-languageserver-types/lib/main";
import { error } from "util";
import { xhr,configure as getErrorStatusDescription } from 'request-light';

export class YAMLSChemaValidator extends ASTVisitor {
  private schema: JSONSchema;
  private static errorResults = [];

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
        let scalarSchema = new SchemaToMappingTransformer(this.schema);
        let scalarParents = this.getParentNodes(node);
        let z = this.traverseBackToLocation(scalarSchema, scalarParents, node);
        let f = this.verifyType(z, node.value);
        break;
      
      /*
      The left side of the item i.e. the node. E.g. apiVersion (Mapping value): v1
      
      Validate the the left side is in properties and correct depth or additional properties
      */
      case Kind.MAPPING :
        //this.validateMapping(<YAMLScalar>node);
        let mappedSchema = new SchemaToMappingTransformer(this.schema);
        if(mappedSchema[node.key.value] === undefined){
          //False
          //Add the nodes to the error list
          YAMLSChemaValidator.addErrorResult(node);
        }else{
          let parentNodes = this.getParentNodes(node);
          let test = this.traverseBackToLocation(mappedSchema, parentNodes, node);
          if(!this.validateObject(test)){
            let t = this.verifyType(test, node.value.value); //This is validating the child node
          }
        }
        
        break;




















      /************************************/
      /* MIGHT NOT HAVE TO VALIDATE THESE */
      /************************************/

      /*
      An item prefaced by -? i.e. 
      objects:
         - apiVersion: v1
           kind: Secret
      
      Validate ??? 
      */
      //case Kind.SEQ :
      //  this.validateSeq(<YAMLScalar>node);
      //  break;

      /*
      A list of mappings

      Validate that the children are of the property type
      */
      //case Kind.MAP : 
      //  this.validateMap(<YAMLScalar>node);
      //  break;
      
      /*
      Unsure
      */
      //case Kind.ANCHOR_REF :
      //  this.validateAnchorRef(<YAMLScalar>node); 
      //  break;
      
    }
    return true;
  };

  public endVisit(node:YAMLNode): void {
    
  };

  private static addErrorResult(errorNode){
    this.errorResults.push({
        severity: DiagnosticSeverity.Error,
        range: {
					start: errorNode.startPosition,
					end: errorNode.endPosition
				},
        message: "Not valid Kubernetes Code",
        source: "k8s"
      });
  }

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
      
      if(typeof holderNode.parent.key != "undefined"){
        parentNodeArray.push(holderNode.parent.key.value);
      }

      holderNode = holderNode.parent;
    
    }

    return parentNodeArray;

  }

  private verifyType(mappingNode, node:YAMLNode){
    for(let n = 0; n < mappingNode.length; n++){
      if(mappingNode[n].type === typeof node){
        return true;
      }
    }
    return false;
  }

  private validateObject(nodeObject){
    return Object.keys(nodeObject).length >= 1;
  }

  private traverseBackToLocation(mappedSchema:JSONSchema, parentNodeList:Array<String>, node:YAMLNode){

    if(mappedSchema[node.value] === 'undefined'){
      return {};
    }

    if(parentNodeList.length === 0){
      if(node.kind === Kind.MAPPING){
        return mappedSchema["mappingKuberSchema"][node["key"]["value"]];
      }
    }

    if(parentNodeList.length === 1){
      if(node.kind === Kind.SCALAR){
        return mappedSchema["mappingKuberSchema"][node["parent"]["key"]["value"]];
      }
    }

    let nodeList = [];
    let modelDepth = 0;
    let parentListDepth = parentNodeList.length;
    let rootNode = parentNodeList[parentNodeList.length - 1].toString(); //matchingExpressions
    let schema = mappedSchema["mappingKuberSchema"];

    //Add the nodes that need to be searched
    for(let node = 0; node < schema[rootNode].length; node++){
      for(let childNode = 0; childNode < schema[rootNode][node].children.length; childNode++){
        nodeList.push([rootNode, schema[rootNode][node]["children"][childNode]]);
      }
    }

    while(nodeList.length != 0){
      let nodeListToSearch = nodeList.shift();
      let nodeToSearch = nodeListToSearch[nodeListToSearch.length - 1];

      if(nodeListToSearch.length === parentListDepth && nodeToSearch === node.value){
        return schema[nodeToSearch];
      }

      for(let node = 0; node < schema[nodeToSearch].length; node++){
        for(let childNode = 0; childNode < schema[nodeToSearch][node]["children"].length; childNode++){
          nodeListToSearch.push(schema[nodeToSearch][node]["children"][childNode]);
          nodeList.push(nodeListToSearch);
        }
      }

    }

    return {};

  }

  private getChildNodes(mappedSchemaNode:JSONSchema){
    let childNodes = [];

    //We need to fix this
    for(let x = 0; x < mappedSchemaNode; x++){
      for(let y = 0; y < mappedSchemaNode[x]; y++){
        childNodes.push(mappedSchemaNode[x].children[y]);
      }
    }

    return childNodes;
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
    //let traversedSchema = this.traverseBackToLocation([], node);
    //return traversedSchema[node.key].type == typeof node.value;

  }

  /*
  The key value node pair itself E.g. apiVersion : v1
  
  Validate it is in properties and the correct depth (Automatically done) or has additional properties
  */
  private validateMapping(node:YAMLScalar){
  
    //Just an idea, not the full working code. Can potentially be made more efficient.
    //let traversedSchema = this.traverseBackToLocation(node);
    //return traversedSchema.type == typeof node.value;
  
  }

  private static getErrorResults(){
    return this.errorResults;
  }
  
  // private validateSeq(node:YAMLScalar){
  //   node.value;
  // }

  // /*
  // In order for this to be valid you need the correct value in the key node and correct type in the value node
  // */
  // private validateMap(node:YAMLScalar){
  //   node.value;
  // }

  // private validateAnchorRef(node:YAMLScalar){
  //   node.value;
  // }

}
