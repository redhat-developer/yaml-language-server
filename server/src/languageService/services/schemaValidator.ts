import { ASTVisitor, ASTHelper} from '../utils/astServices';
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
   * Verify that the type of nodeToTest is the same as atleast one of the nodes in mappingNode schema
   * @param {} traversalResults - The results of the search traversal
   * @param {YAMLNode} node - The node to use
   */
  private verifyType(traversalResults, node): Boolean {
    
    if(node === undefined || traversalResults === undefined){
      return true;      
    }

    let nodeToTest = node.valueObject !== undefined ? node.valueObject : node.value;
    for(let n = 0; n < traversalResults.length; n++){
      if(traversalResults[n].type ===  typeof nodeToTest || (typeof nodeToTest === "number" && traversalResults[n].type === "integer")){
        return true;
      }
    }
    
    return false;

  }

  /**
   * Perform a search navigating down the model looking if there exists a pathway to the node
   * @param {YAMLNode} node - The node we need to traverse to
   */
  public traverseBackToLocation(node:YAMLNode): void {

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
        
        //FIX ME
        //if(currentNode.kind === Kind.MAPPING && !this.verifyType(this.kuberSchema[currentNode.key.value], currentNode.value)){
        //  this.errorHandler.addErrorResult(currentNode.value, "Node has wrong type", DiagnosticSeverity.Warning);
        //}
        
        //This is going to be the children node
        let childrenNodes = this.getChildren(currentNode); 
        childrenNodes.forEach(element => {

          //Compare currentNode with getParents(this node)
          let astHelper = new ASTHelper();
          let parentNodeHelper = astHelper.getParentNodes(currentNode);
          let parentNodes = astHelper.getParentAddr();

          if(currentSearchingNode.length === parentNodes.length && this.validateChildren(element)){

            if(currentNode.value.kind === Kind.SCALAR && !this.verifyType(this.kuberSchema[currentNode.key.value], currentNode.value)){
              this.errorHandler.addErrorResult(element, "Node has wrong type", DiagnosticSeverity.Warning);
            }

            let newNodeToSearch = currentSearchingNode.concat(element);
            nodesToSearch.push(newNodeToSearch);
          } else {
            this.errorHandler.addErrorResult(element, "Not a valid child node for this parent", DiagnosticSeverity.Warning);
          }

        });

      }

  }

  private validateChildren(node: YAMLNode){ 
    if(node.kind === Kind.MAPPING){
      return this.kuberSchema[this.validateChildrenHelper(node)].map(x => x.children).filter(function(child){
        return child.indexOf(node.key.value) != -1;
      }).length != 0;
    }
    return false;
  }

  private validateChildrenHelper(node: YAMLNode){
    //Get the parent node key
    let parentNodeKey = node.parent;
    while(parentNodeKey.key === undefined){
      parentNodeKey = parentNodeKey.parent;
    }
    return parentNodeKey.key.value;

  }

  private getChildren(node: YAMLNode){
    if(!node) return [];
    switch(node.kind){
      case Kind.SCALAR:
        return [];
      case Kind.MAPPING :
        return this.getChildren(node.value);
      case Kind.MAP :
        return node.mappings;
      case Kind.SEQ :
        return (<YAMLSequence> node).items;
      case Kind.ANCHOR_REF:
        return [(<YAMLAnchorReference> node).value];
    }
  }

  public getErrorResults(){   
    return this.errorHandler.getErrorResultsList();
  }

}
