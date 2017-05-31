import { ASTVisitor } from '../utils/astServices';
import { YAMLNode, Kind, YAMLScalar, YAMLSequence, YAMLMapping, YamlMap, YAMLAnchorReference } from 'yaml-ast-parser';
import { JSONSchema } from "../jsonSchema";
import { SchemaToMappingTransformer } from "../schemaToMappingTransformer"
import { DiagnosticSeverity } from "vscode-languageserver-types/lib/main";
import { error } from "util";
import { xhr,configure as getErrorStatusDescription } from 'request-light';

export class YAMLSChemaValidator extends ASTVisitor {
  private schema: JSONSchema;
  private errorResultsList = [];
  private lineCount;
  private kuberSchema: JSONSchema;

  constructor(schema: JSONSchema) {
    super();
    this.schema = schema;
    this.kuberSchema = new SchemaToMappingTransformer(this.schema)["mappingKuberSchema"];
    this.lineCount = 0;
  }

  public visit(node: YAMLNode): boolean {
    switch(node.kind){
      
      /**
       * YamlScalar is the value in {key: value}
       */
      case Kind.SCALAR :
        this.validateScalar(<YAMLScalar>node);
        this.lineCount+=1;   
        break;
      
      /**
       * YamlMapping has YAMLScalar as the key and YAMLNode value fields
       */
      case Kind.MAPPING :
       this.validateMapping(<YAMLMapping>node);   
        break;

      case Kind.MAP:
        this.lineCount+=1;
        break;
      
    }
    return true;
  };

  public endVisit(node:YAMLNode): void {
    
  };

  /**
   * Traverse up the ast getting the parent node names in the order of parent to root.
   * @param {YAMLNode} node - The node to use
   */
  private getParentNodes(node:YAMLNode){
    
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

  /**
   * Verify that the type of nodeToTest is the same as atleast one of the nodes in mappingNode schema
   * @param {} traversalResults - The results of the search traversal
   * @param {YAMLNode} nodeToTest - The node to test
   * @param {YAMLNode} node - The node to use
   *
   * A -> B -> C.
   * getParentNodes(C) -> [B, A]
   */
  private verifyType(traversalResults, nodeToTest, node): Boolean {
    if(node.kind === Kind.SCALAR){
      for(let n = 0; n < traversalResults.length; n++){
        if(traversalResults[n].type === typeof nodeToTest || (typeof nodeToTest === "number" && traversalResults[n].type === "integer")){
          return true;
        }
      }
      return false;
    }
    return true;
  }

  /* Validate that the object is NOT empty */
  private validateObject(nodeObject){
    return Object.keys(nodeObject).length >= 1;
  }

  /**
   * Perform a search navigating down the model looking if there exists a pathway to the node
   * @param {YAMLNode} node - The node we need to traverse to
   */
  private traverseBackToLocation(node:YAMLNode){

    let parentNodeList = this.getParentNodes(node);
    let nodeList = [];
    let parentListDepth = parentNodeList.length;
    let parentListReversed = this.deepCopy(parentNodeList).reverse();
    let rootNode = parentNodeList[parentNodeList.length - 1]; //metadata
    let trackedNodes = new Set();
    let schema = this.kuberSchema;
    
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
 
    //Add the nodes that need to be searched
    for(let node = 0; node < schema[rootNode].length; node++){
      for(let childNode = 0; childNode < schema[rootNode][node].children.length; childNode++){
        let potentialNodeList = [rootNode, schema[rootNode][node]["children"][childNode]]; 
        let potentialNodeListJson = JSON.stringify(potentialNodeList);
        if(!trackedNodes.has(potentialNodeListJson)){
          nodeList.push(potentialNodeList);
        }
      }
    }

    //We need to do that error check in here somewhere
    while(nodeList.length != 0){
      let nodeListToSearch = nodeList.shift();
      let nodeToSearch = nodeListToSearch[nodeListToSearch.length - 1];

      //Ignore this for now
      //Checking when its a map
      if(nodeListToSearch.length - 1 === parentListDepth && nodeToSearch === node.key.value){
        return schema[nodeToSearch];
      }

      //TODO: THIS ISN'T CATCHING EVERYTHING
      //Checking when its scalar 
      if(node.parent.hasOwnProperty("key") && node.parent.key.hasOwnProperty("value") && nodeListToSearch.length === parentListDepth && nodeToSearch === node.parent.key.value){
          return schema[nodeToSearch];
      }
      
      for(let node = 0; node < schema[nodeToSearch].length; node++){
        for(let childNode = 0; childNode < schema[nodeToSearch][node]["children"].length; childNode++){

          //Only add nodes that are relevant to the pathway
          if(nodeToSearch === parentListReversed[nodeListToSearch.length - 1]){ 
            let searchingNode = this.deepCopy(nodeListToSearch);
            searchingNode.push(schema[nodeToSearch][node]["children"][childNode]);
            nodeList.push(searchingNode);  
          }

        }
      }

    }

    return {};

  }

  private validateScalar(node:YAMLScalar){

    //The case where the object isn't a string you can access a different property
    if(node.valueObject !== undefined){
      this.validate(<YAMLScalar>node, node.parent.key.value, node.valueObject);
    
    //TODO: THIS ISN'T CATCH EVERYTHING
    }else if(node.parent.hasOwnProperty("key") && node.parent.key.hasOwnProperty("value")){
      this.validate(<YAMLScalar>node, node.parent.key.value, node.value);
    }
    
  }

  private validateMapping(node:YAMLMapping){
     this.validate(<YAMLMapping>node, node.key.value, node.key.value);
  }

  private validate(node:YAMLNode, keyValue, valueValue) : boolean {
    
    if(this.kuberSchema[keyValue] === undefined){
      
        this.addErrorResult(node, "Command not found in k8s", DiagnosticSeverity.Warning);
        return false;
      
    }else{
      let traversalResults = this.traverseBackToLocation(node);
      if(this.validateObject(traversalResults) && this.verifyType(traversalResults, valueValue, node)){
        return true;
      
      }else if(!this.verifyType(traversalResults, valueValue, node)){
        this.addErrorResult(node, "Does not have the correct k8s type", DiagnosticSeverity.Error);
        return false;
      }else if(!this.validateObject(traversalResults)){
        this.addErrorResult(node, "Does not match the k8s model", DiagnosticSeverity.Error);
        return false;
      
      }
    }
  
  }

  private addErrorResult(errorNode, errorMessage, errorType){
    
    this.errorResultsList.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: {line: this.getLineCount()-1, character: 0},
        end: {line: this.getLineCount()-1, character:Number.MAX_VALUE}
      },
      message: errorMessage,
      source: "k8s Model"
    });
    
  }

  public getErrorResults(){
    return this.errorResultsList;
  }

  private deepCopy(Obj:Object){
    return JSON.parse(JSON.stringify(Obj));
  }

  private getLineCount(){
    return this.lineCount;
  }

}
