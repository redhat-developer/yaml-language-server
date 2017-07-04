import {SchemaToMappingTransformer} from "../schemaToMappingTransformer"
import {TextDocument, CompletionList} from 'vscode-languageserver-types';
import {JSONSchema} from "../jsonSchema";
import {YAMLDocument, YAMLNode, Kind} from 'yaml-ast-parser';

let AutoComplete = require('triesearch');

export class hoverService {

    private schema: JSONSchema;
    private kuberSchema; 
    private mappingTransformer;
    private test;

    constructor(schema:JSONSchema){
        this.schema = schema;
        this.mappingTransformer = new SchemaToMappingTransformer(schema); 
        this.kuberSchema = this.mappingTransformer.getSchema();
    }

    //Current issues are:
    //  1. At line 37 its not accounting for mapping nodes, only for scalar
    //  2. Scalar nodes are autocompleting with other values when they are a child
    public buildAutocompletionFromKuberProperties(parentNodeList, node){

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
        
        //Autocompletion on root nodes
        //Case 1 covered
        if(parentNodeList.length === 0){
            return Object.keys(this.kuberSchema["rootNodes"]).map(x => ({
                label: x
            }));
        }

        let possibleChildren = [];
        while(nodesToSearch.length > 0){
            let currNodePath = nodesToSearch.shift(); 
            let depth = currNodePath.length - 1;
            let currNode = currNodePath[depth];

            //Autocompletion on deep child nodes
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
           
        return this.removeDuplicates(possibleChildren, "description");
        
    }

     private getParentNodes(nodeList){
        let parentNodeNameList = [];
        for(let nodeCount = nodeList.length - 1; nodeCount >= 0; nodeCount--){
            parentNodeNameList.push(nodeList[nodeCount].value);
        }
        return parentNodeNameList;
    }

    private removeDuplicates(arr, prop) {
        var new_arr = [];
        var lookup  = {};

        for (var i in arr) {
            lookup[arr[i][prop]] = arr[i];
        }

        for (i in lookup) {
            new_arr.push(lookup[i]);
        }

        return new_arr;
    }
 

}