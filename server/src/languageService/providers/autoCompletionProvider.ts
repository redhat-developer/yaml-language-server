import { CompletionItem, CompletionItemKind, CompletionList, TextDocument, Position, Range, TextEdit, InsertTextFormat } from 'vscode-languageserver-types';
import { YAMLDocument, YAMLNode, Kind } from 'yaml-ast-parser';
import { Thenable } from '../yamlLanguageService';
import { findNode } from '../utils/astServices';
import { IJSONSchemaService }  from '../services/jsonSchemaService';
import { traverse, generateParents } from '../utils/astServices';
import { snippetAutocompletor } from '../../SnippetSupport/snippet';
import { searchService } from "../services/searchService";

export class autoCompletionProvider {
  
  private schemaService: IJSONSchemaService;
  
  constructor(schemaService : IJSONSchemaService){
    this.schemaService = schemaService;
  }

  public doComplete(document: TextDocument, position: Position, doc: YAMLDocument): Thenable<CompletionList> {
    let result: CompletionList = {
      items: [],
      isIncomplete: false
    };

    return this.schemaService.getSchemaForResource(document.uri).then(schema =>{
      let kubeSearchService = new searchService(schema.schema);

      let offset = document.offsetAt(position);
      let node = findNode(<YAMLNode>doc, offset);
      let parentNodes = generateParents(node);

      //If node is an uncompleted root node then it can't be a parent of itself
      if(node && !node.value){
        parentNodes = parentNodes.slice(1);
      }

      return kubeSearchService.traverseKubernetesSchema(parentNodes, node, true, (possibleChildren, nodesToSearch, rootNodes) => {
        
        if(rootNodes.length !== 0){
            result.items = rootNodes;
        }else if(node && (node.value && node.value.kind === Kind.SCALAR) || node.kind === Kind.SCALAR){
            result.items = this.autoCompleteScalarResults(nodesToSearch);
        }else{
            result.items = this.autoCompleteMappingResults(possibleChildren);
        }

        snippetAutocompletor.provideSnippetAutocompletor(document.uri).forEach(compItem => {
            result.items.push(compItem);
        });

        return result;

      });

    });
  } 

  private autoCompleteMappingResults(nodesToSearch){
        
        if(nodesToSearch.length === 0){
            return [];
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
            
            let defaultValue = element[0].default || undefined;

            if(defaultValue !== undefined && !scalarSet.has(defaultValue)){
                nodeArray.push(element[0]);
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

