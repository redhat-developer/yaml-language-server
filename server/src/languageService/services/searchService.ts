
import {TextDocument, CompletionList} from 'vscode-languageserver-types';
import {JSONSchema} from "../jsonSchema";
import {YAMLDocument, YAMLNode, Kind} from 'yaml-ast-parser';
let AutoComplete = require('triesearch');

export class searchService {

    private schema: JSONSchema;
    private mappingTransformer;

    constructor(schema:JSONSchema){
        this.schema = schema;
    }

    public traverseKubernetesSchema(parentNodeList, node, returnEarlyForScalar, callback){

        let parentNodeFirst = parentNodeList[0];
        let parentList = this.getParentNodes(parentNodeList);  

        let nodesToSearch = [];
        let rootNodeList = [];
        for(let api_obj in this.schema.properties){
            //Kubernetes schema
            if(this.schema.properties[api_obj].hasOwnProperty("javatype")){
                //Kedge and normal schemas
                for(let prop in this.schema.properties[api_obj]["properties"]){
                    if(prop === parentList[0]){
                        nodesToSearch.push([this.schema.properties[api_obj]["properties"][prop]]);
                    }
                    rootNodeList.push(prop);
                } 
            }else{
                //Kedge and normal schemas

                if(api_obj === parentList[0]){
                    nodesToSearch.push([this.schema.properties[api_obj]]);
                }
                rootNodeList.push(api_obj);
                 
            }
        }

        if(parentNodeList.length === 0){
            let rootNodes = Array.from(new Set(rootNodeList));
            return callback([],[], rootNodes.map(x => ({
                label: x
            })));
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

            //This is when its an array
            if(currNode["items"] && currNode["items"]["properties"]){
                if(currNode["items"]["properties"][parentList[currNodePath.length]]){
                    let newNodePath = currNodePath.concat(currNode["items"]["properties"][parentList[currNodePath.length]]);
                    nodesToSearch.push(newNodePath);
                }               
            }

            //This means its an object
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