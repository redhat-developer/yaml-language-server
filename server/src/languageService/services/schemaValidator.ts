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

  /**
   * Verify that the type of nodeToTest is the same as atleast one of the nodes in mappingNode schema
   * @param {} traversalResults - The results of the search traversal
   * @param {YAMLNode} nodeToTest - The node to test
   * @param {YAMLNode} node - The node to use
   *
   * A -> B -> C.
   * getParentNodes(C) -> [B, A]
   */
  private verifyType(traversalResults, node): Boolean {
    
    if(node === undefined || traversalResults === undefined){
      return true;      
    }

    let nodeToTest = node.valueObject !== undefined ? node.valueObject : node.value;

    for(let n = 0; n < traversalResults.length; n++){
      if(traversalResults[n].type === typeof nodeToTest || (typeof nodeToTest === "number" && traversalResults[n].type === "integer")){
        return true;
      }
    }
    
    return false;

  }

  /**
   * Perform a search navigating down the model looking if there exists a pathway to the node
   * @param {YAMLNode} node - The node we need to traverse to
   */
  public traverseBackToLocation(node:YAMLNode){

      let root = node;
      let nodesToSearch = [];

      if(root.mappings === undefined){
        root.mappings = [];
      }

      root.mappings.forEach(element => {
        if(this.kuberSchema[element.key.value] !== undefined){
          nodesToSearch.push([element]);
        }else{
          this.errorHandler.addErrorResult(element, "Command not found in k8s", DiagnosticSeverity.Warning);
        }
      });

      while(nodesToSearch.length != 0){
        let currentSearchingNode = nodesToSearch.pop();
        let currentNode = currentSearchingNode[currentSearchingNode.length - 1];

        if(this.kuberSchema[currentNode.key.value] === undefined){
          this.errorHandler.addErrorResult(currentNode, "Command not found in k8s", DiagnosticSeverity.Warning);
        }
        
        if(currentNode.value !== null && currentNode.value.kind === Kind.SCALAR && !this.verifyType(this.kuberSchema[currentNode.key.value], currentNode.value)){
          this.errorHandler.addErrorResult(currentNode.value, "Node has wrong type", DiagnosticSeverity.Warning);
        }
        
        //This is going to be the children nodes
        let childrenNodes = this.getChildren(currentNode); 
        childrenNodes.forEach(element => {

          //Compare currentNode with getParents(this node)
          let parentNodes = getParentNodes(currentNode);

          //Essentially here we just need to check if the pathway is valid
          //currentSearchingNode.every((v, i) => v === parentNodes[i])
          if(currentSearchingNode.length - 1 === parentNodes.length){
            //Then we can add it and keep going

            if(currentNode.value.kind === Kind.SCALAR && !this.verifyType(this.kuberSchema[currentNode.key.value], currentNode.value)){
              this.errorHandler.addErrorResult(element, "Node has wrong type", DiagnosticSeverity.Warning);
            }

            let newNodeToSearch = currentSearchingNode.concat(element);
            nodesToSearch.push(newNodeToSearch);
          } else {
            //Throw an error here and stop
            this.errorHandler.addErrorResult(element, "Bloop", DiagnosticSeverity.Warning);
          }

        });

      }

      console.log("Validated");

  }

  private getChildren(node: YAMLNode){
    switch(node.kind){
      case Kind.MAP : 
        let nodeList = [];
        node.mappings.forEach(element => {
          element.value.mappings.forEach(newElement => {
            nodeList.push(newElement);  
          });
        });
        return nodeList;
      case Kind.MAPPING :
        return node.value ? (node.value.mappings !== undefined ? node.value.mappings : []) : [];
      case Kind.SEQ :
        return (<YAMLSequence> node).items;
      default:
        return [];
    }
  }

  private validate(node:YAMLNode, valueValue) {

    // if(this.kuberSchema[node.key.value] === undefined){
    //     this.errorHandler.addErrorResult(node.key, "Command not found in k8s", DiagnosticSeverity.Warning);
    // }else{
    //   let traversalResults = this.traverseBackToLocation(node);
    //   if(!this.validateObject(traversalResults) && !this.verifyType(traversalResults, valueValue)){
    //     this.errorHandler.addErrorResult(node, "Root node is invalid", DiagnosticSeverity.Warning);
    //   }else if(!this.verifyType(traversalResults, valueValue)){
    //     this.errorHandler.addErrorResult(node, "Does not have the correct k8s type", DiagnosticSeverity.Warning);
    //   }else if(!this.validateObject(traversalResults)){
    //     this.errorHandler.addErrorResult(node, "Does not match the k8s model", DiagnosticSeverity.Warning);
    //   }else{
    //     return true;
    //   }
    // }


  }

  public getErrorResults(){   
    return this.errorHandler.getErrorResultsList();
  }

}
