import { CompletionItem, CompletionItemKind, CompletionList, TextDocument, Position, Range, TextEdit, InsertTextFormat } from 'vscode-languageserver-types';
import { YAMLDocument, YAMLNode, Kind } from 'yaml-ast-parser';
import { Thenable } from '../yamlLanguageService';
import { findNode } from '../utils/astServices';
import { IJSONSchemaService }  from '../services/jsonSchemaService';
import { traverse, generateParents } from '../utils/astServices';
import { snippetAutocompletor } from '../../SnippetSupport/snippet';
import { searchService } from "../services/searchService";
import { getLineOffsets } from "../utils/arrUtils";
var equal = require('deep-equal');

export class autoCompletionProvider {
  
  private schemaService: IJSONSchemaService;
  
  constructor(schemaService : IJSONSchemaService){
    this.schemaService = schemaService;
  }

  public doComplete(document: TextDocument, position: Position, doc): Thenable<CompletionList> {
    let result: CompletionList = {
      items: [],
      isIncomplete: false
    };

    return this.schemaService.getSchemaForResource(document.uri).then(schema =>{
      let kubeSearchService = new searchService(schema.schema);

      let offset = document.offsetAt(position);
      let node = findNode(<YAMLNode>doc, offset);
      let parentNodes = generateParents(node);

      let linePos = position.line;
      let lineOffset = getLineOffsets(document.getText()); 
      let start = lineOffset[linePos]; //Start of where the autocompletion is happening
      let end = 0; //End of where the autocompletion is happening
      if(lineOffset[linePos+1]){
          end = lineOffset[linePos+1];
      }else{
          end = document.getText().length;
      }

      //If its a root node and the line isn't doComplete
      //If its a root node and the line IS complete
      if(this.isRootNode(doc, node) && document.getText().substring(start, end).indexOf(":") === -1 || node && !node.value && document.getText().substring(start, end).indexOf(":") === -1){
        parentNodes = parentNodes.slice(1);  
      }     

      return kubeSearchService.traverseKubernetesSchema(parentNodes, node, true, (possibleChildren, nodesToSearch, rootNodes) => {
        
        if(rootNodes.length !== 0){
            result.items = rootNodes;
        }else if(node && (node.value && node.value.kind === Kind.SCALAR) || node.kind === Kind.SCALAR){
            result.items = this.autoCompleteScalarResults(nodesToSearch);
        }else {
            result.items = this.autoCompleteMappingResults(possibleChildren);
        }

        snippetAutocompletor.provideSnippetAutocompletor(document.uri).forEach(compItem => {
            result.items.push(compItem);
        });
        
        return result;

      });

    });
  } 

  private isRootNode(doc, node){
      for(let element in doc.mappings) {
          if(equal(doc.mappings[element], node)){
              return true;
          }
      };
      return false;
  }

  private autoCompleteMappingResults(nodesToSearch){
        
        if(nodesToSearch.length === 0){
            return [];
        }

        if(!(nodesToSearch[0].hasOwnProperty("properties") || nodesToSearch[0].hasOwnProperty("items"))){
            return this.autoCompleteScalarResults(nodesToSearch);
        }

        let mapNodes = nodesToSearch.map(function(node){
            if(node.properties){
                return node.properties;  
            }else if(node["items"] && node["items"]["properties"]){
                return node["items"]["properties"];
            }
        });

        mapNodes = mapNodes.filter(node => node !== undefined);

        let objSet = new Set();
        let nodeArray = [];
        mapNodes.forEach(element => {
            
            Object.keys(element).forEach(function(node){

                element[node].name = node;
                if(!objSet.has(element[node].rootObj)){
                    nodeArray.push(element[node]);
                }

            });
            
            objSet.add(element[Object.keys(element)[0]].rootObj);
            
        });

        nodeArray = this.removeDuplicatesByNameAndDescription(nodeArray);

        return nodeArray.map(function(node){
            return {
                label: node.name,
                detail: "k8s-model",
                documentation: node.description
            }
        });
    }

    private removeDuplicatesByNameAndDescription(arr){
        let newArr = [];
        let canAdd = true;
        for(let x = 0; x < arr.length; x++){
            //For each object in current array if these aren't found then add them
            for(let y = 0; y < newArr.length; y++){
            
                if(newArr[y].description === arr[x].description && newArr[y].name === arr[x].name){
                    canAdd = false
                }
            
            }
            
            if(canAdd){
                newArr.push(arr[x]);
            }
            
            canAdd = true;
        }
        return newArr;
    }

    private autoCompleteScalarResults(nodesToSearch){
      
        if(nodesToSearch.length === 0){
            return [];
        }

        let scalarSet = new Set();
        let nodeArray = [];
        nodesToSearch.forEach(element => {
            
            let ele = element.constructor === Array ? element[0] : element;
            let defaultValue = ele.default || undefined;

            if(defaultValue !== undefined && !scalarSet.has(defaultValue)){
                nodeArray.push(ele);
            }

            scalarSet.add(defaultValue);
            
        });

        return nodeArray.map(function(node){
            if(node.description && node.description.length >= 1){
                return {
                    label: node.default,
                    detail: "k8s-model",
                    documentation: node.description
                }
            }else{
                return {
                    label: node.default
                }
            }
            
        });

    }

}

