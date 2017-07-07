import {SchemaToMappingTransformer} from "../schemaToMappingTransformer"
import {TextDocument, CompletionList} from 'vscode-languageserver-types';
import {JSONSchema} from "../jsonSchema";
import {YAMLDocument, YAMLNode, Kind} from 'yaml-ast-parser';
let AutoComplete = require('triesearch');

export class searchService {

    private schema: JSONSchema;
    private kuberSchema; 
    private mappingTransformer;

    constructor(schema:JSONSchema){
        this.schema = schema;
        this.mappingTransformer = new SchemaToMappingTransformer(schema); 
        this.kuberSchema = this.mappingTransformer.getSchema();
    }

    public traverseKubernetesSchema(parentNodeList, node, returnEarlyForScalar, callback){

        let parentNodeFirst = parentNodeList[0];
        let parentList = this.getParentNodes(parentNodeList);  

        let nodesToSearch = [];
        
        for(let api_obj in this.schema.definitions){
            for(let prop in this.schema.definitions[api_obj]["properties"]){
                if(prop === parentList[0]){
                    nodesToSearch.push([this.schema.definitions[api_obj]["properties"][prop]]);
                }
            } 
        }

        if(parentNodeList.length === 0){
            let rootNodes = Object.keys(this.kuberSchema["rootNodes"]).map(x => ({
                label: x
            }));
            return callback([],[], rootNodes);
        }


        if(returnEarlyForScalar && parentList.length === 1 && (node && (node.value && node.value.kind === Kind.SCALAR) || node.kind === Kind.SCALAR)){
            return callback([], nodesToSearch, []);
        }

        let possibleChildren = [];
        while(nodesToSearch.length > 0){
            let currNodePath = nodesToSearch.shift(); 
            let depth = currNodePath.length - 1;
            let currNode = currNodePath[depth];

            if(currNodePath.length === parentList.length){
                possibleChildren.push(currNode);
            }

            if(currNode["items"] && currNode["items"]["properties"]){
                if(currNode["items"]["properties"][parentList[currNodePath.length]]){
                    let newNodePath = currNodePath.concat(currNode["items"]["properties"][parentList[currNodePath.length]]);
                    nodesToSearch.push(newNodePath);
                }               
            }

            if(currNode["properties"] && currNode["properties"][parentList[currNodePath.length]]){
                let newNodePath = currNodePath.concat(currNode["properties"][parentList[currNodePath.length]]);
                nodesToSearch.push(newNodePath);
            }

        }
           
        return callback(possibleChildren, nodesToSearch, []);
        
    }

    private getParentNodes(nodeList){
        let parentNodeNameList = [];
        for(let nodeCount = nodeList.length - 1; nodeCount >= 0; nodeCount--){
            parentNodeNameList.push(nodeList[nodeCount].value);
        }
        return parentNodeNameList;
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