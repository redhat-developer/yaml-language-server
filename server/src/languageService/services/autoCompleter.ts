import {SchemaToMappingTransformer} from "../schemaToMappingTransformer"
import {TextDocument, CompletionList} from 'vscode-languageserver-types';
import {JSONSchema} from "../jsonSchema";
import {YAMLDocument, YAMLNode, Kind} from 'yaml-ast-parser';

let AutoComplete = require('triesearch');

export class AutoCompleter {

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

        //Autocompletion on scalar nodes
        //Case 2 Covered
        if(parentList.length === 1 && (node && (node.value && node.value.kind === Kind.SCALAR) || node.kind === Kind.SCALAR)){
            return this.autoCompleteScalarResults(nodesToSearch);
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

        if(node && (node.value && node.value.kind === Kind.SCALAR) || node.kind === Kind.SCALAR){
            //Scalar nodes
            return this.autoCompleteScalarResults(nodesToSearch);
        }else{
            //Non scalar nodes
            return this.autoCompleteMappingResults(possibleChildren);
        }
        
    }

    private autoCompleteMappingResults(nodesToSearch){
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

        nodeArray = this.tempRemoveDuplicates(nodeArray);

        return nodeArray.map(function(node){
            return {
                label: node.name,
                detail: "k8s-model",
                documentation: node.description
            }
        });
    }

    private tempRemoveDuplicates(arr){
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
       

        let s = new Set();
        let nodeArray = [];
        nodesToSearch.forEach(element => {
            
            let def = element[0].default || undefined;

            if(def !== undefined && !s.has(def)){
                nodeArray.push(element[0]);
            }

            s.add(def);
            
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

    private getParentNodes(nodeList){
        let parentNodeNameList = [];
        for(let nodeCount = nodeList.length - 1; nodeCount >= 0; nodeCount--){
            parentNodeNameList.push(nodeList[nodeCount].value);
        }
        return parentNodeNameList;
    }

}