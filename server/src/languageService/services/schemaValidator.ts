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
        
        //This is going to be the children node
        let childrenNodes = this.getChildren(currentNode); 
        childrenNodes.forEach(element => {

          //Compare currentNode with getParents(this node)
          let parentNodes = getParentNodes(currentNode);

          if(currentSearchingNode.length - 1 === parentNodes.length && this.validateChildren(element)){

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
    switch(node.kind){
      case Kind.MAP : 
        let mapNodeList = [];
        node.mappings.forEach(element => {
          element.value.mappings.forEach(newElement => {
            mapNodeList.push(newElement);  
          });
        });
        return mapNodeList;
      case Kind.MAPPING :
        if(node.value === undefined){
          return node.mappings;
        }else if(node.value.mappings !== undefined){
          return node.value.mappings;
        }else{
          let mappingNodeList = [];
          
          if(node.value.kind === Kind.SCALAR){
            return [];
          }

          node.value.items.forEach(element => {
          element.mappings.forEach(newElement => {
            mappingNodeList.push(newElement);  
            });
          });
          return mappingNodeList;
        }
      case Kind.SEQ :
        let seqNodeList = [];
        (<YAMLSequence> node).items.forEach(element => {
          element.mappings.forEach(newElement => {
            seqNodeList.push(newElement);  
          });
        });
        return seqNodeList;
      default:
        return [];
    }
  }

  public getErrorResults(){   
    return this.errorHandler.getErrorResultsList();
  }

}
