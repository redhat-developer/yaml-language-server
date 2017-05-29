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
  private kuberSchema: JSONSchema;

  constructor(schema: JSONSchema) {
    super();
    this.schema = schema;
    this.kuberSchema = new SchemaToMappingTransformer(this.schema)["mappingKuberSchema"];
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
      The left side of the item i.e. the node. E.g. apiVersion (Mapping value): v1
      
      Validate the the left side is in properties and correct depth or additional properties
      */
      case Kind.MAPPING :
        this.validateMapping(<YAMLMapping>node);        
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
      
      if(typeof holderNode.parent.key != "undefined"){
        parentNodeArray.push(holderNode.parent.key.value);
      }

      holderNode = holderNode.parent;
    
    }

    return parentNodeArray;

  }

  /*
  Verify that the type of nodeToTest is the same as atleast one of the nodes in the mappingNode schema. Also add support for "number" === "integer" since typescript/javascript uses number instead of integer while yaml uses integer
  */
  private verifyType(mappingNode, nodeToTest, node){
    if(node.kind === Kind.SCALAR){
      for(let n = 0; n < mappingNode.length; n++){
        if(mappingNode[n].type === typeof nodeToTest || (typeof nodeToTest === "number" && mappingNode[n].type === "integer")){
          return true;
        }
      }
      return false;
    }
    return true;
  }

  private validateObject(nodeObject){
    return Object.keys(nodeObject).length >= 1;
  }

  private traverseBackToLocation(parentNodeList:Array<String>, node:YAMLNode){

    if(parentNodeList.length === 0){
      if(node.kind === Kind.MAPPING){
        return this.kuberSchema[node["key"]["value"]];
      }
    }

    if(parentNodeList.length === 1){
      if(node.kind === Kind.SCALAR){
        return this.kuberSchema[node["parent"]["key"]["value"]];
      }
    }

    let nodeList = [];
    let modelDepth = 0;
    let parentListDepth = parentNodeList.length;
    let rootNode = parentNodeList[parentNodeList.length - 1].toString(); //matchingExpressions
    let schema = this.kuberSchema;

    //Add the nodes that need to be searched
    for(let node = 0; node < schema[rootNode].length; node++){
      for(let childNode = 0; childNode < schema[rootNode][node].children.length; childNode++){
        nodeList.push([rootNode, schema[rootNode][node]["children"][childNode]]);
      }
    }

    //We need to do that error check in here somewhere
    while(nodeList.length != 0){
      let nodeListToSearch = nodeList.shift();
      let nodeToSearch = nodeListToSearch[nodeListToSearch.length - 1];

      if(nodeListToSearch.length === parentListDepth && nodeToSearch === node.value){
        return schema[nodeToSearch];
      }

      //TODO: We need to fix the way in which this works
      for(let node = 0; node < schema[nodeToSearch].length; node++){
        for(let childNode = 0; childNode < schema[nodeToSearch][node]["children"].length; childNode++){
          //TODO: We are pushing on multiple ending items to the same thing. Deepcopy here?
          nodeListToSearch.push(schema[nodeToSearch][node]["children"][childNode]);
          nodeList.push(nodeListToSearch);
        }
      }

    }

    return {};

  }

  private validateScalar(node:YAMLScalar){
    //The case where the object isn't a string
    if(node.valueObject !== undefined){
      this.validate(<YAMLScalar>node, node.parent.key.value, node.valueObject);
    }else{
      this.validate(<YAMLScalar>node, node.parent.key.value, node.value);
    }
    
  }

  private validateMapping(node:YAMLMapping){
     this.validate(<YAMLMapping>node, node.key.value, node.key.value);
  }

  private validate(node:YAMLNode, keyValue, valueValue){
    
    if(this.kuberSchema[keyValue] === undefined){
      
        YAMLSChemaValidator.addErrorResult(node);
      
    }else{
      let nodeParents = this.getParentNodes(node);
      let traversalResults = this.traverseBackToLocation(nodeParents, node);
      if(this.validateObject(traversalResults) && this.verifyType(traversalResults, valueValue, node)){
        return true;
      }else{
        //TODO: We need to add the errors to the error result list so find this error
        YAMLSChemaValidator.addErrorResult(node);
        return false;
      }
    }
  
  }

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

  private static getErrorResults(){
    return this.errorResults;
  }

}
