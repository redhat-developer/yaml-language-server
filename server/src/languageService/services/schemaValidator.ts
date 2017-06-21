import { ASTVisitor, generateChildren } from '../utils/astServices';
import { YAMLNode, Kind, YAMLScalar, YAMLSequence, YAMLMapping, YamlMap, YAMLAnchorReference } from 'yaml-ast-parser';
import { JSONSchema } from "../jsonSchema";
import { SchemaToMappingTransformer } from "../schemaToMappingTransformer"
import { DiagnosticSeverity } from "vscode-languageserver-types/lib/main";
import { error } from "util";
import { xhr,configure as getErrorStatusDescription } from 'request-light';
import { ErrorHandler } from '../utils/errorHandler';
import {load as yamlLoader, YAMLDocument, YAMLException} from 'yaml-ast-parser-beta';

export class YAMLSChemaValidator extends ASTVisitor {
  private schema: JSONSchema;
  private lineCount;
  private kuberSchema: JSONSchema;
  private errorHandler: ErrorHandler;
  private textDoc;

  constructor(schema: JSONSchema, document) {
    super();
    this.schema = schema;
    this.kuberSchema = new SchemaToMappingTransformer(this.schema).getSchema();
    this.errorHandler = new ErrorHandler(document);
    this.textDoc = document;
  }

  /**
   * Perform a search navigating down the model looking if there exists a pathway to the node
   * @param {YAMLNode} node - The node we need to traverse to
   */
  public traverseBackToLocation(node:YAMLNode): void {

      let rootNode = node;
      let nodesToSearch = [];

      if(!rootNode.mappings){
        rootNode.mappings = [];
      }

      rootNode.mappings.forEach(element => {
        if(this.kuberSchema["rootNodes"][element.key.value]){
          nodesToSearch.push([element]);
        }else if(this.kuberSchema["childrenNodes"][element.key.value]){
          this.errorHandler.addErrorResult(element, "Command \'" + element.key.value + "\' is not a root node", DiagnosticSeverity.Warning);
        }else{
          this.errorHandler.addErrorResult(element, "Command \'" + element.key.value + "\' is not found", DiagnosticSeverity.Error);
        }
      });

      while(nodesToSearch.length > 0){
        let currentNodePath = nodesToSearch.pop();
        let currentNode = currentNodePath[currentNodePath.length - 1];

        //Do some error checking on the current key
        //If there is an error then throw the error on it and don't add the children
        
        //Error: If key not found
        if(!this.kuberSchema["childrenNodes"][currentNode.key.value]){
          this.errorHandler.addErrorResult(currentNode.key, "Command \'" + currentNode.key.value + "\' is not found", DiagnosticSeverity.Error);
        }

        //Error: It did not validate correctly
        if(!this.isValid(currentNodePath)){
          this.errorHandler.addErrorResult(currentNode.key, "Command \'" + currentNode.key.value + "\' is not in a valid location in the file", DiagnosticSeverity.Error);
        }

        //Error: If type is mapping then we need to check the scalar type
        if(currentNode.kind === Kind.MAPPING && currentNode.value !== null && this.hasInvalidType(currentNode)){
          this.errorHandler.addErrorResult(currentNode.value, "Command \'" + currentNode.key.value + "\' has an invalid type. Valid type(s) are: " + this.validTypes(currentNode).toString(), DiagnosticSeverity.Error);
        }

        let childrenNodes = generateChildren(currentNode.value);
        childrenNodes.forEach(child => {
          //We are getting back a bunch of nodes which all have a key and we adding them

          let newNodePath = currentNodePath.concat(child);
          if(!this.isValid(newNodePath)){

            if(!this.kuberSchema["childrenNodes"][child.key.value]){
              this.errorHandler.addErrorResult(child,  "Command \'" + child.key.value + "\' is not found", DiagnosticSeverity.Warning);
            }

            if(this.hasAdditionalProperties(currentNode.key.value)){
              this.errorHandler.addErrorResult(child, "\'" + child.key.value + "\' is an additional property of " + currentNode.key.value, DiagnosticSeverity.Warning);
            }else{
              this.errorHandler.addErrorResult(child, "\'" + child.key.value + "\' is not a valid child node of " + currentNode.key.value, DiagnosticSeverity.Error);
            }
          }else{         
            nodesToSearch.push(newNodePath);
          }
        
        });

      }

  }

  private hasInvalidType(node){
     
     if(!node) return false;

     let nodeTypesUnique = this.validTypes(node);

     let nodeToTest = node.value.valueObject !== undefined ? node.value.valueObject : node.value.value;
     if(node.value.mappings || node.value.items || nodeToTest === undefined){
       return false;
     }

     //Typescript doesn't have integer it has value so we need to check if its an integer
     if(typeof nodeToTest === 'number'){
       return nodeTypesUnique.indexOf("integer") === -1;  
     }

     //Date needs to be added to schema
     if(typeof nodeToTest === 'object'){
       let dateToTest = new Date(nodeToTest);
       return dateToTest.toString() === 'Invalid Date' ? true: false;
     }

     return nodeTypesUnique.indexOf(typeof nodeToTest) === -1;

  }

  private validTypes(node) {

     let nodeTypes = this.kuberSchema["childrenNodes"][node.key.value].map(x => x.type);
     let nodeTypesUnique = Array.from(new Set(nodeTypes));

     return nodeTypesUnique;

  }

  private isValid(node){
    let parentNodes = this.getParentNodes(node);
    
    if(parentNodes.length === 0){
      return true; 
    }
    
    let parent = parentNodes[parentNodes.length - 2];
    let child = parentNodes[parentNodes.length - 1];
    if(this.kuberSchema["childrenNodes"][parent]){
      let parentChildNodes = this.kuberSchema["childrenNodes"][parent].map(x => x.children);
      let parentChildNodesFlatten = [].concat.apply([], parentChildNodes);
      let parentChildNodesUnique = Array.from(new Set(parentChildNodesFlatten));
      return parentChildNodesUnique.indexOf(child) !== -1;
    }

    return false;

  }

  private getParentNodes(nodeList){
    if(nodeList.length ===  1) return []; //Case when its a root node

    let parentNodeNameList = [];
    for(let nodeCount = 0; nodeCount <= nodeList.length - 1; nodeCount++){
      parentNodeNameList.push(nodeList[nodeCount].key.value);
    }
    return parentNodeNameList;
  }

  private hasAdditionalProperties(nodeValue: string): boolean {
    let schemaAtNode = this.kuberSchema["childrenNodes"][nodeValue];
    if(schemaAtNode[0].hasOwnProperty("additionalProperties")){
      return schemaAtNode[0]["additionalProperties"].hasOwnProperty("type") && schemaAtNode[0]["additionalProperties"].hasOwnProperty("description");
    }
    return false;
  }

  public getErrorResults(){   
    return this.errorHandler.getErrorResultsList();
  }

}
