import { ASTVisitor, getParentNodes } from '../utils/astServices';
import { YAMLNode, Kind, YAMLScalar, YAMLSequence, YAMLMapping, YamlMap, YAMLAnchorReference } from 'yaml-ast-parser';
import { JSONSchema } from "../jsonSchema";
import { SchemaToMappingTransformer } from "../schemaToMappingTransformer"
import { DiagnosticSeverity } from "vscode-languageserver-types/lib/main";
import { error } from "util";
import { xhr,configure as getErrorStatusDescription } from 'request-light';
import { ErrorHandler } from '../utils/errorHandler';

export class YAMLSChemaValidator extends ASTVisitor {
  private schema: JSONSchema;
  private lineCount;
  private kuberSchema: JSONSchema;
  private errorHandler: ErrorHandler;
  private textDoc;

  constructor(schema: JSONSchema, document) {
    super();
    this.schema = schema;
    this.kuberSchema = new SchemaToMappingTransformer(this.schema)["mappingKuberSchema"];
    this.errorHandler = new ErrorHandler(document);
    this.textDoc = document;
  }

  public visit(node: YAMLNode): boolean {
    switch(node.kind){

      /**
       * YamlMapping has YAMLScalar as the key and YAMLNode value fields
       */
      case Kind.MAPPING :
       return this.validateMapping(<YAMLMapping>node);   

      default:
        return true;
      
    }
  };


  /**
   * Verify that the type of nodeToTest is the same as atleast one of the nodes in mappingNode schema
   * @param {} traversalResults - The results of the search traversal
   * @param {YAMLNode} nodeToTest - The node to test
   * @param {YAMLNode} node - The node to use
   *
   * A -> B -> C.
   * getParentNodes(C) -> [B, A]
   */
  private verifyType(traversalResults, nodeToTest): Boolean {
    
    if(nodeToTest === undefined){
      return true;      
    }

    for(let n = 0; n < traversalResults.length; n++){
      if(traversalResults[n].type === typeof nodeToTest || (typeof nodeToTest === "number" && traversalResults[n].type === "integer")){
        return true;
      }
    }
    
    return false;

  }

  /* Validate that the object is NOT empty */
  private validateObject(nodeObject){
    return Object.keys(nodeObject).length >= 1;
  }

  /**
   * Perform a search navigating down the model looking if there exists a pathway to the node
   * @param {YAMLNode} node - The node we need to traverse to
   */
  public traverseBackToLocation(node:YAMLNode){

      let root = node;
      let nodesToSearch = [];

      root.mappings.forEach(element => {
        if(this.kuberSchema[element.key.value] !== undefined){
          nodesToSearch.push([element]);
        }else{
          //Throw error
          this.errorHandler.addErrorResult(node, "Command not found in k8s", DiagnosticSeverity.Warning);
        }
      });
    
      //Now we currently have ["spec" (But the object)]
      while(nodesToSearch.length != 0){
        let currentSearchingNode = nodesToSearch.pop();
        let currentNode = currentSearchingNode[currentSearchingNode.length - 1];

        
        //This is going to be the children nodes
        currentNode.value.mappings.forEach(element => {
          //Spec has items or value or something that we can loop through I think
          //Assuming we are iterating through that

          //Compare currentNode with getParents(this node)
          let parentNodes = getParentNodes(currentNode);
          if(currentSearchingNode.length -1 === parentNodes.length || currentSearchingNode.every((v, i) => v === parentNodes[i])){
            //Then we can add it and keep going
            let nodeList = this.deepCopy(currentSearchingNode);
            nodeList.push(element);
          } else {
            //Throw an error here and stop
            this.errorHandler.addErrorResult(node, "Bloop", DiagnosticSeverity.Warning);
          }

        });

      }


  }

  private validateMapping(node:YAMLMapping){

    if(node.hasOwnProperty("value")){
      if(node.value != null){
        if(node.value.hasOwnProperty("valueObject")){
          return this.validate(<YAMLMapping>node, node.value.valueObject);
        }else if(node.value.hasOwnProperty("value")){
          return this.validate(<YAMLMapping>node, node.value.value);
        }else{
          return this.validate(<YAMLMapping>node, undefined);  
        }
      }else{
        return this.validate(<YAMLMapping>node, undefined);
      }
    }else{
      return this.validate(<YAMLMapping>node, undefined);
    }
        
  }

  private validate(node:YAMLNode, valueValue) {

    if(this.kuberSchema[node.key.value] === undefined){
        this.errorHandler.addErrorResult(node.key, "Command not found in k8s", DiagnosticSeverity.Warning);
    }else{
      let traversalResults = this.traverseBackToLocation(node);
      if(!this.validateObject(traversalResults) && !this.verifyType(traversalResults, valueValue)){
        this.errorHandler.addErrorResult(node, "Root node is invalid", DiagnosticSeverity.Warning);
      }else if(!this.verifyType(traversalResults, valueValue)){
        this.errorHandler.addErrorResult(node, "Does not have the correct k8s type", DiagnosticSeverity.Warning);
      }else if(!this.validateObject(traversalResults)){
        this.errorHandler.addErrorResult(node, "Does not match the k8s model", DiagnosticSeverity.Warning);
      }else{
        return true;
      }
    }
  
    return false;

  }

  public getErrorResults(){   
    return this.errorHandler.getErrorResultsList();
  }

  private deepCopy(Obj:Object){
    return JSON.parse(JSON.stringify(Obj));
  }






























}
